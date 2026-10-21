import { useMemo, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { db, getSettings, DEFAULT_SETTINGS } from '../db'
import { spendEntries, monthKey, sumBy, priceObservations, priceSummary } from '../stats'
import { eur, talkualStats, todayISO, monthName, r2 } from '../talkual'
import { Empty, Stat, Title } from '../ui'

type Period = 'setmana' | 'mes' | 'trimestre' | 'any'
function range(p: Period, offset = 0): [string, string] {
  const t = new Date(); t.setHours(12)
  const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  if (p === 'setmana') { const d = new Date(t); d.setDate(d.getDate() - ((d.getDay() + 6) % 7) + offset * 7); const e = new Date(d); e.setDate(e.getDate() + 6); return [iso(d), iso(e)] }
  if (p === 'mes') return [iso(new Date(t.getFullYear(), t.getMonth() + offset, 1, 12)), iso(new Date(t.getFullYear(), t.getMonth() + offset + 1, 0, 12))]
  if (p === 'trimestre') { const q = Math.floor(t.getMonth() / 3) + offset; return [iso(new Date(t.getFullYear(), q * 3, 1, 12)), iso(new Date(t.getFullYear(), q * 3 + 3, 0, 12))] }
  return [iso(new Date(t.getFullYear() + offset, 0, 1, 12)), iso(new Date(t.getFullYear() + offset, 11, 31, 12))]
}

export default function Analisi() {
  const purchases = useLiveQuery(() => db.purchases.toArray(), [], [])
  const cycles = useLiveQuery(() => db.cycles.toArray(), [], [])
  const stores = useLiveQuery(() => db.stores.toArray(), [], [])
  const categories = useLiveQuery(() => db.categories.toArray(), [], [])
  const settings = useLiveQuery(getSettings, [], DEFAULT_SETTINGS)
  const [period, setPeriod] = useState<Period>('mes')
  const all = useMemo(() => spendEntries(purchases, cycles, stores), [purchases, cycles, stores])
  const [a, b] = range(period), [pa, pb] = range(period, -1)
  const cur = all.filter((e) => e.date >= a && e.date <= b)
  const prev = all.filter((e) => e.date >= pa && e.date <= pb)
  const total = sumBy(cur, (e) => e.amount), prevTotal = sumBy(prev, (e) => e.amount)
  const byStore = Object.entries(cur.reduce<Record<string, number>>((m, e) => ({ ...m, [e.storeName]: r2((m[e.storeName] ?? 0) + e.amount) }), {})).map(([name, v]) => ({ name, v })).sort((x, y) => y.v - x.v)
  const byCategory = useMemo(() => {
    const names = new Map(categories.map((c) => [c.id, { name: c.name, icon: c.icon }]))
    const totals = new Map<string, { name: string; icon: string; amount: number }>()
    for (const purchase of purchases) {
      if (purchase.status !== 'Revisat' || purchase.date < a || purchase.date > b) continue
      for (const line of purchase.lines) {
        const category = names.get(line.categoryId)
        const key = category ? String(line.categoryId) : 'uncategorized'
        const current = totals.get(key) ?? { name: category?.name ?? 'Sense categoria', icon: category?.icon ?? '📦', amount: 0 }
        current.amount = r2(current.amount + line.amount)
        totals.set(key, current)
      }
    }
    return [...totals.entries()].map(([key, item]) => ({ key, ...item })).sort((x, y) => y.amount - x.amount)
  }, [purchases, categories, a, b])
  const categoryTotal = sumBy(byCategory, (c) => c.amount)
  const year = new Date().getFullYear()
  const monthly = Array.from({ length: 12 }, (_, m) => ({ name: monthName(m).slice(0, 3), v: sumBy(all.filter((e) => monthKey(e.date) === `${year}-${String(m + 1).padStart(2, '0')}`), (e) => e.amount) }))
  const month = monthKey(todayISO())
  const monthSpend = sumBy(all.filter((e) => monthKey(e.date) === month), (e) => e.amount)
  const pct = settings.budgetMonthly ? Math.round((monthSpend / settings.budgetMonthly) * 100) : 0
  const tk = talkualStats(cycles)
  const prices = priceSummary(priceObservations(purchases, stores))
  const nPurch = cur.filter((e) => e.source === 'compra').length
  const tick = { fontSize: 11, fill: 'rgb(var(--mute))' }

  return (
    <>
      <Title>Anàlisi</Title>
      <div className="mb-4 flex gap-2 overflow-x-auto">{(['setmana', 'mes', 'trimestre', 'any'] as Period[]).map((p) => <button key={p} className={period === p ? 'btn-p !min-h-[36px]' : 'btn-s !min-h-[36px]'} onClick={() => setPeriod(p)}>{p[0].toUpperCase() + p.slice(1)}</button>)}</div>
      {all.length === 0 && <Empty>Encara no hi ha despesa registrada. Confirma un tiquet o registra un pagament de Talkual perquè apareguin les estadístiques.</Empty>}
      <div className="mb-4 grid grid-cols-2 gap-3">
        <Stat label={`Despesa (${period})`} value={eur(total)} sub={`${a} → ${b}`} />
        <Stat label="Període anterior" value={eur(prevTotal)} sub={prevTotal ? `${total >= prevTotal ? '+' : ''}${r2(((total - prevTotal) / prevTotal) * 100)} %` : 'Sense dades'} />
        <Stat label="Import mitjà per compra" value={nPurch ? eur(sumBy(cur.filter((e) => e.source === 'compra'), (e) => e.amount) / nPurch) : '—'} />
        <Stat label="Pressupost mensual" value={settings.budgetMonthly ? eur(Math.max(0, settings.budgetMonthly - monthSpend)) : 'Sense definir'} sub={settings.budgetMonthly ? `${pct}% utilitzat${pct >= settings.warn2 ? ' · superat' : pct >= settings.warn1 ? ' · avís' : ''}` : 'Es configura a Configuració'} tone={pct >= settings.warn2 ? 'bad' : pct >= settings.warn1 ? 'warn' : undefined} />
      </div>
      <section className="card mb-4"><h2 className="mb-2 font-semibold">Evolució mensual {year}</h2>
        <div className="h-48"><ResponsiveContainer><BarChart data={monthly}><CartesianGrid strokeDasharray="3 3" stroke="rgb(var(--line))" vertical={false} /><XAxis dataKey="name" tick={tick} axisLine={false} tickLine={false} /><YAxis tick={tick} axisLine={false} tickLine={false} width={36} /><Tooltip formatter={(v: number) => eur(v)} contentStyle={{ background: 'rgb(var(--surface))', border: '1px solid rgb(var(--line))', borderRadius: 12 }} /><Bar dataKey="v" name="Despesa" fill="rgb(var(--brand))" radius={[6, 6, 0, 0]} /></BarChart></ResponsiveContainer></div></section>
      <section className="card mb-4"><h2 className="mb-2 font-semibold">Despesa per establiment</h2>
        {byStore.length === 0 ? <p className="text-sm text-mute">Sense dades en aquest període.</p> : <ul className="space-y-1.5 text-sm">{byStore.map((s) => <li key={s.name}><div className="flex justify-between"><span>{s.name}</span><b>{eur(s.v)}</b></div><div className="h-1.5 rounded-full bg-surface2"><div className="h-full rounded-full bg-sage" style={{ width: `${(s.v / byStore[0].v) * 100}%` }} /></div></li>)}</ul>}</section>
      <section className="card mb-4"><h2 className="mb-1 font-semibold">Despesa per categoria</h2>
        <p className="mb-3 text-xs text-mute">Desglossament dels productes dels tiquets revisats en aquest període. Els pagaments de Talkual no s'assignen a categories aquí.</p>
        {byCategory.length === 0 ? <p className="text-sm text-mute">No hi ha línies de tiquet revisades en aquest període.</p> : <>
          <div className="mb-3 flex items-baseline justify-between"><span className="text-sm text-mute">Total de productes categoritzats i pendents de categoria</span><b>{eur(categoryTotal)}</b></div>
          <ul className="space-y-3 text-sm">{byCategory.map((c) => <li key={c.key}>
            <div className="mb-1 flex items-center justify-between gap-3"><span className="min-w-0 truncate">{c.icon} {c.name}</span><span className="shrink-0 text-right"><b>{eur(c.amount)}</b><span className="ml-2 text-xs text-mute">{categoryTotal ? Math.round(c.amount / categoryTotal * 100) : 0}%</span></span></div>
            <div className="h-1.5 rounded-full bg-surface2"><div className="h-full rounded-full bg-sage" style={{ width: `${categoryTotal ? c.amount / categoryTotal * 100 : 0}%` }} /></div>
          </li>)}</ul>
        </>}
      </section>
      <section className="card mb-4"><h2 className="mb-2 font-semibold">Talkual</h2>
        <dl className="grid grid-cols-2 gap-y-1 text-sm"><dt className="text-mute">Caixes rebudes</dt><dd className="text-right">{tk.received}</dd><dt className="text-mute">Caixes anul·lades</dt><dd className="text-right">{tk.cancelled}</dd><dt className="text-mute">Despesa total</dt><dd className="text-right">{eur(tk.totalSpend)}</dd><dt className="text-mute">Import base acumulat</dt><dd className="text-right">{eur(tk.baseAccum)}</dd><dt className="text-mute">Productes addicionals</dt><dd className="text-right">{eur(tk.extrasSpend)}</dd><dt className="text-mute">Import mitjà</dt><dd className="text-right">{eur(tk.avgOrder)}</dd></dl></section>
      <section className="card"><h2 className="mb-1 font-semibold">Historial de preus pagats</h2>
        <p className="mb-2 text-xs text-mute">Només a partir dels tiquets registrats. Els productes de la caixa variable de Talkual no s'hi inclouen. Es comparen només formats amb la mateixa unitat base.</p>
        {prices.length === 0 ? <p className="text-sm text-mute">Cal registrar tiquets amb preus per veure'n l'evolució.</p> : <div className="overflow-x-auto"><table className="w-full text-left text-xs"><thead className="text-mute"><tr><th className="py-1">Producte</th><th>Últim</th><th>Mín</th><th>Màx</th><th>Mitjà</th><th>Var.</th></tr></thead><tbody>{prices.map((p) => <tr key={p.key} className="border-t border-line"><td className="py-1.5">{p.name}<div className="text-[10px] text-mute">{p.base} · {p.lastStore} · {p.n} obs.</div></td><td>{eur(p.last)}</td><td>{eur(p.min)}</td><td>{eur(p.max)}</td><td>{eur(p.avg)}</td><td className={p.pct > 0 ? 'text-bad' : p.pct < 0 ? 'text-brand' : ''}>{p.n > 1 ? `${p.pct > 0 ? '+' : ''}${p.pct}%` : '—'}</td></tr>)}</tbody></table></div>}</section>
    </>
  )
}
