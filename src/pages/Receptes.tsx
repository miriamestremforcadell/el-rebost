import { useEffect, useMemo, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, type Product } from '../db'
import { inventoryInsights } from '../inventory'
import { RECIPES, matchRecipe, missingIngredientsForRecipes, type Recipe, type RecipeMatch, type RecipeIngredient } from '../recipes'
import { recipeFromOcrText } from '../recipeImport'
import { readRecipeImages } from '../ocr'
import { todayISO } from '../talkual'
import { Empty, Field, Sheet, Title } from '../ui'

type Plan = Record<string, { dinar: string; sopar: string }>
const norm = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('ca').trim()
const mondayOf = (iso: string) => { const d = new Date(iso + 'T12:00:00'); const day = (d.getDay() + 6) % 7; d.setDate(d.getDate() - day); return d }
const dateKey = (d: Date) => [d.getFullYear(), String(d.getMonth()+1).padStart(2,'0'), String(d.getDate()).padStart(2,'0')].join('-')
const dateLabel = (iso: string) => new Date(iso + 'T12:00:00').toLocaleDateString('ca-ES', { weekday:'long', day:'numeric', month:'short' })
const fmtQty = (n: number) => Number(n.toFixed(2)).toLocaleString('ca-ES')
const emptyIngredient = (): RecipeIngredient => ({ name:'', qty:0, unit:'—' })

export default function Receptes() {
  const products = useLiveQuery(() => db.products.toArray(), [], [] as Product[])
  const movements = useLiveQuery(() => db.movements.toArray(), [], [])
  const planRow = useLiveQuery(() => db.settings.get('mealPlan'), [], undefined)
  const customRow = useLiveQuery(() => db.settings.get('customRecipes'), [], undefined)
  const customRecipes = Array.isArray(customRow?.value) ? customRow.value as Recipe[] : []
  const recipes = useMemo(() => [...RECIPES, ...customRecipes], [customRecipes])
  const [mode, setMode] = useState<'avui'|'setmana'>('avui')
  const [selected, setSelected] = useState<Recipe | null>(null)
  const [importOpen, setImportOpen] = useState(false)
  const today = todayISO()
  const insights = inventoryInsights(products, movements, today)
  const expiringIds = useMemo(() => new Set(insights.expiry.map((x) => x.product.id).filter((id): id is number => id !== undefined)), [insights.expiry])
  const matches = useMemo(() => recipes.map((r) => matchRecipe(r, products, expiringIds)).sort((a,b) => b.score-a.score || a.recipe.minutes-b.recipe.minutes), [recipes, products, expiringIds])
  const storedPlan = (planRow?.value && typeof planRow.value === 'object' ? planRow.value : {}) as Record<string, string | { dinar?: string; sopar?: string }>
  // Compatibilitat: les receptes planificades anteriorment per dia passen a ocupar el dinar.
  const plan: Plan = Object.fromEntries(Object.entries(storedPlan).map(([day, value]) => [day, typeof value === 'string' ? { dinar:value, sopar:'' } : { dinar:value.dinar ?? '', sopar:value.sopar ?? '' }]))
  const weekStart = mondayOf(today)
  const week = Array.from({length:7}, (_,i) => { const d = new Date(weekStart); d.setDate(d.getDate()+i); return dateKey(d) })
  const planned = week.flatMap((day) => [plan[day]?.dinar, plan[day]?.sopar].flatMap((id) => { const recipe = recipes.find((r) => r.id === id); return recipe ? [matchRecipe(recipe, products, expiringIds)] : [] }))
  const weeklyMissing = missingIngredientsForRecipes(planned.map((m) => m.recipe), products)
  const savePlan = async (day: string, meal: 'dinar' | 'sopar', recipeId: string) => {
    await db.settings.put({ key:'mealPlan', value:{...plan, [day]:{...plan[day], [meal]:recipeId}} })
  }
  const saveImportedRecipe = async (recipe: Recipe) => {
    const next = [...customRecipes.filter((item) => item.id !== recipe.id), recipe]
    await db.settings.put({ key:'customRecipes', value:next })
    setImportOpen(false)
    setSelected(recipe)
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
    <Title right={<button className="btn-p" onClick={()=>setImportOpen(true)}>＋ Importa recepta</button>}>Receptes i aprofitament</Title>
    <div className="mb-3 flex gap-2">
      <button className={mode==='avui'?'btn-p':'btn-s'} onClick={()=>setMode('avui')}>Què puc cuinar avui?</button>
      <button className={mode==='setmana'?'btn-p':'btn-s'} onClick={()=>setMode('setmana')}>Planifica la setmana</button>
    </div>
    {mode==='avui' ? <>
      <div className="card mb-3 text-sm"><b>Primer, el que caduca abans</b><p className="mt-1 text-mute">Ordenem les receptes segons els ingredients disponibles i donem prioritat als productes que tens a punt de caducar. Comprova sempre que els aliments siguin aptes per consumir.</p></div>
      {products.filter((p)=>p.qty>0).length===0 && customRecipes.length===0 ? <Empty>Afegeix productes al rebost per rebre propostes de receptes amb els ingredients que tens, o importa una recepta.</Empty> : <div className="space-y-2">{matches.map((m)=> <RecipeCard key={m.recipe.id} match={m} onOpen={()=>setSelected(m.recipe)} />)}</div>}
    </> : <>
      <div className="card mb-3 text-sm"><b>Menú setmanal</b><p className="mt-1 text-mute">Planifica dinars i sopars. El menú es desa en aquest dispositiu i pots modificar-lo quan vulguis.</p></div>
      <div className="space-y-2">{week.map((day)=> <div key={day} className="card !p-3"><div className="mb-3 font-medium capitalize">{dateLabel(day)}</div>{(['dinar','sopar'] as const).map((meal)=>{ const recipeId=plan[day]?.[meal]??''; const match=matches.find((m)=>m.recipe.id===recipeId); return <div key={meal} className={meal==='sopar'?'mt-3 border-t border-line pt-3':''}><Field label={meal==='dinar'?'☀️ Dinar':'🌙 Sopar'}><select className="!min-h-[40px]" value={recipeId} onChange={(e)=>void savePlan(day,meal,e.target.value)}><option value="">— Sense planificar —</option>{recipes.map((r)=><option key={r.id} value={r.id}>{r.emoji} {r.name}</option>)}</select></Field>{match && <p className="mt-1 text-xs text-mute">{match.availableCount} ingredients complets · {match.missingCount} pendents</p>}</div>})}</div>)}</div>
      {planned.length>0 && <section className="card mt-3"><h2 className="font-semibold">Ingredients que falten</h2>{weeklyMissing.length===0 ? <p className="mt-2 text-sm text-mute">Tens tots els ingredients de les receptes planificades.</p> : <><ul className="mt-2 space-y-1 text-sm">{weeklyMissing.map((x)=><li key={x.name+x.unit} className="flex justify-between gap-3"><span>{x.name}</span><b>{fmtQty(x.qty)} {x.unit}</b></li>)}</ul><button className="btn-p mt-3 w-full" onClick={()=>void addMissing([...weeklyMissing.values()])}>Afegeix els ingredients pendents a la compra</button></>}</section>}
    </>}
    {selected && <RecipeDetail recipe={selected} products={products} expiringIds={expiringIds} onClose={()=>setSelected(null)} onAdd={(items)=>void addMissing(items)} />}
    {importOpen && <RecipeImportSheet onClose={()=>setImportOpen(false)} onSave={(recipe)=>void saveImportedRecipe(recipe)} />}
  </>
}

function RecipeImportSheet({onClose,onSave}:{onClose:()=>void;onSave:(recipe:Recipe)=>void}) {
  const [files,setFiles] = useState<File[]>([])
  const [draft,setDraft] = useState<Recipe | null>(null)
  const [progress,setProgress] = useState(0)
  const [busy,setBusy] = useState(false)
  const [error,setError] = useState('')
  const update = (patch:Partial<Recipe>) => setDraft((current)=>current ? {...current,...patch} : current)
  const scan = async () => {
    setError(''); setBusy(true); setProgress(0)
    try {
      const result = await readRecipeImages(files,(value)=>setProgress(value))
      setDraft({...recipeFromOcrText(result.text,result.confidence),sourceFiles:files.map((file)=>file.name)})
    } catch (e) { setError(e instanceof Error ? e.message : 'No s’han pogut llegir les captures.') }
    finally { setBusy(false) }
  }
  const updateIngredient = (index:number,patch:Partial<RecipeIngredient>) => {
    if (!draft) return
    update({ingredients:draft.ingredients.map((item,i)=>i===index?{...item,...patch}:item)})
  }
  return <Sheet title="Importa una recepta" onClose={onClose}>
    <div className="space-y-3">
      <p className="text-sm text-mute">Puja fins a 8 captures. La lectura es fa al navegador: les imatges no s’envien a cap servei d’IA ni a cap API de receptes.</p>
      <Field label="Captures de pantalla">
        <input className="w-full text-sm" type="file" accept="image/*" multiple onChange={(e)=>{setFiles(Array.from(e.target.files||[]));setDraft(null);setError('')}} />
      </Field>
      {files.length>0 && <><p className="text-xs text-mute">{files.length} imatge(s): {files.map((file)=>file.name).join(', ')}</p><ImportImagePreviews files={files} /></>}
      <button className="btn-p w-full" disabled={!files.length||busy} onClick={()=>void scan()}>{busy?'Llegint captures…':'Llegeix les captures'}</button>
      {busy && <div className="h-2 overflow-hidden rounded-full bg-page"><div className="h-full bg-brand transition-all" style={{width:(progress*100)+'%'}} /></div>}
      {error && <p className="rounded-lg bg-red-50 p-2 text-sm text-red-700">{error}</p>}
      {draft && <>
        <div className="rounded-lg bg-page p-3 text-xs text-mute">Revisa el resultat: l’OCR pot confondre lletres, quantitats o unitats. El text no es tradueix automàticament; pots editar tots els camps en català abans de desar. Confiança de lectura aproximada: {Math.round(draft.ocrConfidence||0)}%.</div>
        <Field label="Nom de la recepta"><input className="w-full" value={draft.name} onChange={(e)=>update({name:e.target.value})} /></Field>
        <div className="grid grid-cols-2 gap-2"><Field label="Temps (minuts)"><input className="w-full" type="number" min="1" value={draft.minutes} onChange={(e)=>update({minutes:Math.max(1,Number(e.target.value)||1)})}/></Field><Field label="Racions"><input className="w-full" type="number" min="1" value={draft.servings} onChange={(e)=>update({servings:Math.max(1,Number(e.target.value)||1)})}/></Field></div>
        <Field label="Descripció"><textarea className="w-full" rows={2} value={draft.description} onChange={(e)=>update({description:e.target.value})}/></Field>
        <div className="flex items-center justify-between"><h3 className="font-semibold">Ingredients</h3><button className="btn-s text-sm" onClick={()=>update({ingredients:[...draft.ingredients,{...emptyIngredient()}]})}>＋ Afegeix</button></div>
        {draft.ingredients.map((item,index)=><div key={index} className="grid grid-cols-[minmax(0,1fr)_62px_92px_28px] items-end gap-1"><Field label={index===0?'Ingredient':''}><input className="w-full !px-2" value={item.name} placeholder="Ingredient" onChange={(e)=>updateIngredient(index,{name:e.target.value})}/></Field><Field label={index===0?'Quantitat':''}><input className="w-full !px-1" type="number" step="any" value={item.qty||''} placeholder="?" onChange={(e)=>updateIngredient(index,{qty:Math.max(0,Number(e.target.value)||0)})}/></Field><Field label={index===0?'Unitat':''}><input className="w-full !px-1" value={item.unit} onChange={(e)=>updateIngredient(index,{unit:e.target.value})}/></Field><button className="btn-g" aria-label="Elimina ingredient" onClick={()=>update({ingredients:draft.ingredients.filter((_,i)=>i!==index)})}>×</button></div>)}
        <p className="text-xs text-mute">Les quantitats marcades amb «?» o 0 no s’han pogut detectar: completa-les manualment.</p>
        <div className="flex items-center justify-between"><h3 className="font-semibold">Preparació</h3><button className="btn-s text-sm" onClick={()=>update({steps:[...draft.steps,'']})}>＋ Pas</button></div>
        {draft.steps.map((step,index)=><Field key={index} label={'Pas '+(index+1)}><div className="flex gap-1"><textarea className="w-full" rows={2} value={step} onChange={(e)=>update({steps:draft.steps.map((value,i)=>i===index?e.target.value:value)})}/><button className="btn-g" aria-label="Elimina pas" onClick={()=>update({steps:draft.steps.filter((_,i)=>i!==index)})}>×</button></div></Field>)}
        <details className="rounded-lg bg-page p-2"><summary className="cursor-pointer text-sm font-medium">Text original detectat</summary><textarea className="mt-2 w-full" rows={7} value={draft.sourceText||''} onChange={(e)=>update({sourceText:e.target.value})}/></details>
        <button className="btn-p w-full" disabled={!draft.name.trim()||!draft.ingredients.some((item)=>item.name.trim())} onClick={()=>onSave({...draft,name:draft.name.trim(),ingredients:draft.ingredients.filter((item)=>item.name.trim()),steps:draft.steps.map((step)=>step.trim()).filter(Boolean),sourceFiles:files.map((file)=>file.name),importedAt:draft.importedAt||new Date().toISOString()})}>Desa la recepta</button>
      </>}
    </div>
  </Sheet>
}

function RecipeCard({match,onOpen}:{match:RecipeMatch;onOpen:()=>void}) {
  const missing = match.matches.filter((x)=>x.missing>0)
  return <button className="card w-full text-left" onClick={onOpen}><div className="flex items-start gap-3"><span className="text-3xl">{match.recipe.emoji}</span><div className="min-w-0 flex-1"><div className="font-semibold">{match.recipe.name}</div><div className="mt-1 text-xs text-mute">⏱ {match.recipe.minutes} min · {match.recipe.servings} racions · {match.availableCount}/{match.matches.length} ingredients disponibles</div>{match.expiringCount>0 && <div className="mt-1 text-xs font-medium text-warn">Aprofita {match.expiringCount} ingredient(s) que caduquen aviat</div>}{missing.length>0 && <div className="mt-1 text-xs text-mute">Et falta: {missing.map((x)=>x.ingredient.name).join(', ')}</div>}{missing.length===0 && match.matches.some((x)=>x.ingredient.qty<=0) ? <div className="mt-1 text-xs text-warn">Revisa les quantitats d’alguns ingredients</div> : missing.length===0 && <div className="mt-1 text-xs font-medium text-brand">La pots preparar amb el que tens</div>}</div><span className="text-mute">›</span></div></button>
}

function RecipeDetail({recipe,products,expiringIds,onClose,onAdd}:{recipe:Recipe;products:Product[];expiringIds:Set<number>;onClose:()=>void;onAdd:(items:{name:string;qty:number;unit:string}[])=>void}) {
  const match = matchRecipe(recipe,products,expiringIds)
  const missing = match.matches.filter((x)=>x.missing>0).map((x)=>({name:x.ingredient.name,qty:x.missing,unit:x.ingredient.unit}))
  return <Sheet title={recipe.name} onClose={onClose}><div className="space-y-3"><p className="text-sm text-mute">{recipe.description}</p><div className="flex gap-3 text-sm"><span>⏱ {recipe.minutes} min</span><span>🍽 {recipe.servings} racions</span></div><h3 className="font-semibold">Ingredients</h3><ul className="space-y-1 text-sm">{match.matches.map((x)=><li key={x.ingredient.name} className="flex justify-between gap-3"><span>{x.ingredient.name}{x.expiring ? ' · consumir aviat' : ''}</span><span className={x.missing>0?'text-warn':'text-brand'}>{x.ingredient.qty<=0?'Quantitat pendent de revisar':x.missing>0?'Falten '+fmtQty(x.missing)+' '+x.ingredient.unit:'Disponible'}</span></li>)}</ul>{missing.length>0 && <button className="btn-p w-full" onClick={()=>onAdd(missing)}>Afegeix el que falta a la compra</button>}<h3 className="font-semibold">Preparació</h3><ol className="list-decimal space-y-2 pl-5 text-sm">{recipe.steps.map((s,i)=><li key={i}>{s}</li>)}</ol>{recipe.sourceFiles?.length ? <p className="text-xs text-mute">Importada de: {recipe.sourceFiles.join(', ')}</p> : null}<div className="rounded-lg bg-page p-3 text-xs text-mute">Les quantitats són per a les racions indicades. Si tens un producte amb una unitat diferent, revisa’n la quantitat abans de comprar.</div></div></Sheet>
}


function ImportImagePreviews({files}:{files:File[]}) {
  const [urls,setUrls] = useState<string[]>([])
  useEffect(() => {
    const next = files.map((file)=>URL.createObjectURL(file))
    setUrls(next)
    return () => next.forEach((url)=>URL.revokeObjectURL(url))
  }, [files])
  return <div className="grid grid-cols-3 gap-2">{urls.map((url,index)=><div key={url} className="overflow-hidden rounded-lg bg-page"><img src={url} alt={'Previsualització de '+files[index].name} className="h-28 w-full object-cover"/><p className="truncate px-1 py-1 text-[10px] text-mute">{files[index].name}</p></div>)}</div>
}
