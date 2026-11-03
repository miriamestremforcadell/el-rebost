import { useMemo, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, type Product } from '../db'
import { inventoryInsights } from '../inventory'
import { RECIPES, matchRecipe, type Recipe, type RecipeMatch } from '../recipes'
import { todayISO } from '../talkual'
import { Empty, Field, Sheet, Title } from '../ui'

type Plan = Record<string, string>
const norm = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('ca').trim()
const mondayOf = (iso: string) => { const d = new Date(iso + 'T12:00:00'); const day = (d.getDay() + 6) % 7; d.setDate(d.getDate() - day); return d }
const dateKey = (d: Date) => [d.getFullYear(), String(d.getMonth()+1).padStart(2,'0'), String(d.getDate()).padStart(2,'0')].join('-')
const dateLabel = (iso: string) => new Date(iso + 'T12:00:00').toLocaleDateString('ca-ES', { weekday:'long', day:'numeric', month:'short' })
const fmtQty = (n: number) => Number(n.toFixed(2)).toLocaleString('ca-ES')

export default function Receptes() {
  const products = useLiveQuery(() => db.products.toArray(), [], [] as Product[])
  const movements = useLiveQuery(() => db.movements.toArray(), [], [])
  const planRow = useLiveQuery(() => db.settings.get('mealPlan'), [], undefined)
  const [mode, setMode] = useState<'avui'|'setmana'>('avui')
  const [selected, setSelected] = useState<Recipe | null>(null)
  const today = todayISO()
  const insights = inventoryInsights(products, movements, today)
  const expiringIds = useMemo(() => new Set(insights.expiry.map((x) => x.product.id)), [insights.expiry])
  const matches = useMemo(() => RECIPES.map((r) => matchRecipe(r, products, expiringIds)).sort((a,b) => b.score-a.score || a.recipe.minutes-b.recipe.minutes), [products, expiringIds])
  const plan = (planRow?.value && typeof planRow.value === 'object' ? planRow.value : {}) as Plan
  const weekStart = mondayOf(today)
  const week = Array.from({length:7}, (_,i) => { const d = new Date(weekStart); d.setDate(d.getDate()+i); return dateKey(d) })
  const planned = week.flatMap((day) => { const recipe = RECIPES.find((r) => r.id === plan[day]); return recipe ? [matchRecipe(recipe, products, expiringIds)] : [] })
  const weeklyMissing = new Map<string, { name:string; qty:number; unit:string }>()
  for (const match of planned) for (const m of match.matches) if (m.missing > 0) {
    const key = norm(m.ingredient.name) + '|' + m.ingredient.unit
    const old = weeklyMissing.get(key)
    weeklyMissing.set(key, { name:m.ingredient.name, qty:(old?.qty ?? 0)+m.missing, unit:m.ingredient.unit })
  }
  const savePlan = async (day: string, recipeId: string) => {
    await db.settings.put({ key:'mealPlan', value:{...plan, [day]:recipeId} })
  }
  const addMissing = async (items: {name:string;qty:number;unit:string}[]) => {
    let list = (await db.lists.toArray())[0]
    if (!list) { const id = await db.lists.add({ name:'La compra', createdAt:new Date().toISOString() }); list = {id, name:'La compra', createdAt:new Date().toISOString()} }
    const existing = await db.listItems.where('listId').equals(list.id!).toArray()
    const active = new Map(existing.filter((x) => !x.bought).map((x) => [norm(x.name)+'|'+x.unit, x]))
    let changed = 0
    for (const item of items) {
      const key = norm(item.name)+'|'+item.unit
      const old = active.get(key)
      if (old) await db.listItems.update(old.id!, { qty:old.qty+item.qty })
      else { const id = await db.listItems.add({listId:list.id!, name:item.name, qty:item.qty, unit:item.unit}); active.set(key,{id, listId:list.id!, name:item.name, qty:item.qty, unit:item.unit}); }
      changed++
    }
    alert(changed ? 'Ingredients pendents afegits a «'+list.name+'».' : 'No hi ha ingredients pendents.')
  }
  return <>
    <Title>Receptes i aprofitament</Title>
    <div className="mb-3 flex gap-2">
      <button className={mode==='avui'?'btn-p':'btn-s'} onClick={()=>setMode('avui')}>Què puc cuinar avui?</button>
      <button className={mode==='setmana'?'btn-p':'btn-s'} onClick={()=>setMode('setmana')}>Planifica la setmana</button>
    </div>
    {mode==='avui' ? <>
      <div className="card mb-3 text-sm"><b>Primer, el que caduca abans</b><p className="mt-1 text-mute">Ordenem les receptes segons els ingredients disponibles i donem prioritat als productes que tens a punt de caducar. Comprova sempre que els aliments siguin aptes per consumir.</p></div>
      {products.filter((p)=>p.qty>0).length===0 ? <Empty>Afegeix productes al rebost per rebre propostes de receptes amb els ingredients que tens.</Empty> : <div className="space-y-2">{matches.map((m)=> <RecipeCard key={m.recipe.id} match={m} onOpen={()=>setSelected(m.recipe)} />)}</div>}
    </> : <>
      <div className="card mb-3 text-sm"><b>Menú setmanal</b><p className="mt-1 text-mute">Tria una recepta per a cada dia. El pla es desa en aquest dispositiu i pots canviar-lo quan vulguis.</p></div>
      <div className="space-y-2">{week.map((day)=> <div key={day} className="card !p-3"><div className="mb-2 font-medium capitalize">{dateLabel(day)}</div><Field label="Recepta"><select className="!min-h-[40px]" value={plan[day]??''} onChange={(e)=>void savePlan(day,e.target.value)}><option value="">— Sense planificar —</option>{RECIPES.map((r)=><option key={r.id} value={r.id}>{r.emoji} {r.name}</option>)}</select></Field>{plan[day] && <p className="mt-1 text-xs text-mute">{matches.find((m)=>m.recipe.id===plan[day])?.availableCount ?? 0} ingredients complets · {matches.find((m)=>m.recipe.id===plan[day])?.missingCount ?? 0} pendents</p>}</div>)}</div>
      {planned.length>0 && <section className="card mt-3"><h2 className="font-semibold">Ingredients que falten</h2>{weeklyMissing.size===0 ? <p className="mt-2 text-sm text-mute">Tens tots els ingredients de les receptes planificades.</p> : <><ul className="mt-2 space-y-1 text-sm">{[...weeklyMissing.values()].map((x)=><li key={x.name+x.unit} className="flex justify-between gap-3"><span>{x.name}</span><b>{fmtQty(x.qty)} {x.unit}</b></li>)}</ul><button className="btn-p mt-3 w-full" onClick={()=>void addMissing([...weeklyMissing.values()])}>Afegeix els ingredients pendents a la compra</button></>}</section>}
    </>}
    {selected && <RecipeDetail recipe={selected} products={products} expiringIds={expiringIds} onClose={()=>setSelected(null)} onAdd={(items)=>void addMissing(items)} />}
  </>
}

function RecipeCard({match,onOpen}:{match:RecipeMatch;onOpen:()=>void}) {
  const missing = match.matches.filter((x)=>x.missing>0)
  return <button className="card w-full text-left" onClick={onOpen}><div className="flex items-start gap-3"><span className="text-3xl">{match.recipe.emoji}</span><div className="min-w-0 flex-1"><div className="font-semibold">{match.recipe.name}</div><div className="mt-1 text-xs text-mute">⏱ {match.recipe.minutes} min · {match.recipe.servings} racions · {match.availableCount}/{match.matches.length} ingredients disponibles</div>{match.expiringCount>0 && <div className="mt-1 text-xs font-medium text-warn">Aprofita {match.expiringCount} ingredient(s) que caduquen aviat</div>}{missing.length>0 && <div className="mt-1 text-xs text-mute">Et falta: {missing.map((x)=>x.ingredient.name).join(', ')}</div>}{missing.length===0 && <div className="mt-1 text-xs font-medium text-brand">La pots preparar amb el que tens</div>}</div><span className="text-mute">›</span></div></button>
}

function RecipeDetail({recipe,products,expiringIds,onClose,onAdd}:{recipe:Recipe;products:Product[];expiringIds:Set<number>;onClose:()=>void;onAdd:(items:{name:string;qty:number;unit:string}[])=>void}) {
  const match = matchRecipe(recipe,products,expiringIds)
  const missing = match.matches.filter((x)=>x.missing>0).map((x)=>({name:x.ingredient.name,qty:x.missing,unit:x.ingredient.unit}))
  return <Sheet title={recipe.name} onClose={onClose}><div className="space-y-3"><p className="text-sm text-mute">{recipe.description}</p><div className="flex gap-3 text-sm"><span>⏱ {recipe.minutes} min</span><span>🍽 {recipe.servings} racions</span></div><h3 className="font-semibold">Ingredients</h3><ul className="space-y-1 text-sm">{match.matches.map((x)=><li key={x.ingredient.name} className="flex justify-between gap-3"><span>{x.ingredient.name}{x.expiring ? ' · consumir aviat' : ''}</span><span className={x.missing>0?'text-warn':'text-brand'}>{x.missing>0?'Falten '+fmtQty(x.missing)+' '+x.ingredient.unit:'Disponible'}</span></li>)}</ul>{missing.length>0 && <button className="btn-p w-full" onClick={()=>onAdd(missing)}>Afegeix el que falta a la compra</button>}<h3 className="font-semibold">Preparació</h3><ol className="list-decimal space-y-2 pl-5 text-sm">{recipe.steps.map((s,i)=><li key={i}>{s}</li>)}</ol><div className="rounded-lg bg-page p-3 text-xs text-mute">Les quantitats són per a les racions indicades. Si tens un producte amb una unitat diferent, revisa’n la quantitat abans de comprar.</div></div></Sheet>
}
