import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, addProduct, adjustStock, UNITS, getSettings, DEFAULT_SETTINGS, type Product } from '../db'
import { Sheet, Field, Empty, Title, num } from '../ui'
import { todayISO, parseISO, formatDate } from '../talkual'

export const daysTo = (iso?: string) => iso ? Math.round((parseISO(iso).getTime() - parseISO(todayISO()).getTime()) / 86400000) : undefined

export default function Rebost() {
  const products = useLiveQuery(() => db.products.toArray(), [], [] as Product[])
  const locs = useLiveQuery(() => db.locations.toArray(), [], [])
  const cats = useLiveQuery(() => db.categories.filter((c) => !c.archived).toArray(), [], [])
  const settings = useLiveQuery(getSettings, [], DEFAULT_SETTINGS)
  const [q, setQ] = useState('')
  const [edit, setEdit] = useState<Partial<Product> | null>(null)
  const [detail, setDetail] = useState<Product | null>(null)
  const [view, setView] = useState<'ubicacio' | 'reposar' | 'caduca'>('ubicacio')

  const filt = products.filter((p) => (p.name + (p.brand ?? '')).toLowerCase().includes(q.toLowerCase()))
  const low = (p: Product) => p.min !== undefined && p.min > 0 && p.qty <= p.min
  const soon = (p: Product) => { const d = daysTo(p.expiry); return d !== undefined && d <= settings.expiryDays && p.qty > 0 }
  const shown = view === 'reposar' ? filt.filter(low) : view === 'caduca' ? filt.filter(soon).sort((a, b) => (a.expiry! > b.expiry! ? 1 : -1)) : filt
  const groups = view === 'ubicacio' ? [...locs.map((l) => ({ id: l.id, name: l.name })), { id: undefined, name: 'Sense ubicació' }] : [{ id: -1, name: view === 'reposar' ? 'Pendents de reposició' : 'Caduquen aviat' }]

  return (
    <>
      <Title right={<button className="btn-p" onClick={() => setEdit({ unit: 'ud', qty: 1, boughtAt: todayISO() })}>＋ Afegeix</button>}>El meu rebost</Title>
      <input placeholder="Cerca un producte…" value={q} onChange={(e) => setQ(e.target.value)} className="mb-3" aria-label="Cerca" />
      <div className="mb-4 flex gap-2 overflow-x-auto">
        {([['ubicacio', 'Per ubicació'], ['reposar', `A reposar (${products.filter(low).length})`], ['caduca', `Caduquen (${products.filter(soon).length})`]] as const).map(([k, l]) => (
          <button key={k} onClick={() => setView(k)} className={view === k ? 'btn-p !min-h-[36px]' : 'btn-s !min-h-[36px]'}>{l}</button>
        ))}
      </div>
      {products.length === 0 && <Empty>El rebost és buit. Afegeix els primers productes o registra una caixa de Talkual rebuda.</Empty>}
      {groups.map((g) => {
        const items = view === 'ubicacio' ? shown.filter((p) => p.locationId === g.id) : shown
        if (!items.length) return null
        return (
          <section key={String(g.id)} className="mb-5">
            <h2 className="mb-2 text-sm font-semibold text-mute">{g.name}</h2>
            <ul className="space-y-2">
              {items.map((p) => {
                const d = daysTo(p.expiry)
                return (
                  <li key={p.id} className="card flex items-center gap-3 !p-3">
                    <button className="min-w-0 flex-1 text-left" onClick={() => setDetail(p)}>
                      <div className="truncate font-medium">{p.name}{p.brand && <span className="text-mute"> · {p.brand}</span>}</div>
                      <div className="mt-0.5 flex flex-wrap gap-1 text-xs text-mute">
                        {low(p) && <span className="chip-w">A reposar</span>}
                        {d !== undefined && d <= settings.expiryDays && p.qty > 0 && <span className={d < 0 ? 'chip-b' : 'chip-w'}>{d < 0 ? 'Caducat' : d === 0 ? 'Caduca avui' : `Caduca en ${d} d`}</span>}
                        {p.expiry && d !== undefined && d > settings.expiryDays && <span>Fins {formatDate(p.expiry, false)}</span>}
                      </div>
                    </button>
                    <div className="flex items-center gap-1">
                      <button className="btn-s !min-w-[40px] !px-0" onClick={() => adjustStock(p.id!, -1, 'consum')} disabled={p.qty <= 0} aria-label={`Consumeix una unitat de ${p.name}`}>−</button>
                      <div className="w-14 text-center text-sm font-semibold">{p.qty}<div className="text-[10px] font-normal text-mute">{p.unit}</div></div>
                      <button className="btn-s !min-w-[40px] !px-0" onClick={() => adjustStock(p.id!, 1, 'manual')} aria-label={`Afegeix una unitat de ${p.name}`}>＋</button>
                    </div>
                  </li>
                )
              })}
            </ul>
          </section>
        )
      })}
      {edit && <ProductForm initial={edit} locs={locs} cats={cats} onClose={() => setEdit(null)} />}
      {detail && <Detail p={products.find((x) => x.id === detail.id) ?? detail} onClose={() => setDetail(null)} onEdit={(p) => { setDetail(null); setEdit(p) }} />}
    </>
  )
}

function ProductForm({ initial, locs, cats, onClose }: { initial: Partial<Product>; locs: { id?: number; name: string }[]; cats: { id?: number; name: string; icon: string }[]; onClose: () => void }) {
  const [f, setF] = useState<Partial<Product>>(initial)
  const [more, setMore] = useState(!!(initial.id))
  const set = (k: keyof Product, v: unknown) => setF((x) => ({ ...x, [k]: v }))
  const save = async () => {
    if (!f.name?.trim()) return
    if (f.price !== undefined && (!Number.isFinite(f.price) || f.price < 0)) { alert('El preu ha de ser 0 € o superior.'); return }
    const data = { ...f, name: f.name.trim(), qty: f.qty ?? 0, unit: f.unit ?? 'ud' } as Product
    if (f.id) {
      const old = await db.products.get(f.id)
      await db.products.put(data)
      if (old && old.qty !== data.qty) await db.movements.add({ productId: f.id, ts: new Date().toISOString(), delta: data.qty - old.qty, kind: 'correcció' })
    } else await addProduct(data)
    onClose()
  }
  return (
    <Sheet title={f.id ? 'Edita el producte' : 'Nou producte'} onClose={onClose}>
      <div className="space-y-3">
        <Field label="Nom"><input autoFocus value={f.name ?? ''} onChange={(e) => set('name', e.target.value)} placeholder="Ex.: Pasta macarrons" /></Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Quantitat"><input inputMode="decimal" value={f.qty ?? ''} onChange={(e) => set('qty', num(e.target.value))} /></Field>
          <Field label="Unitat"><select value={f.unit} onChange={(e) => set('unit', e.target.value)}>{UNITS.map((u) => <option key={u}>{u}</option>)}</select></Field>
        </div>
        <Field label="Ubicació"><select value={f.locationId ?? ''} onChange={(e) => set('locationId', e.target.value ? Number(e.target.value) : undefined)}><option value="">—</option>{locs.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}</select></Field>
        <button className="btn-g" onClick={() => setMore(!more)}>{more ? 'Menys camps' : 'Més camps (opcionals)'}</button>
        {more && <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Marca"><input value={f.brand ?? ''} onChange={(e) => set('brand', e.target.value)} /></Field>
            <Field label="Format"><input value={f.format ?? ''} onChange={(e) => set('format', e.target.value)} placeholder="500 g" /></Field>
          </div>
          <Field label="Categoria"><select value={f.categoryId ?? ''} onChange={(e) => set('categoryId', e.target.value ? Number(e.target.value) : undefined)}><option value="">—</option>{cats.map((c) => <option key={c.id} value={c.id}>{c.icon} {c.name}</option>)}</select></Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Data de compra"><input type="date" value={f.boughtAt ?? ''} onChange={(e) => set('boughtAt', e.target.value)} /></Field>
            <Field label="Data d'obertura"><input type="date" value={f.openedAt ?? ''} onChange={(e) => set('openedAt', e.target.value)} /></Field>
            <Field label="Caducitat / consum preferent"><input type="date" value={f.expiry ?? ''} onChange={(e) => set('expiry', e.target.value)} /></Field>
            <Field label="Quantitat mínima"><input inputMode="decimal" value={f.min ?? ''} onChange={(e) => set('min', e.target.value ? num(e.target.value) : undefined)} /></Field>
          </div>
          <Field label="Preu de compra (€)"><input inputMode="decimal" value={f.price ?? ''} onChange={(e) => set('price', e.target.value ? num(e.target.value) : undefined)} /></Field>
          <Field label="Notes"><textarea rows={2} value={f.notes ?? ''} onChange={(e) => set('notes', e.target.value)} /></Field>
        </div>}
        <button className="btn-p w-full" onClick={save} disabled={!f.name?.trim()}>Desa</button>
      </div>
    </Sheet>
  )
}

function Detail({ p, onClose, onEdit }: { p: Product; onClose: () => void; onEdit: (p: Product) => void }) {
  const moves = useLiveQuery(() => db.movements.where('productId').equals(p.id!).reverse().sortBy('ts'), [p.id], [])
  const lists = useLiveQuery(() => db.lists.toArray(), [], [])
  const [msg, setMsg] = useState('')
  const addToList = async () => {
    let l = lists[0]
    if (!l) { const id = (await db.lists.add({ name: 'La compra', createdAt: new Date().toISOString() })) as number; l = { id, name: 'La compra', createdAt: '' } }
    await db.listItems.add({ listId: l.id!, name: p.name, qty: Math.max(1, (p.min ?? 1) * 2 - p.qty), unit: p.unit, categoryId: p.categoryId })
    setMsg(`Afegit a «${l.name}».`)
  }
  return (
    <Sheet title={p.name} onClose={onClose}>
      <p className="mb-3 text-sm text-mute">Disponible: <b className="text-ink">{p.qty} {p.unit}</b>{p.min ? ` · mínim ${p.min}` : ''}</p>
      <div className="mb-3 grid grid-cols-2 gap-2">
        <button className="btn-s" onClick={() => adjustStock(p.id!, -p.qty, 'malmès', { note: 'Retirat per malmès' })} disabled={p.qty <= 0}>Retira malmès</button>
        <button className="btn-s" onClick={addToList}>Afegeix a la compra</button>
        <button className="btn-s" onClick={() => onEdit(p)}>Edita</button>
        <button className="btn-d" onClick={async () => { if (confirm('Segur que vols eliminar el producte?')) { await db.products.delete(p.id!); await db.movements.where('productId').equals(p.id!).delete(); onClose() } }}>Elimina</button>
      </div>
      {msg && <p className="mb-2 text-sm text-brand">{msg}</p>}
      <h3 className="mb-1 text-sm font-semibold">Historial de moviments</h3>
      {moves.length === 0 ? <p className="text-sm text-mute">Encara no hi ha moviments.</p> : (
        <ul className="divide-y divide-line text-sm">{moves.map((m) => <li key={m.id} className="flex justify-between py-1.5"><span>{m.kind}{m.note ? ` · ${m.note}` : ''}<span className="ml-2 text-xs text-mute">{new Date(m.ts).toLocaleDateString('ca-ES')}</span></span><b className={m.delta < 0 ? 'text-bad' : 'text-brand'}>{m.delta > 0 ? '+' : ''}{m.delta}</b></li>)}</ul>
      )}
    </Sheet>
  )
}
