import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, getSettings, setSetting, DEFAULT_SETTINGS, STORE_TYPES, UNITS, exportAll, importAll, ensureCycles } from '../db'
import { Sheet, Field, Title, num } from '../ui'
import Talkual from './Talkual'

type Sec = null | 'preferencies' | 'establiments' | 'talkual' | 'categories' | 'pressupostos' | 'inventari' | 'dades'
const SECS: [Sec, string, string][] = [
  ['preferencies', '🎨', 'Preferències'], ['establiments', '🏪', 'Proveïdors i establiments'], ['talkual', '📦', 'Talkual'],
  ['categories', '🏷', 'Categories'], ['pressupostos', '💶', 'Pressupostos'], ['inventari', '🫙', 'Inventari'], ['dades', '🔒', 'Dades i privacitat'],
]

export default function Configuracio() {
  const [sec, setSec] = useState<Sec>(null)
  if (sec === 'talkual') return <Talkual back={() => setSec(null)} />
  if (sec) return <><Title right={<button className="btn-g" onClick={() => setSec(null)}>← Enrere</button>}>{SECS.find((s) => s[0] === sec)![2]}</Title><Section sec={sec} /></>
  return (
    <>
      <Title>Configuració</Title>
      <ul className="space-y-2">{SECS.map(([id, ic, l]) => <li key={id}><button className="card flex w-full items-center gap-3 text-left" onClick={() => setSec(id)}><span className="text-xl">{ic}</span><span className="flex-1 font-medium">{l}</span><span className="text-mute">›</span></button></li>)}</ul>
      <p className="mt-6 text-center text-xs text-mute">El Rebost · versió 0.1</p>
    </>
  )
}

function Section({ sec }: { sec: Exclude<Sec, null | 'talkual'> }) {
  const s = useLiveQuery(getSettings, [], DEFAULT_SETTINGS)
  if (sec === 'preferencies') return (
    <div className="space-y-4">
      <div className="card"><label className="f">Tema</label><div className="grid grid-cols-3 gap-2">{([['auto', 'Automàtic'], ['clar', 'Clar'], ['fosc', 'Fosc']] as const).map(([k, l]) => <button key={k} className={s.theme === k ? 'btn-p' : 'btn-s'} onClick={() => setSetting('theme', k)} aria-pressed={s.theme === k}>{l}</button>)}</div><p className="mt-2 text-xs text-mute">Automàtic segueix l'aparença del dispositiu.</p></div>
      <div className="card"><Field label="Moneda"><input value="Euro (€)" disabled /></Field></div>
      <div className="card"><Field label="Format de data"><select value={s.dateFormat} onChange={(e) => setSetting('dateFormat', e.target.value)}><option value="llarg">dimarts, 20 octubre 2026</option><option value="curt">20/10/2026</option></select></Field></div>
      <div className="card text-sm"><label className="flex items-center gap-2"><input type="checkbox" checked={s.notifications} onChange={(e) => setSetting('notifications', e.target.checked)} />Avisos dins l'aplicació</label><p className="mt-1 text-xs text-mute">Les notificacions en segon pla a l'iPhone només funcionen amb la PWA afegida a la pantalla d'inici i requereixen un servei de notificacions push; encara no està configurat. Els avisos es mostren a Inici.</p></div>
    </div>
  )
  if (sec === 'pressupostos') return <Budgets s={s} />
  if (sec === 'inventari') return <InventoryCfg s={s} />
  if (sec === 'establiments') return <Stores />
  if (sec === 'categories') return <Categories />
  return <Data />
}

function Budgets({ s }: { s: typeof DEFAULT_SETTINGS }) {
  const cats = useLiveQuery(() => db.categories.filter((c) => !c.archived).toArray(), [], [])
  return (
    <div className="space-y-4">
      <div className="card space-y-3">
        <Field label="Pressupost mensual general (€)"><input inputMode="decimal" value={s.budgetMonthly || ''} onChange={(e) => setSetting('budgetMonthly', num(e.target.value))} /></Field>
        <div className="grid grid-cols-2 gap-3"><Field label="Primer avís (%)"><input inputMode="numeric" value={s.warn1} onChange={(e) => setSetting('warn1', num(e.target.value))} /></Field><Field label="Segon avís (%)"><input inputMode="numeric" value={s.warn2} onChange={(e) => setSetting('warn2', num(e.target.value))} /></Field></div>
        <p className="text-xs text-mute">Període de càlcul: mes natural. Les compres de Talkual hi compten segons els pagaments registrats.</p>
      </div>
      <div className="card"><h2 className="mb-2 font-semibold">Per categoria</h2><ul className="space-y-2">{cats.map((c) => <li key={c.id} className="flex items-center gap-2"><span className="flex-1 text-sm">{c.icon} {c.name}</span><input className="!w-24" inputMode="decimal" placeholder="€" value={s.budgetByCategory[String(c.id)] ?? ''} onChange={(e) => setSetting('budgetByCategory', { ...s.budgetByCategory, [String(c.id)]: num(e.target.value) })} /></li>)}</ul></div>
    </div>
  )
}

function InventoryCfg({ s }: { s: typeof DEFAULT_SETTINGS }) {
  const locs = useLiveQuery(() => db.locations.toArray(), [], [])
  const [n, setN] = useState('')
  return (
    <div className="space-y-4">
      <div className="card"><Field label="Avisa de la caducitat amb (dies)"><input inputMode="numeric" value={s.expiryDays} onChange={(e) => setSetting('expiryDays', num(e.target.value))} /></Field><p className="mt-1 text-xs text-mute">Només es mostren avisos de productes amb data registrada.</p></div>
      <div className="card"><h2 className="mb-2 font-semibold">Ubicacions</h2>
        <ul className="mb-3 space-y-2">{locs.map((l) => <li key={l.id} className="flex gap-2"><input defaultValue={l.name} onBlur={(e) => e.target.value.trim() && db.locations.update(l.id!, { name: e.target.value.trim() })} /><button className="btn-g" aria-label={`Elimina ${l.name}`} onClick={async () => { if ((await db.products.where('locationId').equals(l.id!).count()) > 0) return alert('Hi ha productes en aquesta ubicació. Mou-los abans d\'eliminar-la.'); db.locations.delete(l.id!) }}>🗑</button></li>)}</ul>
        <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); if (n.trim()) { db.locations.add({ name: n.trim() }); setN('') } }}><input placeholder="Nova ubicació" value={n} onChange={(e) => setN(e.target.value)} /><button className="btn-s">Afegeix</button></form></div>
      <div className="card text-sm text-mute">Unitats disponibles: {UNITS.join(', ')}. Les quantitats mínimes es defineixen a cada producte.</div>
    </div>
  )
}

function Stores() {
  const stores = useLiveQuery(() => db.stores.toArray(), [], [])
  const purchases = useLiveQuery(() => db.purchases.toArray(), [], [])
  const [edit, setEdit] = useState<{ id?: number; name: string; type: string; location?: string; notes?: string } | null>(null)
  const [hist, setHist] = useState<number | null>(null)
  return (
    <>
      <button className="btn-p mb-3" onClick={() => setEdit({ name: '', type: 'supermercat' })}>＋ Nou establiment</button>
      <ul className="space-y-2">{[...stores].sort((a, b) => Number(!!a.archived) - Number(!!b.archived) || a.name.localeCompare(b.name)).map((s) => (
        <li key={s.id} className={`card flex items-center gap-2 !p-3 ${s.archived ? 'opacity-60' : ''}`}>
          <button className="flex-1 text-left" onClick={() => setEdit(s)}><div className="font-medium">{s.name}</div><div className="text-xs text-mute">{s.type}{s.location ? ` · ${s.location}` : ''}{s.archived ? ' · arxivat' : ''}</div></button>
          <button className="btn-g !px-2 text-xs" onClick={() => setHist(s.id!)}>Compres</button>
          <button className="btn-g !px-2 text-xs" onClick={() => db.stores.update(s.id!, { archived: !s.archived })}>{s.archived ? 'Reactiva' : 'Arxiva'}</button>
        </li>))}</ul>
      {edit && <Sheet title={edit.id ? 'Edita l\'establiment' : 'Nou establiment'} onClose={() => setEdit(null)}><div className="space-y-3">
        <Field label="Nom"><input value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} /></Field>
        <Field label="Tipus"><select value={edit.type} onChange={(e) => setEdit({ ...edit, type: e.target.value })}>{STORE_TYPES.map((t) => <option key={t}>{t}</option>)}</select></Field>
        <Field label="Ubicació"><input value={edit.location ?? ''} onChange={(e) => setEdit({ ...edit, location: e.target.value })} /></Field>
        <Field label="Notes"><textarea rows={2} value={edit.notes ?? ''} onChange={(e) => setEdit({ ...edit, notes: e.target.value })} /></Field>
        <button className="btn-p w-full" disabled={!edit.name.trim()} onClick={async () => { await (edit.id ? db.stores.update(edit.id, edit) : db.stores.add(edit)); setEdit(null) }}>Desa</button></div></Sheet>}
      {hist !== null && <Sheet title="Historial de compres" onClose={() => setHist(null)}>{purchases.filter((p) => p.storeId === hist).length === 0 ? <p className="text-sm text-mute">Cap compra registrada.</p> : <ul className="divide-y divide-line text-sm">{purchases.filter((p) => p.storeId === hist).sort((a, b) => b.date.localeCompare(a.date)).map((p) => <li key={p.id} className="flex justify-between py-2"><span>{p.date}</span><b>{p.total.toFixed(2).replace('.', ',')} €</b></li>)}</ul>}</Sheet>}
    </>
  )
}

function Categories() {
  const cats = useLiveQuery(() => db.categories.toArray(), [], [])
  const [n, setN] = useState(''), [ic, setIc] = useState('📦')
  return (
    <>
      <form className="card mb-3 flex gap-2" onSubmit={(e) => { e.preventDefault(); if (n.trim()) { db.categories.add({ name: n.trim(), icon: ic || '📦' }); setN('') } }}><input className="!w-16 text-center" value={ic} onChange={(e) => setIc(e.target.value)} aria-label="Icona" /><input placeholder="Nova categoria" value={n} onChange={(e) => setN(e.target.value)} /><button className="btn-p">Afegeix</button></form>
      <ul className="space-y-2">{cats.map((c) => <li key={c.id} className={`card flex items-center gap-2 !p-2 ${c.archived ? 'opacity-50' : ''}`}><input className="!w-14 text-center" defaultValue={c.icon} onBlur={(e) => db.categories.update(c.id!, { icon: e.target.value })} aria-label="Icona" /><input defaultValue={c.name} onBlur={(e) => e.target.value.trim() && db.categories.update(c.id!, { name: e.target.value.trim() })} /><button className="btn-g !px-2 text-xs" onClick={() => db.categories.update(c.id!, { archived: !c.archived })}>{c.archived ? 'Reactiva' : 'Arxiva'}</button></li>)}</ul>
    </>
  )
}

function Data() {
  const s = useLiveQuery(getSettings, [], DEFAULT_SETTINGS)
  const [msg, setMsg] = useState('')
  const docs = useLiveQuery(() => db.docs.count(), [], 0)
  return (
    <div className="space-y-4">
      <div className="card text-sm"><h2 className="mb-1 font-semibold">Còpia de seguretat</h2><p className="mb-2 text-mute">Les dades només són en aquest dispositiu. Desa la còpia a iCloud Drive. La còpia inclou les dades, les fotos i els documents adjunts. Última còpia: {s.lastExport ? new Date(s.lastExport).toLocaleDateString('ca-ES') : 'mai'}.</p>
        <button className="btn-s" onClick={async () => { const blob = new Blob([JSON.stringify(await exportAll(), null, 2)], { type: 'application/json' }); const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `el-rebost-${new Date().toISOString().slice(0, 10)}.json`; a.click() }}>Descarrega la còpia</button>
        <label className="btn-s ml-2 cursor-pointer">Restaura una còpia<input type="file" accept="application/json,.json" className="hidden" onChange={async (e) => { const f = e.target.files?.[0]; e.target.value = ''; if (!f) return; try { const data = JSON.parse(await f.text()); if (!confirm('Restaurar substituirà TOTES les dades actuals per les de la còpia. Continuar?')) return; const r = await importAll(data); setMsg(`Còpia restaurada: ${r.products} productes, ${r.purchases} compres, ${r.cycles} cicles de Talkual i ${r.docs} documents adjunts.`) } catch (err) { setMsg((err as Error).message || 'No s\'ha pogut llegir el fitxer.') } }} /></label></div>
      <div className="card text-sm"><h2 className="mb-1 font-semibold">Documents</h2><p className="mb-2 text-mute">{docs} document(s) de tiquets desats al dispositiu.</p><button className="btn-d" disabled={!docs} onClick={async () => { if (confirm('Eliminar tots els documents adjunts? Els tiquets es mantenen.')) { await db.docs.clear(); await db.purchases.toCollection().modify({ docId: undefined }); setMsg('Documents eliminats.') } }}>Elimina els documents</button></div>
      <div className="card text-sm"><h2 className="mb-1 font-semibold">Serveis externs</h2><p className="text-mute">Aquesta versió no utilitza cap servei extern: les dades i els documents es queden només en aquest dispositiu. No s'envia res a serveis d'IA ni d'OCR. La sincronització amb el núvol (Supabase) i l'OCR estan pendents de configurar i s'avisarà abans d'activar-los.</p></div>
      <div className="card text-sm"><h2 className="mb-1 font-semibold">Esborra totes les dades</h2><button className="btn-d" onClick={async () => { if (confirm('Això elimina tot el contingut del dispositiu i no es pot desfer. Continuar?') && confirm('Segur?')) { await db.delete(); location.reload() } }}>Esborra-ho tot</button></div>
      {msg && <p className="text-sm text-brand">{msg}</p>}
    </div>
  )
}
export { ensureCycles }
