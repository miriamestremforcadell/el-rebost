import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, UNITS, addProduct, findProduct, type ListItem, type Purchase } from '../db'
import { priceObservations } from '../stats'
import { Sheet, Field, Empty, Title, num } from '../ui'
import { eur } from '../talkual'

export default function Compra() {
  const lists = useLiveQuery(() => db.lists.toArray(), [], [])
  const [sel, setSel] = useState<number | undefined>()
  const [newName, setNewName] = useState('')
  const cur = lists.find((l) => l.id === sel) ?? lists[0]
  const items = useLiveQuery(() => (cur ? db.listItems.where('listId').equals(cur.id!).toArray() : []), [cur?.id], [] as ListItem[])
  const cats = useLiveQuery(() => db.categories.toArray(), [], [])
  const stores = useLiveQuery(() => db.stores.filter((s) => !s.archived).toArray(), [], [])
  const purchases = useLiveQuery(() => db.purchases.toArray(), [], [] as Purchase[])
  const [adding, setAdding] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const [group, setGroup] = useState<'categoria' | 'establiment'>('categoria')
  const [storeFilter, setStoreFilter] = useState<number | 'all' | 'none'>('all')
  const visibleItems = items.filter((i) => storeFilter === 'all' || (storeFilter === 'none' ? !i.storeId : i.storeId === storeFilter))
  const est = visibleItems.filter((i) => !i.bought).reduce((s, i) => s + (i.estPrice ?? 0) * i.qty, 0)
  const groups = new Map<string, ListItem[]>()
  for (const i of visibleItems) {
    const k = group === 'categoria' ? (cats.find((c) => c.id === i.categoryId)?.name ?? 'Sense categoria') : (stores.find((s) => s.id === i.storeId)?.name ?? 'Sense establiment')
    groups.set(k, [...(groups.get(k) ?? []), i])
  }
  return (
    <>
      <Title right={<button className="btn-p" onClick={() => setAdding(true)} disabled={!cur}>＋ Producte</button>}>Compra</Title>
      <div className="mb-3 flex gap-2 overflow-x-auto">
        {lists.map((l) => <button key={l.id} onClick={() => { setSel(l.id); setStoreFilter('all') }} className={cur?.id === l.id ? 'btn-p !min-h-[36px]' : 'btn-s !min-h-[36px]'}>{l.name}</button>)}
      </div>
      <form className="mb-4 flex gap-2" onSubmit={async (e) => { e.preventDefault(); if (!newName.trim()) return; const id = (await db.lists.add({ name: newName.trim(), createdAt: new Date().toISOString() })) as number; setSel(id); setNewName('') }}>
        <input placeholder={lists.length ? 'Nova llista…' : 'Crea la primera llista (ex.: Compra setmanal)'} value={newName} onChange={(e) => setNewName(e.target.value)} />
        <button className="btn-s">Crea</button>
      </form>
      {!cur && <Empty>Encara no tens cap llista de compra.</Empty>}
      {cur && (
        <>
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2 text-sm">
            <span className="text-mute">Cost estimat pendent: <b className="text-ink">{eur(est)}</b> <span className="text-xs">(preus orientatius)</span></span>
            <select className="!w-auto" value={group} onChange={(e) => setGroup(e.target.value as 'categoria' | 'establiment')} aria-label="Agrupa per"><option value="categoria">Per categoria</option><option value="establiment">Per establiment</option></select>
          </div>
          <div className="mb-3 flex gap-2 overflow-x-auto pb-1" aria-label="Filtra per establiment">
            <button className={storeFilter === 'all' ? 'btn-p !min-h-[36px]' : 'btn-s !min-h-[36px]'} onClick={() => setStoreFilter('all')}>Tots ({items.filter((i) => !i.bought).length})</button>
            {stores.map((store) => <button key={store.id} className={storeFilter === store.id ? 'btn-p !min-h-[36px]' : 'btn-s !min-h-[36px]'} onClick={() => setStoreFilter(store.id!)}>{store.name} ({items.filter((i) => i.storeId === store.id && !i.bought).length})</button>)}
            <button className={storeFilter === 'none' ? 'btn-p !min-h-[36px]' : 'btn-s !min-h-[36px]'} onClick={() => setStoreFilter('none')}>Sense establiment ({items.filter((i) => !i.storeId && !i.bought).length})</button>
          </div>
          {visibleItems.length === 0 && <Empty>{storeFilter === 'all' ? 'La llista és buida.' : 'No hi ha productes pendents en aquest establiment.'}</Empty>}
          {[...groups.entries()].map(([g, xs]) => (
            <section key={g} className="mb-4">
              <h2 className="mb-1 text-sm font-semibold text-mute">{g}</h2>
              <ul className="space-y-2">{xs.map((i) => (
                <li key={i.id} className="card flex items-center gap-3 !p-3">
                  <input type="checkbox" checked={!!i.bought} onChange={(e) => db.listItems.update(i.id!, { bought: e.target.checked })} aria-label={`Marca ${i.name} com a comprat`} />
                  <div className={`min-w-0 flex-1 ${i.bought ? 'line-through opacity-50' : ''}`}>
                    <div className="truncate font-medium">{i.name}</div>
                    <div className="text-xs text-mute">{i.qty} {i.unit}{i.note ? ` · ${i.note}` : ''}</div>
                    {!i.bought && <div className="mt-1 flex items-center gap-2 text-xs text-mute"><span>Preu/unitat €</span><input className="!w-24 !min-h-[32px] !py-1" inputMode="decimal" aria-label={`Preu estimat de ${i.name}`} value={i.estPrice ?? ''} placeholder="Sense preu" onChange={(e) => { const value = e.target.value.trim(); const price = value === '' ? undefined : num(value); if (price === undefined || (Number.isFinite(price) && price >= 0)) db.listItems.update(i.id!, { estPrice: price, estSource: price === undefined ? undefined : 'manual' }) }} />{i.estPrice !== undefined && <span>{eur(i.estPrice * i.qty)} total</span>}</div>}
                  </div>
                  <button className="btn-g !px-2" onClick={() => db.listItems.delete(i.id!)} aria-label={`Elimina ${i.name}`}>🗑</button>
                </li>))}
              </ul>
            </section>
          ))}
          <div className="mt-4 grid grid-cols-2 gap-2">
            <button className="btn-p" onClick={() => setConfirming(true)} disabled={!items.some((i) => i.bought)}>Confirma la compra</button>
            <button className="btn-s" onClick={async () => { const id = (await db.lists.add({ name: `${cur.name} (còpia)`, createdAt: new Date().toISOString() })) as number; await db.listItems.bulkAdd(items.map(({ id: _i, ...r }) => ({ ...r, listId: id, bought: false }))); setSel(id) }}>Reutilitza</button>
            <button className="btn-d col-span-2" onClick={async () => { if (confirm('Eliminar la llista sencera?')) { await db.listItems.where('listId').equals(cur.id!).delete(); await db.lists.delete(cur.id!); setSel(undefined) } }}>Elimina la llista</button>
          </div>
        </>
      )}
      {adding && cur && <AddItem listId={cur.id!} cats={cats} stores={stores} purchases={purchases} defaultStoreId={typeof storeFilter === 'number' ? storeFilter : undefined} onClose={() => setAdding(false)} />}
      {confirming && cur && <ConfirmBuy items={items.filter((i) => i.bought)} onClose={() => setConfirming(false)} />}
    </>
  )
}

function AddItem({ listId, cats, stores, purchases, defaultStoreId, onClose }: { listId: number; cats: { id?: number; name: string }[]; stores: { id?: number; name: string }[]; purchases: Purchase[]; defaultStoreId?: number; onClose: () => void }) {
  const [f, setF] = useState<Partial<ListItem>>({ qty: 1, unit: 'ud', storeId: defaultStoreId })
  const [warn, setWarn] = useState<string | null>(null)
  const set = (k: keyof ListItem, v: unknown) => setF((x) => ({ ...x, [k]: v }))
  const suggestions = useLiveQuery(() => db.products.toArray(), [], [])
  const save = async (force = false) => {
    if (!f.name?.trim()) return
    if (f.estPrice !== undefined && (!Number.isFinite(f.estPrice) || f.estPrice < 0)) { alert('El preu estimat ha de ser 0 € o superior.'); return }
    const have = await findProduct(f.name)
    if (have && have.qty > 0 && !force) { setWarn(`Ja tens ${have.qty} ${have.unit} de «${have.name}» a casa. Vols afegir-ne més igualment?`); return }
    let item = { ...f, listId, name: f.name.trim() } as ListItem
    const stores_ = await db.stores.toArray()
    const reviewed = purchases.filter((p) => p.status === 'Revisat' && p.lines.some((line) => line.name.trim().toLowerCase() === item.name.toLowerCase() && line.unit === item.unit && p.storeId))
    if (item.storeId === undefined && !defaultStoreId && reviewed.length) {
      const counts = new Map<number, { count: number; latest: string }>()
      for (const p of reviewed) { const sid = p.storeId!; const prev = counts.get(sid) ?? { count: 0, latest: '' }; counts.set(sid, { count: prev.count + 1, latest: p.date > prev.latest ? p.date : prev.latest }) }
      item.storeId = [...counts.entries()].sort((a, b) => b[1].count - a[1].count || b[1].latest.localeCompare(a[1].latest))[0]?.[0]
    }
    if (item.estPrice === undefined) {
      const obs = priceObservations(purchases, stores_).filter((o) => o.name === item.name.toLowerCase())
      const storeName = stores_.find((s) => s.id === item.storeId)?.name
      const matchingStore = storeName ? obs.filter((o) => o.storeName === storeName) : []
      const available = matchingStore.length ? matchingStore : obs
      const last = available[available.length - 1]
      if (last) { item = { ...item, estPrice: last.unitPrice, estSource: storeName && last.storeName === storeName ? 'última compra' : 'altre establiment' } }
    } else item.estSource = 'manual'
    await db.listItems.add(item)
    onClose()
  }
  return (
    <Sheet title="Afegeix a la llista" onClose={onClose}>
      <div className="space-y-3">
        <Field label="Producte"><input autoFocus list="habituals" value={f.name ?? ''} onChange={(e) => { set('name', e.target.value); setWarn(null) }} /></Field>
        <datalist id="habituals">{suggestions.map((p) => <option key={p.id} value={p.name} />)}</datalist>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Quantitat"><input inputMode="decimal" value={f.qty ?? ''} onChange={(e) => set('qty', num(e.target.value))} /></Field>
          <Field label="Unitat"><select value={f.unit} onChange={(e) => set('unit', e.target.value)}>{UNITS.map((u) => <option key={u}>{u}</option>)}</select></Field>
          <Field label="Categoria"><select value={f.categoryId ?? ''} onChange={(e) => set('categoryId', e.target.value ? Number(e.target.value) : undefined)}><option value="">—</option>{cats.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></Field>
          <Field label="Establiment"><select value={f.storeId ?? ''} onChange={(e) => set('storeId', e.target.value ? Number(e.target.value) : undefined)}><option value="">—</option>{stores.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></Field>
        </div>
        <Field label="Preu estimat per unitat (€, opcional)"><input inputMode="decimal" value={f.estPrice ?? ''} onChange={(e) => set('estPrice', e.target.value ? num(e.target.value) : undefined)} /></Field>
        <Field label="Notes"><input value={f.note ?? ''} onChange={(e) => set('note', e.target.value)} /></Field>
        {warn && <div className="card border-warn/50 text-sm"><p className="mb-2">{warn}</p><div className="flex gap-2"><button className="btn-p" onClick={() => save(true)}>Afegeix igualment</button><button className="btn-s" onClick={onClose}>Cancel·la</button></div></div>}
        {!warn && <button className="btn-p w-full" onClick={() => save()}>Afegeix</button>}
      </div>
    </Sheet>
  )
}

function ConfirmBuy({ items, onClose }: { items: ListItem[]; onClose: () => void }) {
  const locs = useLiveQuery(() => db.locations.toArray(), [], [])
  const [pick, setPick] = useState<Set<number>>(new Set(items.map((i) => i.id!)))
  const [loc, setLoc] = useState<number | undefined>()
  const [done, setDone] = useState(false)
  const run = async () => {
    for (const i of items.filter((x) => pick.has(x.id!))) {
      const have = await findProduct(i.name, i.unit)
      if (have) { await db.products.update(have.id!, { qty: have.qty + i.qty }); await db.movements.add({ productId: have.id!, ts: new Date().toISOString(), delta: i.qty, kind: 'compra', ref: `llista:${i.id}` }) }
      else await addProduct({ name: i.name, qty: i.qty, unit: i.unit, categoryId: i.categoryId, locationId: loc, price: i.estPrice }, 'compra', `llista:${i.id}`)
    }
    await db.listItems.bulkDelete(items.map((i) => i.id!))
    setDone(true)
  }
  return (
    <Sheet title="Confirma la compra" onClose={onClose}>
      {done ? <><p className="mb-3">Fet. Els productes seleccionats ja són al rebost.</p><button className="btn-p w-full" onClick={onClose}>Tanca</button></> : <>
        <p className="mb-3 text-sm text-mute">Marcar un producte com a comprat no vol dir que ja sigui a casa. Tria quins vols afegir al rebost; la resta es treuen de la llista igualment.</p>
        <ul className="mb-3 space-y-1">{items.map((i) => <li key={i.id}><label className="flex items-center gap-2"><input type="checkbox" checked={pick.has(i.id!)} onChange={(e) => { const n = new Set(pick); e.target.checked ? n.add(i.id!) : n.delete(i.id!); setPick(n) }} />{i.name} <span className="text-xs text-mute">{i.qty} {i.unit}</span></label></li>)}</ul>
        <Field label="Ubicació dels productes nous"><select value={loc ?? ''} onChange={(e) => setLoc(e.target.value ? Number(e.target.value) : undefined)}><option value="">—</option>{locs.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}</select></Field>
        <button className="btn-p mt-4 w-full" onClick={run}>Confirma i afegeix al rebost</button>
      </>}
    </Sheet>
  )
}
