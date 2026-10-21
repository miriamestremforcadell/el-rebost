import { useEffect, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, UNITS, applyPurchaseToInventory, type Purchase, type PurchaseLine } from '../db'
import { Sheet, Field, Empty, Title, num, uid } from '../ui'
import { eur, todayISO, formatDate, r2 } from '../talkual'
import { readTicket } from '../ocr'

export default function Tiquets() {
  const purchases = useLiveQuery(() => db.purchases.orderBy('date').reverse().toArray(), [], [])
  const stores = useLiveQuery(() => db.stores.toArray(), [], [])
  const [form, setForm] = useState<{ file?: File } | null>(null)
  const [view, setView] = useState<Purchase | null>(null)
  const fileRef = (accept: string, capture?: boolean) => (
    <label className="btn-s cursor-pointer">
      <input type="file" accept={accept} {...(capture ? { capture: 'environment' as const } : {})} className="hidden" onChange={(e) => { const file = e.target.files?.[0]; if (file) setForm({ file }); e.target.value = '' }} />
      {capture ? '📷 Fotografia' : '🖼 Galeria / PDF'}
    </label>
  )
  return (
    <>
      <Title>Tiquets</Title>
      <div className="mb-4 flex flex-wrap gap-2">
        <button className="btn-p" onClick={() => setForm({})}>＋ Manual</button>
        {fileRef('image/*', true)}
        {fileRef('image/*,application/pdf')}
      </div>
      <p className="mb-4 text-xs text-mute">Pots llegir automàticament fotografies i PDFs. El resultat és una proposta: revisa sempre els camps i les línies abans de desar.</p>
      {purchases.length === 0 && <Empty>Encara no hi ha cap tiquet. Registra la primera compra.</Empty>}
      <ul className="space-y-2">{purchases.map((p) => (
        <li key={p.id}><button className="card flex w-full items-center justify-between text-left" onClick={() => setView(p)}>
          <div><div className="font-medium">{stores.find((s) => s.id === p.storeId)?.name ?? 'Sense establiment'}</div><div className="text-xs text-mute">{formatDate(p.date, false)} · {p.lines.length} línies {p.docId ? '· 📎' : ''}</div></div>
          <div className="text-right"><div className="font-semibold">{eur(p.total)}</div><span className={p.status === 'Revisat' ? 'chip' : 'chip-w'}>{p.status}</span></div>
        </button></li>))}
      </ul>
      {form && <TicketForm file={form.file} stores={stores} onClose={() => setForm(null)} />}
      {view && <TicketView p={view} onClose={() => setView(null)} />}
    </>
  )
}

function TicketForm({ file, stores, onClose }: { file?: File; stores: { id?: number; name: string; archived?: boolean }[]; onClose: () => void }) {
  const [storeId, setStoreId] = useState<number | undefined>()
  const [date, setDate] = useState(todayISO())
  const [total, setTotal] = useState('')
  const [discount, setDiscount] = useState('')
  const [lines, setLines] = useState<PurchaseLine[]>([{ id: uid(), name: '', qty: 1, unit: 'ud', amount: 0 }])
  const [unitPriceDrafts, setUnitPriceDrafts] = useState<Record<string, string>>({})
  const [dup, setDup] = useState(false)
  const [ocrState, setOcrState] = useState<'idle' | 'reading' | 'done' | 'error'>('idle')
  const [ocrProgress, setOcrProgress] = useState(0)
  const [ocrMessage, setOcrMessage] = useState('')
  const [ocrConfidence, setOcrConfidence] = useState<number | null>(null)
  const [ocrText, setOcrText] = useState('')
  const [savedId, setSavedId] = useState<number | null>(null)
  useEffect(() => {
    let cancelled = false
    if (!file) { setOcrState('idle'); setOcrMessage(''); return }
    setOcrState('reading')
    setOcrProgress(0)
    setOcrMessage('Preparant el lector…')
    setOcrConfidence(null)
    readTicket(file, (progress) => {
      if (!cancelled) { setOcrProgress(Math.round(progress * 100)); setOcrMessage(`Llegint el document… ${Math.round(progress * 100)}%`) }
    }).then((result) => {
      if (cancelled) return
      setOcrText(result.text)
      if (result.date) setDate(result.date)
      if (result.total !== undefined) setTotal(String(result.total))
      if (result.lines.length) setLines(result.lines.map((line) => ({ id: uid(), name: line.name, qty: 1, unit: 'ud', amount: line.amount })))
      setOcrConfidence(result.confidence)
      setOcrState('done')
      setOcrMessage(result.lines.length ? `Lectura acabada: ${result.lines.length} línies detectades. Revisa-les totes abans de desar.` : 'Text llegit, però no s’han pogut identificar les línies amb prou seguretat. Completa-les manualment.')
    }).catch((error: unknown) => {
      if (cancelled) return
      setOcrState('error')
      setOcrMessage(error instanceof Error ? error.message : 'No s’ha pogut llegir el document. Pots introduir les dades manualment.')
    })
    return () => { cancelled = true }
  }, [file])
  const sum = r2(lines.reduce((s, l) => s + l.amount, 0))
  const expected = r2(sum - num(discount))
  const diff = total ? r2(num(total) - expected) : 0
  const setLine = (id: string, patch: Partial<PurchaseLine>) => setLines((ls) => ls.map((l) => { if (l.id !== id) return l; const n = { ...l, ...patch }; if (('qty' in patch || 'unitPrice' in patch) && n.unitPrice !== undefined) n.amount = r2(n.qty * n.unitPrice); return n }))

  const save = async (ignoreDup = false) => {
    const t = num(total)
    if (!ignoreDup) {
      const same = await db.purchases.where('date').equals(date).filter((p) => p.storeId === storeId && Math.abs(p.total - t) < 0.005).count()
      if (same) { setDup(true); return }
    }
    let docId: number | undefined
    if (file) docId = (await db.docs.add({ name: file.name, type: file.type, blob: file, createdAt: new Date().toISOString() })) as number
    const clean = lines.filter((l) => l.name.trim())
    const id = (await db.purchases.add({ storeId, date, total: t, discount: num(discount), lines: clean, docId, status: 'Revisat', source: file ? (file.type === 'application/pdf' ? 'pdf' : 'foto') : 'manual', createdAt: new Date().toISOString() })) as number
    setSavedId(id)
  }
  if (savedId !== null) return <OfferInventory purchaseId={savedId} onClose={onClose} />
  return (
    <Sheet title="Nou tiquet" onClose={onClose}>
      <div className="space-y-3">
        {file && <p className="card !p-2 text-xs">📎 {file.name} (s'adjuntarà al tiquet)</p>}
        {file && <div className="card !p-3 text-sm">
          <p className="font-semibold">{ocrState === 'reading' ? 'Lectura automàtica en curs' : ocrState === 'done' ? 'Lectura automàtica completada' : ocrState === 'error' ? 'No s’ha pogut completar la lectura' : 'Preparant lectura'}</p>
          {ocrState === 'reading' && <div className="my-2 h-2 overflow-hidden rounded bg-line"><div className="h-full bg-brand transition-all" style={{ width: `${ocrProgress}%` }} /></div>}
          <p className="mt-1 text-mute">{ocrMessage}</p>
          {ocrConfidence !== null && <p className="mt-1 text-xs text-mute">Confiança mitjana OCR: {Math.round(ocrConfidence)}%. No és una garantia de precisió.</p>}
          {ocrState === 'done' && <p className="mt-2 text-xs">Les dades detectades són editables. Comprova especialment l’establiment, la data, l’import i les quantitats. La lectura s’executa al dispositiu; el motor OCR es descarrega des d’un CDN públic.</p>}
          {ocrState === 'done' && ocrText && <details className="mt-2"><summary className="cursor-pointer text-xs font-medium">Mostra el text llegit per l’OCR</summary><pre className="mt-2 max-h-40 overflow-auto whitespace-pre-wrap rounded bg-page p-2 text-xs">{ocrText}</pre></details>}
          {ocrState === 'error' && <button type="button" className="btn-s mt-2" onClick={() => { setOcrState('idle'); setOcrMessage('Pots continuar introduint les dades manualment.') }}>Continuar manualment</button>}
        </div>}
        <div className="grid grid-cols-2 gap-3">
          <Field label="Establiment"><select value={storeId ?? ''} onChange={(e) => setStoreId(e.target.value ? Number(e.target.value) : undefined)}><option value="">—</option>{stores.filter((s) => !s.archived).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></Field>
          <Field label="Data"><input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></Field>
          <Field label="Import total (€)"><input inputMode="decimal" value={total} onChange={(e) => { setTotal(e.target.value); setDup(false) }} /></Field>
          <Field label="Descomptes (€)"><input inputMode="decimal" value={discount} onChange={(e) => setDiscount(e.target.value)} /></Field>
        </div>
        <h3 className="text-sm font-semibold">Línies</h3>
        {lines.map((l) => (
          <div key={l.id} className="card space-y-2 !p-3">
            <input placeholder="Producte" value={l.name} onChange={(e) => setLine(l.id, { name: e.target.value })} />
            <div className="grid grid-cols-4 gap-2">
              <input inputMode="decimal" aria-label="Quantitat" placeholder="Qt." value={l.qty || ''} onChange={(e) => setLine(l.id, { qty: num(e.target.value) })} />
              <select aria-label="Unitat" value={l.unit} onChange={(e) => setLine(l.id, { unit: e.target.value })}>{UNITS.map((u) => <option key={u}>{u}</option>)}</select>
              <input inputMode="decimal" aria-label="Preu unitari" placeholder="€/u" value={unitPriceDrafts[l.id] ?? (l.unitPrice ?? '')} onChange={(e) => setUnitPriceDrafts((drafts) => ({ ...drafts, [l.id]: e.target.value }))} onBlur={() => { const raw = unitPriceDrafts[l.id]; if (raw === undefined) return; setLine(l.id, { unitPrice: raw.trim() ? num(raw) : undefined }); setUnitPriceDrafts((drafts) => { const next = { ...drafts }; delete next[l.id]; return next }) }} />
              <input inputMode="decimal" aria-label="Import" placeholder="Import" value={l.amount || ''} onChange={(e) => setLine(l.id, { amount: num(e.target.value) })} />
            </div>
          </div>
        ))}
        <div className="flex gap-2"><button className="btn-s" onClick={() => setLines((ls) => [...ls, { id: uid(), name: '', qty: 1, unit: 'ud', amount: 0 }])}>＋ Línia</button></div>
        <div className="text-sm">Suma de línies: <b>{eur(sum)}</b> · Esperat: <b>{eur(expected)}</b>
          {total && Math.abs(diff) > 0.005 && <p className="mt-1 rounded-lg bg-sand/25 p-2 text-warn">El total introduït difereix {eur(diff)} de la suma de línies. Revisa'l abans de desar.</p>}
          {total && Math.abs(diff) <= 0.005 && <p className="mt-1 text-brand">Els totals quadren.</p>}</div>
        {dup && <div className="card border-warn/50 text-sm"><p className="mb-2">Ja hi ha un tiquet del mateix establiment, data i import. És un duplicat?</p><div className="flex gap-2"><button className="btn-p" onClick={() => save(true)}>Desa igualment</button><button className="btn-s" onClick={onClose}>Cancel·la</button></div></div>}
        {!dup && <button className="btn-p w-full" disabled={!total} onClick={() => save()}>Revisat: confirma i desa</button>}
      </div>
    </Sheet>
  )
}

function OfferInventory({ purchaseId, onClose }: { purchaseId: number; onClose: () => void }) {
  const p = useLiveQuery(() => db.purchases.get(purchaseId))
  const locs = useLiveQuery(() => db.locations.toArray(), [], [])
  const [pick, setPick] = useState<Set<string>>(new Set())
  const [loc, setLoc] = useState<number | undefined>()
  if (!p) return null
  return (
    <Sheet title="Afegeix al rebost?" onClose={onClose}>
      <p className="mb-3 text-sm text-mute">El tiquet s'ha desat. L'inventari no s'actualitza fins que ho confirmis aquí.</p>
      <ul className="mb-3 space-y-1">{p.lines.map((l) => <li key={l.id}><label className="flex items-center gap-2"><input type="checkbox" checked={pick.has(l.id)} onChange={(e) => { const n = new Set(pick); e.target.checked ? n.add(l.id) : n.delete(l.id); setPick(n) }} />{l.name} <span className="text-xs text-mute">{l.qty} {l.unit}</span></label></li>)}</ul>
      <Field label="Ubicació"><select value={loc ?? ''} onChange={(e) => setLoc(e.target.value ? Number(e.target.value) : undefined)}><option value="">—</option>{locs.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}</select></Field>
      <div className="mt-4 grid grid-cols-2 gap-2">
        <button className="btn-p" disabled={pick.size === 0} onClick={async () => { await applyPurchaseToInventory(purchaseId, [...pick], loc); onClose() }}>Afegeix-los</button>
        <button className="btn-s" onClick={onClose}>Ara no</button>
      </div>
    </Sheet>
  )
}

function TicketView({ p, onClose }: { p: Purchase; onClose: () => void }) {
  const [url, setUrl] = useState<string | null>(null)
  const [type, setType] = useState('')
  const open = async () => { if (!p.docId) return; const d = await db.docs.get(p.docId); if (d) { setType(d.type); setUrl(URL.createObjectURL(d.blob)) } }
  return (
    <Sheet title={`Tiquet · ${formatDate(p.date, false)}`} onClose={onClose}>
      <ul className="mb-3 divide-y divide-line text-sm">{p.lines.map((l) => <li key={l.id} className="flex justify-between py-1.5"><span>{l.name} <span className="text-mute">{l.qty} {l.unit}</span></span><b>{eur(l.amount)}</b></li>)}</ul>
      {p.discount > 0 && <p className="text-sm">Descomptes: −{eur(p.discount)}</p>}
      <p className="mb-3 font-semibold">Total: {eur(p.total)}</p>
      {p.docId && !url && <button className="btn-s mb-3" onClick={open}>Mostra el document original</button>}
      {url && (type === 'application/pdf' ? <a className="btn-s mb-3" href={url} target="_blank" rel="noreferrer">Obre el PDF</a> : <img src={url} alt="Tiquet original" className="mb-3 rounded-xl" />)}
      {!p.inventoryAdded && p.lines.length > 0 && <p className="mb-2 text-xs text-mute">Aquest tiquet encara no ha afegit res al rebost.</p>}
      <button className="btn-d w-full" onClick={async () => { if (confirm('Eliminar el tiquet? Els moviments d\'inventari ja registrats es mantenen.')) { if (p.docId) await db.docs.delete(p.docId); await db.purchases.delete(p.id!); onClose() } }}>Elimina el tiquet</button>
    </Sheet>
  )
}
export { UNITS }
