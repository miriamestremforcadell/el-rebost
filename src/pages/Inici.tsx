import { useLiveQuery } from 'dexie-react-hooks'
import { db, getSettings, DEFAULT_SETTINGS } from '../db'
import { spendEntries, monthKey, sumBy } from '../stats'
import { eur, formatDate, nextOpenCycle, pendingReception, todayISO } from '../talkual'
import { Stat, Title, Empty } from '../ui'
import { daysTo } from './Rebost'
import type { Tab } from '../App'

export default function Inici({ go }: { go: (t: Tab) => void }) {
  const products = useLiveQuery(() => db.products.toArray(), [], [])
  const cycles = useLiveQuery(() => db.cycles.toArray(), [], [])
  const purchases = useLiveQuery(() => db.purchases.toArray(), [], [])
  const stores = useLiveQuery(() => db.stores.toArray(), [], [])
  const s = useLiveQuery(getSettings, [], DEFAULT_SETTINGS)
  const soon = products.filter((p) => { const d = daysTo(p.expiry); return d !== undefined && d <= s.expiryDays && p.qty > 0 })
  const low = products.filter((p) => p.min && p.min > 0 && p.qty <= p.min)
  const next = nextOpenCycle(cycles)
  const toReceive = pendingReception(cycles)
  const spend = sumBy(spendEntries(purchases, cycles, stores).filter((e) => monthKey(e.date) === monthKey(todayISO())), (e) => e.amount)
  const pct = s.budgetMonthly ? Math.round((spend / s.budgetMonthly) * 100) : 0
  const last = [...purchases].sort((a, b) => b.date.localeCompare(a.date))[0]
  const notes: string[] = []
  const hasData = products.length + purchases.length > 0
  const daysSinceBackup = s.lastExport ? Math.floor((Date.now() - new Date(s.lastExport).getTime()) / 86400000) : null
  const backupDue = hasData && (daysSinceBackup === null || daysSinceBackup >= 14)
  if (soon.length) notes.push(`Tens ${soon.length} producte${soon.length > 1 ? 's' : ''} que convé consumir aviat.`)
  if (low.length) notes.push(`Cal reposar ${low.length} producte${low.length > 1 ? 's' : ''}: ${low.slice(0, 3).map((p) => `${p.name} (${p.qty} ${p.unit})`).join(', ')}.`)
  if (s.budgetMonthly && pct >= s.warn1) notes.push(`Has utilitzat el ${pct}% del pressupost mensual.`)
  return (
    <>
      <Title>El Rebost</Title>
      {backupDue && <button className="card mb-3 w-full border-warn/40 text-left text-sm" onClick={() => go('config')}>💾 {daysSinceBackup === null ? 'Encara no has fet cap còpia de seguretat.' : `Fa ${daysSinceBackup} dies de l'última còpia de seguretat.`} Toca per fer-la a Configuració → Dades i privacitat.</button>}
      {notes.length > 0 && <div className="card mb-3 space-y-1 border-warn/40 text-sm">{notes.map((n) => <p key={n}>⚠️ {n}</p>)}</div>}
      <div className="mb-3 grid grid-cols-2 gap-3">
        <Stat label="Productes al rebost" value={products.filter((p) => p.qty > 0).length} />
        <Stat label="Despesa del mes" value={eur(spend)} sub={s.budgetMonthly ? `${pct}% de ${eur(s.budgetMonthly)} · queden ${eur(Math.max(0, s.budgetMonthly - spend))}` : 'Sense pressupost definit'} tone={pct >= s.warn2 ? 'bad' : pct >= s.warn1 ? 'warn' : undefined} />
      </div>
      <section className="card mb-3">
        <h2 className="mb-1 font-semibold">Talkual</h2>
        {toReceive.length > 0 && <p className="mb-2 rounded-lg bg-sand/25 p-2 text-sm text-warn">Tens {toReceive.length === 1 ? 'una caixa' : `${toReceive.length} caixes`} de Talkual per registrar com a rebuda ({formatDate(toReceive[0].deliveryReal ?? toReceive[0].deliveryPlanned, false)}).</p>}
        {next ? <div className="space-y-1 text-sm">
          <p>Pròxima caixa: <b>{formatDate(next.deliveryPlanned)}</b> <span className="chip-w ml-1">{next.deliveryStatus}</span></p>
          <p>Pagament: <b>{formatDate(next.paymentPlanned)}</b> <span className="chip-w ml-1">{next.paymentStatus}</span></p>
          <p className="text-xs text-mute">Dates previstes segons el calendari quinzenal; no confirmades per Talkual.</p>
        </div> : <p className="text-sm text-mute">No hi ha cap lliurament previst.</p>}
        <button className="btn-s mt-3" onClick={() => go('config')}>Gestiona Talkual</button>
      </section>
      <section className="card mb-3 text-sm"><h2 className="mb-1 font-semibold">Última compra</h2>
        {last ? <p>{stores.find((x) => x.id === last.storeId)?.name ?? 'Sense establiment'} · {formatDate(last.date, false)} · <b>{eur(last.total)}</b></p> : <p className="text-mute">Encara no hi ha compres. Registra el primer tiquet.</p>}</section>
      {products.length === 0 && <Empty>Comença afegint productes al rebost o registrant la caixa de Talkual rebuda.</Empty>}
      <div className="mt-3 grid grid-cols-3 gap-2"><button className="btn-s" onClick={() => go('rebost')}>＋ Producte</button><button className="btn-s" onClick={() => go('tiquets')}>🧾 Tiquet</button><button className="btn-s" onClick={() => go('compra')}>🛒 Llista</button></div>
    </>
  )
}
