import type { Movement, Product } from './db'

export interface ExpiryItem { product: Product; days: number }
export interface ConsumptionInsight {
  product: Product
  consumed: number
  dailyRate: number
  daysOfStock?: number
  purchaseCount: number
  averagePurchaseInterval?: number
  lastPurchase?: string
  lastConsumption?: string
}
export interface ReplenishmentSuggestion extends ConsumptionInsight {
  suggestedQty: number
  reason: string
}
export interface InventoryInsights {
  expiry: ExpiryItem[]
  consumption: ConsumptionInsight[]
  replenishment: ReplenishmentSuggestion[]
}

const dayNumber = (iso: string) => {
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number)
  return Math.floor(Date.UTC(y, m - 1, d) / 86400000)
}
const roundQty = (n: number) => Math.round(n * 1000) / 1000

export function inventoryInsights(products: Product[], movements: Movement[], today: string, expiryDays = 5, historyDays = 30): InventoryInsights {
  const now = dayNumber(today)
  const expiry: ExpiryItem[] = products
    .filter((p) => p.qty > 0 && !!p.expiry)
    .map((product) => ({ product, days: dayNumber(product.expiry!) - now }))
    .filter((x) => x.days <= expiryDays)
    .sort((a, b) => a.days - b.days || a.product.name.localeCompare(b.product.name, 'ca'))

  const consumption: ConsumptionInsight[] = products.map((product) => {
    const related = movements.filter((m) => m.productId === product.id)
    const consumedMoves = related.filter((m) => m.kind === 'consum' && m.delta < 0 && dayNumber(m.ts) >= now - historyDays + 1)
    const consumed = roundQty(consumedMoves.reduce((sum, m) => sum - m.delta, 0))
    const dailyRate = consumed / historyDays
    const purchases = [...new Set(related.filter((m) => (m.kind === 'compra' || m.kind === 'recepció') && m.delta > 0).map((m) => m.ts.slice(0, 10)))].sort()
    const intervals = purchases.slice(1).map((date, i) => dayNumber(date) - dayNumber(purchases[i]))
    const averagePurchaseInterval = intervals.length ? intervals.reduce((sum, n) => sum + n, 0) / intervals.length : undefined
    const lastPurchase = purchases[purchases.length - 1]
    const lastConsumption = consumedMoves.map((m) => m.ts.slice(0, 10)).sort().at(-1)
    return {
      product, consumed, dailyRate,
      ...(dailyRate > 0 ? { daysOfStock: roundQty(product.qty / dailyRate) } : {}),
      purchaseCount: purchases.length,
      ...(averagePurchaseInterval !== undefined ? { averagePurchaseInterval: roundQty(averagePurchaseInterval) } : {}),
      ...(lastPurchase ? { lastPurchase } : {}),
      ...(lastConsumption ? { lastConsumption } : {}),
    }
  }).filter((x) => x.consumed > 0 || x.purchaseCount > 0)
    .sort((a, b) => b.consumed - a.consumed || a.product.name.localeCompare(b.product.name, 'ca'))

  const byId = new Map(consumption.map((x) => [x.product.id, x]))
  const replenishment: ReplenishmentSuggestion[] = products.flatMap((product) => {
    const insight = byId.get(product.id) ?? {
      product, consumed: 0, dailyRate: 0, purchaseCount: 0,
    }
    const belowMinimum = product.min !== undefined && product.min > 0 && product.qty <= product.min
    const runningLow = insight.dailyRate > 0 && (insight.daysOfStock ?? Infinity) <= 7
    if (!belowMinimum && !runningLow) return []
    const targetStock = insight.dailyRate > 0 ? Math.max(product.min ?? 0, insight.dailyRate * 14) : (product.min ?? 0) + 1
    const suggestedQty = Math.max(1, roundQty(targetStock - product.qty))
    const reason = belowMinimum
      ? `Estoc (${product.qty} ${product.unit}) igual o inferior al mínim (${product.min} ${product.unit})`
      : `Estoc aproximat per a ${Math.max(0, Math.floor(insight.daysOfStock ?? 0))} dies segons el consum recent`
    return [{ ...insight, suggestedQty, reason }]
  }).sort((a, b) => (a.daysOfStock ?? Infinity) - (b.daysOfStock ?? Infinity) || a.product.name.localeCompare(b.product.name, 'ca'))

  return { expiry, consumption, replenishment }
}
