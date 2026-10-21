import type { Purchase, Store, Category } from './db'
import { type Cycle, cycleSpend, r2 } from './talkual'

export interface SpendEntry { date: string; amount: number; storeName: string; categoryId?: number; source: 'compra' | 'talkual'; refId: string }

/** Despesa unificada: tiquets confirmats + pagaments reals de Talkual (cada comanda només una vegada). */
export function spendEntries(purchases: Purchase[], cycles: Cycle[], stores: Store[]): SpendEntry[] {
  const name = (id?: number) => stores.find((s) => s.id === id)?.name ?? 'Sense establiment'
  const out: SpendEntry[] = purchases.filter((p) => p.status === 'Revisat').map((p) => ({ date: p.date, amount: p.total, storeName: name(p.storeId), source: 'compra', refId: `p${p.id}` }))
  for (const c of cycles) { const s = cycleSpend(c); if (s) out.push({ date: s.date, amount: s.amount, storeName: 'Talkual', source: 'talkual', refId: c.id }) }
  return out
}
export const monthKey = (iso: string) => iso.slice(0, 7)
export const sumBy = <T,>(xs: T[], f: (x: T) => number) => r2(xs.reduce((s, x) => s + f(x), 0))

export interface Obs { name: string; date: string; storeName: string; unitPrice: number; base: string; basePrice: number }
const norm = (s: string) => s.trim().toLowerCase()
/** Preu normalitzat per kg, l o unitat. Només té sentit comparar observacions amb la mateixa unitat base. */
export function toBase(unitPrice: number, unit: string): { base: string; price: number } {
  if (unit === 'g') return { base: '€/kg', price: unitPrice * 1000 }
  if (unit === 'kg') return { base: '€/kg', price: unitPrice }
  if (unit === 'ml') return { base: '€/l', price: unitPrice * 1000 }
  if (unit === 'l') return { base: '€/l', price: unitPrice }
  return { base: `€/${unit}`, price: unitPrice }
}
export function priceObservations(purchases: Purchase[], stores: Store[]): Obs[] {
  const out: Obs[] = []
  for (const p of purchases.filter((x) => x.status === 'Revisat')) {
    for (const l of p.lines) {
      const up = l.unitPrice ?? (l.qty ? l.amount / l.qty : undefined)
      if (!up) continue
      const b = toBase(up, l.unit)
      out.push({ name: norm(l.name), date: p.date, storeName: stores.find((s) => s.id === p.storeId)?.name ?? '—', unitPrice: up, base: b.base, basePrice: b.price })
    }
  }
  return out.sort((a, b) => a.date.localeCompare(b.date))
}
export function priceSummary(obs: Obs[]) {
  const by = new Map<string, Obs[]>()
  for (const o of obs) { const k = `${o.name}|${o.base}`; by.set(k, [...(by.get(k) ?? []), o]) }
  return [...by.entries()].map(([k, xs]) => {
    const first = xs[0], last = xs[xs.length - 1]
    const prices = xs.map((x) => x.basePrice)
    return { key: k, name: first.name, base: first.base, n: xs.length, last: last.basePrice, lastStore: last.storeName, min: Math.min(...prices), max: Math.max(...prices), avg: r2(prices.reduce((a, b) => a + b, 0) / prices.length), abs: r2(last.basePrice - first.basePrice), pct: first.basePrice ? r2(((last.basePrice - first.basePrice) / first.basePrice) * 100) : 0 }
  })
}
export type { Category }
