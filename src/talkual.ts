// Lògica pura de Talkual: dates, imports i despesa. Sense dependències de la UI.

export const BASE_PRICE = 19.95
export const REF_DELIVERY = '2026-10-20' // dimarts, rebuda confirmada
export const REF_PAYMENT = '2026-10-18' // diumenge anterior
export const STEP_DAYS = 14

export type DeliveryStatus = 'Previst' | 'Pendent de confirmar' | 'Confirmat' | 'Rebut' | 'Anul·lat' | 'Incidència'
export type PaymentStatus = 'Pendent' | 'Pagat' | 'No efectuat' | 'Anul·lat o no aplicable' | 'Incidència'
export const DELIVERY_STATUSES: DeliveryStatus[] = ['Previst', 'Pendent de confirmar', 'Confirmat', 'Rebut', 'Anul·lat', 'Incidència']
export const PAYMENT_STATUSES: PaymentStatus[] = ['Pendent', 'Pagat', 'No efectuat', 'Anul·lat o no aplicable', 'Incidència']

export interface ExtraLine {
  id: string
  name: string
  brand?: string
  qty: number
  unit: string
  unitPrice: number
  discount?: number
  categoryId?: number
  productId?: number
}

export interface BoxLine {
  id: string
  name: string
  qty: number
  unit: string
  weightKg?: number
  locationId?: number
  note?: string
  bestBefore?: string
}

export interface Cycle {
  id: string // estable: tk-AAAA-MM-DD (data prevista original de lliurament)
  deliveryPlanned: string
  paymentPlanned: string
  deliveryStatus: DeliveryStatus
  paymentStatus: PaymentStatus
  deliveryReal?: string // data real de recepció
  paymentReal?: string // data real del càrrec
  base: number
  extras: ExtraLine[]
  discount: number
  paidAmount?: number // import efectivament cobrat
  box: BoxLine[]
  note?: string
  cancelledAt?: string
  cancelReason?: string
  refund?: number
  refundDate?: string
  receptionApplied?: boolean
  history: { ts: string; text: string }[]
}

const pad = (n: number) => String(n).padStart(2, '0')

/** Parseja AAAA-MM-DD com a data local sense desfasaments de fus horari. */
export function parseISO(s: string): Date {
  const [y, m, d] = s.split('-').map(Number)
  return new Date(y, m - 1, d, 12, 0, 0)
}
export function toISO(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}
export function addDays(iso: string, n: number): string {
  const d = parseISO(iso)
  d.setDate(d.getDate() + n)
  return toISO(d)
}
export function todayISO(): string {
  return toISO(new Date())
}
const DIES = ['diumenge', 'dilluns', 'dimarts', 'dimecres', 'dijous', 'divendres', 'dissabte']
const MESOS = ['gener', 'febrer', 'març', 'abril', 'maig', 'juny', 'juliol', 'agost', 'setembre', 'octubre', 'novembre', 'desembre']
export const dayName = (iso: string) => DIES[parseISO(iso).getDay()]
export function formatDate(iso: string, withDay = true): string {
  const d = parseISO(iso)
  const base = `${d.getDate()} ${MESOS[d.getMonth()]} ${d.getFullYear()}`
  return withDay ? `${dayName(iso)}, ${base}` : base
}
export const monthName = (m: number) => MESOS[m]

export const cycleId = (deliveryISO: string) => `tk-${deliveryISO}`

/** Diumenge anterior (estrictament abans) a una data de lliurament. */
export function sundayBefore(deliveryISO: string): string {
  const d = parseISO(deliveryISO)
  const back = d.getDay() === 0 ? 7 : d.getDay()
  return addDays(deliveryISO, -back)
}

export function newCycle(deliveryISO: string, base = BASE_PRICE): Cycle {
  return {
    id: cycleId(deliveryISO),
    deliveryPlanned: deliveryISO,
    paymentPlanned: sundayBefore(deliveryISO),
    deliveryStatus: 'Previst',
    paymentStatus: 'Pendent',
    base,
    extras: [],
    discount: 0,
    box: [],
    history: [],
  }
}

/** Dates de lliurament previstes a partir de la referència, cada `step` dies. */
export function plannedDeliveries(ref: string, count: number, step = STEP_DAYS, from = 0): string[] {
  return Array.from({ length: count }, (_, i) => addDays(ref, step * (i + from)))
}

export const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100

export const extraLineAmount = (l: ExtraLine) => r2(l.qty * l.unitPrice - (l.discount ?? 0))
export const extrasTotal = (c: Pick<Cycle, 'extras'>) => r2(c.extras.reduce((s, l) => s + extraLineAmount(l), 0))

/** Import total = base + productes addicionals − descomptes. */
export function cycleTotal(c: Pick<Cycle, 'base' | 'extras' | 'discount'>): number {
  return r2(c.base + extrasTotal(c) - c.discount)
}

/** Diferència entre el càrrec real i el calculat (0 si no hi ha càrrec registrat). */
export function chargeDifference(c: Cycle): number {
  return c.paidAmount === undefined ? 0 : r2(c.paidAmount - cycleTotal(c))
}

/** Despesa real d'un cicle: només si el pagament consta com a pagat. Es resta el reemborsament. */
export function cycleSpend(c: Cycle): { amount: number; date: string } | null {
  if (c.paymentStatus !== 'Pagat') return null
  const paid = c.paidAmount ?? cycleTotal(c)
  return { amount: r2(paid - (c.refund ?? 0)), date: c.paymentReal ?? c.paymentPlanned }
}

export function cancelCycle(c: Cycle, opts: { date: string; reason?: string; paid: boolean; refund?: number; refundDate?: string }): Cycle {
  const next: Cycle = {
    ...c,
    deliveryStatus: 'Anul·lat',
    cancelledAt: opts.date,
    cancelReason: opts.reason,
    history: [...c.history, { ts: new Date().toISOString(), text: `Entrega anul·lada${opts.reason ? ` (${opts.reason})` : ''}` }],
  }
  if (opts.paid) {
    next.paymentStatus = 'Pagat'
    next.refund = opts.refund ?? c.refund
    next.refundDate = opts.refundDate
  } else {
    next.paymentStatus = 'Anul·lat o no aplicable'
  }
  return next
}

/** Pròxim lliurament encara per arribar (exclou anul·lats, rebuts i els que ja consten arribats). */
export function nextOpenCycle(cycles: Cycle[], today = todayISO()): Cycle | undefined {
  return cycles
    .filter((c) => !['Anul·lat', 'Rebut'].includes(c.deliveryStatus) && c.deliveryPlanned >= today && !(c.deliveryReal && c.deliveryReal <= today))
    .sort((a, b) => a.deliveryPlanned.localeCompare(b.deliveryPlanned))[0]
}

/** Caixes que ja haurien d'haver arribat però encara no s'han registrat com a rebudes. */
export function pendingReception(cycles: Cycle[], today = todayISO()): Cycle[] {
  return cycles.filter((c) => ['Confirmat', 'Pendent de confirmar'].includes(c.deliveryStatus) && (c.deliveryReal ?? c.deliveryPlanned) <= today)
}

export interface TalkualStats {
  received: number
  cancelled: number
  totalSpend: number
  baseAccum: number
  extrasSpend: number
  avgOrder: number
}
export function talkualStats(cycles: Cycle[]): TalkualStats {
  let received = 0, cancelled = 0, totalSpend = 0, baseAccum = 0, extrasSpend = 0, charged = 0
  for (const c of cycles) {
    if (c.deliveryStatus === 'Rebut') received++
    if (c.deliveryStatus === 'Anul·lat') cancelled++
    const s = cycleSpend(c)
    if (s) {
      totalSpend += s.amount
      baseAccum += c.base
      extrasSpend += extrasTotal(c)
      charged++
    }
  }
  return { received, cancelled, totalSpend: r2(totalSpend), baseAccum: r2(baseAccum), extrasSpend: r2(extrasSpend), avgOrder: charged ? r2(totalSpend / charged) : 0 }
}

export const eur = (n: number) => new Intl.NumberFormat('ca-ES', { style: 'currency', currency: 'EUR' }).format(n)
