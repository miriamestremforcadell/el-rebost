import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, applyReception, revertReception, saveCycle, getSettings, DEFAULT_SETTINGS, UNITS, ensureCycles } from '../db'
import { type Cycle, DELIVERY_STATUSES, PAYMENT_STATUSES, cycleTotal, extrasTotal, extraLineAmount, chargeDifference, cancelCycle, formatDate, eur, todayISO, talkualStats, addDays } from '../talkual'
import { Sheet, Field, Title, num, uid } from '../ui'

const tone = (s: string) => (s === 'Rebut' || s === 'Pagat' ? 'chip' : s === 'Anul·lat' || s === 'Incidència' || s === 'No efectuat' ? 'chip-b' : 'chip-w')

export default function Talkual({ back }: { back: () => void }) {
  const cycles = useLiveQuery(() => db.cycles.orderBy('deliveryPlanned').toArray(), [], [])
  const s = useLiveQuery(getSettings, [], DEFAULT_SETTINGS)
  const [open, setOpen] = useState<string | null>(null)
  const st = talkualStats(cycles)
  const cur = cycles.find((c) => c.id === open)
  return (
    <>
      <Title right={<button className="btn-g" onClick={back}>← Enrere</button>}>Talkual</Title>
      <div className="card mb-3 text-sm">
        <p>Caixa petita de fruita i verdura · cada {s.tkStep} dies · lliurament habitual en dimarts, pagament el diumenge anterior · base <b>{eur(s.tkBase)}</b>.</p>
        <p className="mt-1 text-xs text-mute">Rebudes: {st.received} · Anul·lades: {st.cancelled} · Despesa real: {eur(st.totalSpend)}. Les dates futures són previstes, no confirmades.</p>
      </div>
      <ul className="space-y-2">{cycles.map((c) => (
        <li key={c.id}><button className="card w-full text-left" onClick={() => setOpen(c.id)}>
          <div className="flex items-start justify-between gap-2">
            <div><div className="font-medium">{formatDate(c.deliveryReal ?? c.deliveryPlanned)}</div><div className="text-xs text-mute">Pagament {formatDate(c.paymentReal ?? c.paymentPlanned, false)}</div></div>
            <div className="text-right"><div className="font-semibold">{eur(c.paidAmount ?? cycleTotal(c))}</div></div>
          </div>
          <div className="mt-2 flex flex-wrap gap-1"><span className={tone(c.deliveryStatus)}>Lliurament: {c.deliveryStatus}</span><span className={tone(c.paymentStatus)}>Pagament: {c.paymentStatus}</span>{c.extras.length > 0 && <span className="chip">+{c.extras.length} extres</span>}</div>
        </button></li>))}
      </ul>
      <button className="btn-s mt-3 w-full" onClick={() => ensureCycles(cycles.filter((c) => c.deliveryPlanned > todayISO()).length + 4)}>Mostra més cicles previstos</button>
      {cur && <CycleSheet c={cur} all={cycles} onClose={() => setOpen(null)} />}
    </>
  )
}

function CycleSheet({ c: initial, all, onClose }: { c: Cycle; all: Cycle[]; onClose: () => void }) {
  const [c, setC] = useState<Cycle>(initial)
  const [tab, setTab] = useState<'resum' | 'extres' | 'caixa' | 'anula'>('resum')
  const [err, setErr] = useState('')
  const [cancel, setCancel] = useState({ date: todayISO(), reason: '', paid: initial.paymentStatus === 'Pagat', refund: '' })
  const [shift, setShift] = useState(false)
  const locs = useLiveQuery(() => db.locations.toArray(), [], [])
  const cats = useLiveQuery(() => db.categories.toArray(), [], [])
  const patch = (p: Partial<Cycle>) => setC((x) => ({ ...x, ...p }))
  const log = (text: string) => ({ history: [...c.history, { ts: new Date().toISOString(), text }] })
  const save = async (next = c, msg?: string) => {
    const n = msg ? { ...next, history: [...next.history, { ts: new Date().toISOString(), text: msg }] } : next
    // Coherència: un cicle anul·lat o no rebut no pot mantenir moviments d'inventari.
    if (n.deliveryStatus !== 'Rebut' && n.receptionApplied) { await revertReception(n.id); n.receptionApplied = false }
    await saveCycle(n); setC(n)
  }
  const apply = async (sel: { box: string[]; extras: string[] }) => {
    setErr('')
    try { await save(c); await applyReception(c.id, sel, locs.find((l) => l.name === 'Rebost')?.id); setC((await db.cycles.get(c.id))!) } catch (e) { setErr((e as Error).message) }
  }
  const diff = chargeDifference(c)
  return (
    <Sheet title={formatDate(c.deliveryPlanned, false)} onClose={onClose}>
      <div className="mb-3 flex gap-1 overflow-x-auto">{(['resum', 'extres', 'caixa', 'anula'] as const).map((t) => <button key={t} className={tab === t ? 'btn-p !min-h-[34px]' : 'btn-s !min-h-[34px]'} onClick={() => setTab(t)}>{{ resum: 'Resum', extres: 'Extres', caixa: 'Contingut', anula: 'Anul·la' }[t]}</button>)}</div>
      {tab === 'resum' && <div className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Estat del lliurament"><select value={c.deliveryStatus} onChange={(e) => patch({ deliveryStatus: e.target.value as Cycle['deliveryStatus'], ...(e.target.value === 'Rebut' && !c.deliveryReal ? { deliveryReal: todayISO() } : {}) })}>{DELIVERY_STATUSES.map((s) => <option key={s}>{s}</option>)}</select></Field>
          <Field label="Estat del pagament"><select value={c.paymentStatus} onChange={(e) => patch({ paymentStatus: e.target.value as Cycle['paymentStatus'] })}>{PAYMENT_STATUSES.map((s) => <option key={s}>{s}</option>)}</select></Field>
          <Field label="Lliurament previst"><input type="date" value={c.deliveryPlanned} onChange={(e) => patch({ deliveryPlanned: e.target.value })} /></Field>
          <Field label="Pagament previst"><input type="date" value={c.paymentPlanned} onChange={(e) => patch({ paymentPlanned: e.target.value })} /></Field>
          <Field label="Lliurament real"><input type="date" value={c.deliveryReal ?? ''} onChange={(e) => patch({ deliveryReal: e.target.value || undefined })} /></Field>
          <Field label="Càrrec real (data)"><input type="date" value={c.paymentReal ?? ''} onChange={(e) => patch({ paymentReal: e.target.value || undefined })} /></Field>
          <Field label="Preu base (€)"><input inputMode="decimal" value={c.base} onChange={(e) => patch({ base: num(e.target.value) })} /></Field>
          <Field label="Descomptes (€)"><input inputMode="decimal" value={c.discount || ''} onChange={(e) => patch({ discount: num(e.target.value) })} /></Field>
        </div>
        <div className="card text-sm"><div className="flex justify-between"><span>Base</span><span>{eur(c.base)}</span></div><div className="flex justify-between"><span>Productes addicionals</span><span>{eur(extrasTotal(c))}</span></div><div className="flex justify-between"><span>Descomptes</span><span>−{eur(c.discount)}</span></div><div className="mt-1 flex justify-between border-t border-line pt-1 font-semibold"><span>Import calculat</span><span>{eur(cycleTotal(c))}</span></div></div>
        <Field label="Import efectivament pagat (€, deixa en blanc si no consta)"><input inputMode="decimal" value={c.paidAmount ?? ''} onChange={(e) => patch({ paidAmount: e.target.value ? num(e.target.value) : undefined })} /></Field>
        {diff !== 0 && <p className="rounded-lg bg-sand/25 p-2 text-xs text-warn">El càrrec real difereix {eur(diff)} de l'import calculat. Es registra la diferència sense alterar els preus originals.</p>}
        {c.paymentStatus === 'Pagat' && c.deliveryStatus === 'Incidència' && <Field label="Reemborsament rebut (€)"><input inputMode="decimal" value={c.refund ?? ''} onChange={(e) => patch({ refund: e.target.value ? num(e.target.value) : undefined })} /></Field>}
        <Field label="Observacions"><textarea rows={2} value={c.note ?? ''} onChange={(e) => patch({ note: e.target.value })} /></Field>
        {c.deliveryPlanned !== initial.deliveryPlanned && <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={shift} onChange={(e) => setShift(e.target.checked)} />Desplaça també els cicles previstos posteriors</label>}
        <button className="btn-p w-full" onClick={async () => {
          await save({ ...c, ...log('Cicle actualitzat') })
          if (shift) {
            const delta = Math.round((new Date(c.deliveryPlanned).getTime() - new Date(initial.deliveryPlanned).getTime()) / 86400000)
            for (const f of all.filter((x) => x.deliveryPlanned > initial.deliveryPlanned && x.deliveryStatus === 'Previst' && x.id !== c.id)) await saveCycle({ ...f, deliveryPlanned: addDays(f.deliveryPlanned, delta), paymentPlanned: addDays(f.paymentPlanned, delta) })
          }
          onClose()
        }}>Desa</button>
        {c.history.length > 0 && <details className="text-xs text-mute"><summary>Historial del cicle</summary><ul className="mt-1 space-y-0.5">{c.history.map((h, i) => <li key={i}>{new Date(h.ts).toLocaleString('ca-ES')} — {h.text}</li>)}</ul></details>}
      </div>}

      {tab === 'extres' && <div className="space-y-3">
        <p className="text-xs text-mute">Productes de rebost afegits a la comanda abans del lliurament. Compten dins l'import d'aquesta comanda, no com a despesa duplicada.</p>
        {c.extras.map((e) => <div key={e.id} className="card space-y-2 !p-3">
          <input placeholder="Nom" value={e.name} onChange={(ev) => patch({ extras: c.extras.map((x) => x.id === e.id ? { ...x, name: ev.target.value } : x) })} />
          <div className="grid grid-cols-4 gap-2">
            <input inputMode="decimal" aria-label="Quantitat" value={e.qty || ''} onChange={(ev) => patch({ extras: c.extras.map((x) => x.id === e.id ? { ...x, qty: num(ev.target.value) } : x) })} />
            <select aria-label="Unitat" value={e.unit} onChange={(ev) => patch({ extras: c.extras.map((x) => x.id === e.id ? { ...x, unit: ev.target.value } : x) })}>{UNITS.map((u) => <option key={u}>{u}</option>)}</select>
            <input inputMode="decimal" aria-label="Preu unitari" placeholder="€/u" value={e.unitPrice || ''} onChange={(ev) => patch({ extras: c.extras.map((x) => x.id === e.id ? { ...x, unitPrice: num(ev.target.value) } : x) })} />
            <input inputMode="decimal" aria-label="Descompte" placeholder="Dte." value={e.discount || ''} onChange={(ev) => patch({ extras: c.extras.map((x) => x.id === e.id ? { ...x, discount: num(ev.target.value) } : x) })} />
          </div>
          <select aria-label="Categoria" value={e.categoryId ?? ''} onChange={(ev) => patch({ extras: c.extras.map((x) => x.id === e.id ? { ...x, categoryId: ev.target.value ? Number(ev.target.value) : undefined } : x) })}><option value="">Categoria…</option>{cats.map((k) => <option key={k.id} value={k.id}>{k.name}</option>)}</select>
          <div className="flex justify-between text-sm"><b>{eur(extraLineAmount(e))}</b><button className="btn-g !min-h-0" onClick={() => patch({ extras: c.extras.filter((x) => x.id !== e.id) })}>Elimina</button></div>
        </div>)}
        <button className="btn-s" onClick={() => patch({ extras: [...c.extras, { id: uid(), name: '', qty: 1, unit: 'ud', unitPrice: 0 }] })}>＋ Producte addicional</button>
        <p className="text-sm">Total de la comanda: <b>{eur(cycleTotal(c))}</b></p>
        <button className="btn-p w-full" onClick={() => save(c, 'Productes addicionals actualitzats')}>Desa els extres</button>
      </div>}

      {tab === 'caixa' && <BoxTab c={c} patch={patch} locs={locs} onSave={() => save(c, 'Contingut de la caixa actualitzat')} onApply={apply} err={err} />}

      {tab === 'anula' && <div className="space-y-3">
        {c.deliveryStatus === 'Anul·lat' ? <p className="card text-sm">Entrega anul·lada{c.cancelledAt ? ` el ${formatDate(c.cancelledAt, false)}` : ''}{c.cancelReason ? ` · ${c.cancelReason}` : ''}. No s'han afegit productes a l'inventari ni cap despesa si el cobrament no es va efectuar.</p> : <>
          <p className="text-sm text-mute">Només s'anul·la aquest lliurament. La resta del calendari quinzenal no canvia.</p>
          <Field label="Data de l'anul·lació"><input type="date" value={cancel.date} onChange={(e) => setCancel({ ...cancel, date: e.target.value })} /></Field>
          <Field label="Motiu (opcional)"><input value={cancel.reason} onChange={(e) => setCancel({ ...cancel, reason: e.target.value })} /></Field>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={cancel.paid} onChange={(e) => setCancel({ ...cancel, paid: e.target.checked })} />El pagament ja s'havia efectuat</label>
          {cancel.paid && <Field label="Reemborsament (€, si escau)"><input inputMode="decimal" value={cancel.refund} onChange={(e) => setCancel({ ...cancel, refund: e.target.value })} /></Field>}
          <button className="btn-d w-full" onClick={async () => { await save(cancelCycle(c, { date: cancel.date, reason: cancel.reason || undefined, paid: cancel.paid, refund: cancel.refund ? num(cancel.refund) : undefined })); onClose() }}>Anul·la aquest lliurament</button>
        </>}
      </div>}
    </Sheet>
  )
}

function BoxTab({ c, patch, locs, onSave, onApply, err }: { c: Cycle; patch: (p: Partial<Cycle>) => void; locs: { id?: number; name: string }[]; onSave: () => void; onApply: (s: { box: string[]; extras: string[] }) => void; err: string }) {
  const [sel, setSel] = useState<Set<string>>(() => new Set([...c.box.map((b) => b.id), ...c.extras.map((e) => e.id)]))
  const upd = (id: string, p: object) => patch({ box: c.box.map((b) => (b.id === id ? { ...b, ...p } : b)) })
  const toggle = (id: string, on: boolean) => { const n = new Set(sel); on ? n.add(id) : n.delete(id); setSel(n) }
  return (
    <div className="space-y-3">
      <p className="text-xs text-mute">El contingut és variable: introdueix cada vegada el que has rebut realment. No es copia automàticament de la caixa anterior.</p>
      {c.box.map((b) => <div key={b.id} className="card space-y-2 !p-3">
        <div className="flex items-center gap-2"><input type="checkbox" checked={sel.has(b.id)} onChange={(e) => toggle(b.id, e.target.checked)} aria-label="Afegeix al rebost" /><input placeholder="Producte" value={b.name} onChange={(e) => upd(b.id, { name: e.target.value })} /></div>
        <div className="grid grid-cols-3 gap-2">
          <input inputMode="decimal" aria-label="Quantitat" value={b.qty || ''} onChange={(e) => upd(b.id, { qty: num(e.target.value) })} />
          <select aria-label="Unitat" value={b.unit} onChange={(e) => upd(b.id, { unit: e.target.value })}>{UNITS.map((u) => <option key={u}>{u}</option>)}</select>
          <input inputMode="decimal" aria-label="Pes (kg)" placeholder="kg" value={b.weightKg ?? ''} onChange={(e) => upd(b.id, { weightKg: e.target.value ? num(e.target.value) : undefined })} />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <select aria-label="Ubicació" value={b.locationId ?? ''} onChange={(e) => upd(b.id, { locationId: e.target.value ? Number(e.target.value) : undefined })}><option value="">Ubicació…</option>{locs.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}</select>
          <input type="date" aria-label="Consum preferent" value={b.bestBefore ?? ''} onChange={(e) => upd(b.id, { bestBefore: e.target.value || undefined })} />
        </div>
        <button className="btn-g !min-h-0" onClick={() => patch({ box: c.box.filter((x) => x.id !== b.id) })}>Elimina la línia</button>
      </div>)}
      {c.extras.length > 0 && <div className="card !p-3 text-sm"><p className="mb-1 font-medium">Productes addicionals</p>{c.extras.map((e) => <label key={e.id} className="flex items-center gap-2"><input type="checkbox" checked={sel.has(e.id)} onChange={(ev) => toggle(e.id, ev.target.checked)} />{e.name || '(sense nom)'} <span className="text-xs text-mute">{e.qty} {e.unit}</span></label>)}</div>}
      <div className="flex gap-2"><button className="btn-s" onClick={() => { const id = uid(); patch({ box: [...c.box, { id, name: '', qty: 1, unit: 'kg' }] }); toggle(id, true) }}>＋ Línia</button></div>
      <button className="btn-s w-full" onClick={onSave}>Desa el contingut</button>
      {err && <p className="rounded-lg bg-bad/15 p-2 text-sm text-bad">{err}</p>}
      {c.deliveryStatus !== 'Rebut' && <p className="text-xs text-mute">Per afegir productes al rebost, el lliurament ha de constar com a «Rebut» (a Resum).</p>}
      <button className="btn-p w-full" disabled={c.deliveryStatus !== 'Rebut'} onClick={() => onApply({ box: c.box.filter((b) => sel.has(b.id)).map((b) => b.id), extras: c.extras.filter((e) => sel.has(e.id)).map((e) => e.id) })}>{c.receptionApplied ? 'Actualitza el rebost (sense duplicar)' : 'Afegeix els seleccionats al rebost'}</button>
      {c.receptionApplied && <p className="text-xs text-brand">Aquesta recepció ja és a l'inventari. Si la corregeixes, els moviments es recalculen.</p>}
    </div>
  )
}
