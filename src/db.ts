import Dexie, { type Table } from 'dexie'
import { type Cycle, type BoxLine, REF_DELIVERY, BASE_PRICE, newCycle, plannedDeliveries, cycleId, addDays, todayISO, STEP_DAYS } from './talkual'

export interface Store { id?: number; name: string; type: string; location?: string; notes?: string; archived?: boolean }
export interface Category { id?: number; name: string; icon: string; archived?: boolean }
export interface Location { id?: number; name: string }
export interface Product {
  id?: number; name: string; brand?: string; categoryId?: number; qty: number; unit: string; format?: string
  locationId?: number; boughtAt?: string; openedAt?: string; expiry?: string; min?: number; price?: number; notes?: string; photo?: Blob
}
export type MovementKind = 'compra' | 'consum' | 'correcció' | 'malmès' | 'recepció' | 'manual'
export interface Movement { id?: number; productId: number; ts: string; delta: number; kind: MovementKind; ref?: string; note?: string }
export interface ShopList { id?: number; name: string; createdAt: string }
export interface ListItem {
  id?: number; listId: number; name: string; qty: number; unit: string; note?: string; estPrice?: number
  estSource?: 'última compra' | 'altre establiment' | 'manual'; storeId?: number; categoryId?: number; bought?: boolean
}
export interface PurchaseLine { id: string; name: string; qty: number; unit: string; unitPrice?: number; amount: number; categoryId?: number }
export interface Purchase {
  id?: number; storeId?: number; date: string; total: number; discount: number; lines: PurchaseLine[]
  docId?: number; status: 'Pendent de revisió' | 'Revisat'; source: 'manual' | 'foto' | 'pdf'; createdAt: string; inventoryAdded?: boolean
}
export interface Doc { id?: number; name: string; type: string; blob: Blob; createdAt: string }
export interface Setting { key: string; value: unknown }
export interface Alert { id?: number; kind: string; text: string; ts: string; dismissed?: boolean }

class RebostDB extends Dexie {
  settings!: Table<Setting, string>
  stores!: Table<Store, number>
  categories!: Table<Category, number>
  locations!: Table<Location, number>
  products!: Table<Product, number>
  movements!: Table<Movement, number>
  lists!: Table<ShopList, number>
  listItems!: Table<ListItem, number>
  purchases!: Table<Purchase, number>
  docs!: Table<Doc, number>
  cycles!: Table<Cycle, string>
  alerts!: Table<Alert, number>
  constructor(name = 'el-rebost') {
    super(name)
    this.version(1).stores({
      settings: 'key',
      stores: '++id, name, archived',
      categories: '++id, name, archived',
      locations: '++id, name',
      products: '++id, name, locationId, categoryId',
      movements: '++id, productId, ref, ts',
      lists: '++id',
      listItems: '++id, listId',
      purchases: '++id, date, storeId',
      docs: '++id',
      cycles: 'id, deliveryPlanned',
      alerts: '++id',
    })
  }
}
export let db = new RebostDB()
/** Per als tests: base de dades aïllada. */
export function useTestDb(name: string) { db = new RebostDB(name); return db }

export const INITIAL_STORES: [string, string][] = [
  ['Lidl', 'supermercat'], ['Bonpreu', 'supermercat'], ['Esclat', 'supermercat'], ['Caprabo', 'supermercat'],
  ['Guisona', 'botiga'], ['García Vicent', 'botiga'], ['La Sirenta', 'botiga'], ['Cal Mariquinyo', 'botiga'],
  ['Polleria Antonia', 'polleria'], ['Gloria Xarcuters', 'xarcuteria'], ['Talkual', 'proveïdor de subscripció'],
]
export const STORE_TYPES = ['supermercat', 'botiga', 'carnisseria', 'polleria', 'xarcuteria', 'proveïdor de subscripció', 'altres']
export const INITIAL_CATEGORIES: [string, string][] = [
  ['Fruita', '🍎'], ['Verdura', '🥬'], ['Carn i aviram', '🍗'], ['Peix', '🐟'], ['Ous i làctics', '🥚'], ['Pa i fleca', '🥖'],
  ['Pasta, arròs i llegums', '🍝'], ['Conserves', '🥫'], ['Salses i condiments', '🫙'], ['Esmorzar i snacks', '🥣'], ['Congelats', '🧊'],
  ['Aigua i altres begudes', '💧'], ['Vins', '🍷'], ['Neteja de la llar', '🧽'], ['Sabons i gels', '🧼'], ['Xampús', '🧴'],
  ['Desodorants', '🌿'], ['Higiene bucodental', '🪥'], ['Paper i productes d\'un sol ús', '🧻'], ['Bugada', '🧺'], ['Mascotes', '🐾'], ['Altres', '📦'],
]
export const INITIAL_LOCATIONS = ['Rebost', 'Nevera', 'Congelador', 'Armari de neteja', 'Bany', 'Cellera o espai de begudes', 'Altres']
export const UNITS = ['ud', 'kg', 'g', 'l', 'ml', 'paquet', 'ampolla', 'llauna', 'pot', 'caixa']

export const DEFAULT_SETTINGS = {
  theme: 'auto' as 'auto' | 'clar' | 'fosc',
  dateFormat: 'llarg' as 'llarg' | 'curt',
  budgetMonthly: 0,
  budgetByCategory: {} as Record<string, number>,
  warn1: 80,
  warn2: 100,
  expiryDays: 5,
  tkBase: BASE_PRICE,
  tkStep: STEP_DAYS,
  tkRef: REF_DELIVERY,
  notifications: false,
  lastExport: '',
}
export type Settings = typeof DEFAULT_SETTINGS

export async function getSettings(): Promise<Settings> {
  const rows = await db.settings.toArray()
  const out: Record<string, unknown> = { ...DEFAULT_SETTINGS }
  for (const r of rows) out[r.key] = r.value
  return out as Settings
}
export const setSetting = (key: keyof Settings, value: unknown) => db.settings.put({ key, value })

/** Inicialitza dades de partida una sola vegada. No crea cap recepció ni cap pagament fictici. */
export async function seed() {
  if (await db.settings.get('seeded')) return
  await db.transaction('rw', [db.settings, db.stores, db.categories, db.locations, db.cycles], async () => {
    if ((await db.settings.get('seeded'))) return
    await db.stores.bulkAdd(INITIAL_STORES.map(([name, type]) => ({ name, type })))
    await db.categories.bulkAdd(INITIAL_CATEGORIES.map(([name, icon]) => ({ name, icon })))
    await db.locations.bulkAdd(INITIAL_LOCATIONS.map((name) => ({ name })))
    // Cicle de referència confirmat per l'usuari: rebuda 20-10-2026, pagament 18-10-2026, 19,95 €.
    const ref = newCycle(REF_DELIVERY)
    ref.deliveryStatus = 'Confirmat'
    ref.deliveryReal = REF_DELIVERY
    ref.paymentStatus = 'Pagat'
    ref.paymentReal = ref.paymentPlanned
    ref.paidAmount = BASE_PRICE
    ref.history.push({ ts: new Date().toISOString(), text: 'Cicle de referència confirmat per l\'usuari' })
    await db.cycles.add(ref)
    await db.settings.put({ key: 'seeded', value: true })
  })
  await ensureCycles()
}

/** Genera cicles previstos (mai confirmats) fins a `ahead` cicles per davant de la data actual. */
export async function ensureCycles(ahead = 6) {
  const s = await getSettings()
  const all = await db.cycles.toArray()
  const have = new Set(all.map((c) => c.id))
  const upcoming = plannedDeliveries(s.tkRef, 200, s.tkStep).filter((d) => d > todayISO()).slice(0, ahead)
  const past = plannedDeliveries(s.tkRef, 1, s.tkStep)
  for (const d of [...past, ...upcoming]) {
    if (!have.has(cycleId(d))) await db.cycles.add({ ...newCycle(d, s.tkBase) })
  }
}

// ───────── Inventari ─────────

export async function adjustStock(productId: number, delta: number, kind: MovementKind, opts: { ref?: string; note?: string } = {}) {
  await db.transaction('rw', [db.products, db.movements], async () => {
    const p = await db.products.get(productId)
    if (!p) throw new Error('Producte inexistent')
    const qty = Math.round((p.qty + delta) * 1000) / 1000
    await db.products.update(productId, { qty: Math.max(0, qty) })
    await db.movements.add({ productId, ts: new Date().toISOString(), delta, kind, ...opts })
  })
}

export async function addProduct(p: Omit<Product, 'id'>, kind: MovementKind = 'manual', ref?: string): Promise<number> {
  return db.transaction('rw', [db.products, db.movements], async () => {
    const id = (await db.products.add({ ...p, qty: 0 })) as number
    if (p.qty) {
      await db.products.update(id, { qty: p.qty })
      await db.movements.add({ productId: id, ts: new Date().toISOString(), delta: p.qty, kind, ref })
    }
    return id
  })
}

const norm = (s: string) => s.trim().toLowerCase()
export async function findProduct(name: string, unit?: string) {
  const all = await db.products.toArray()
  return all.find((p) => norm(p.name) === norm(name) && (!unit || p.unit === unit)) ?? all.find((p) => norm(p.name) === norm(name))
}

/**
 * Aplica (o reaplica) una recepció de Talkual a l'inventari.
 * Idempotent: desfà primer tots els moviments anteriors d'aquest cicle i els recrea amb la selecció actual,
 * de manera que corregir una caixa no duplica mai productes.
 */
export async function applyReception(cycleId_: string, selected: { box: string[]; extras: string[] }, defaultLocationId?: number) {
  await db.transaction('rw', [db.cycles, db.products, db.movements, db.categories], async () => {
    const cycle = await db.cycles.get(cycleId_)
    if (!cycle) throw new Error('Cicle inexistent')
    if (cycle.deliveryStatus === 'Anul·lat') throw new Error('No es pot afegir a l\'inventari una comanda anul·lada')
    if (cycle.deliveryStatus !== 'Rebut') throw new Error('El lliurament encara no consta com a rebut')
    await revertReception(cycleId_)
    const lines: { key: string; name: string; qty: number; unit: string; loc?: number; exp?: string; price?: number; cat?: number }[] = []
    for (const l of cycle.box) if (selected.box.includes(l.id)) lines.push({ key: `${cycle.id}:box:${l.id}`, name: l.name, qty: l.qty, unit: l.unit, loc: l.locationId, exp: l.bestBefore })
    for (const e of cycle.extras) if (selected.extras.includes(e.id)) lines.push({ key: `${cycle.id}:extra:${e.id}`, name: e.name, qty: e.qty, unit: e.unit, price: e.unitPrice, cat: e.categoryId })
    for (const l of lines) {
      let prod = (await db.products.toArray()).find((p) => norm(p.name) === norm(l.name) && p.unit === l.unit)
      let pid = prod?.id
      if (!pid) {
        pid = (await db.products.add({ name: l.name, qty: 0, unit: l.unit, locationId: l.loc ?? defaultLocationId, categoryId: l.cat, expiry: l.exp, price: l.price })) as number
      }
      const cur = (await db.products.get(pid))!
      await db.products.update(pid, { qty: Math.round((cur.qty + l.qty) * 1000) / 1000, ...(l.exp ? { expiry: l.exp } : {}) })
      await db.movements.add({ productId: pid, ts: new Date().toISOString(), delta: l.qty, kind: 'recepció', ref: l.key })
    }
    await db.cycles.update(cycleId_, { receptionApplied: lines.length > 0 })
  })
}

/** Desfà els moviments d'una recepció (per corregir-la o per anul·lar-la). */
export async function revertReception(cycleId_: string) {
  const prefix = `${cycleId_}:`
  const moves = (await db.movements.toArray()).filter((m) => m.ref?.startsWith(prefix))
  for (const m of moves) {
    const p = await db.products.get(m.productId)
    if (p) await db.products.update(m.productId, { qty: Math.max(0, Math.round((p.qty - m.delta) * 1000) / 1000) })
    await db.movements.delete(m.id!)
  }
}

export async function saveCycle(c: Cycle) { await db.cycles.put(c) }
export async function applyPurchaseToInventory(purchaseId: number, lineIds: string[], locationId?: number) {
  await db.transaction('rw', [db.purchases, db.products, db.movements], async () => {
    const p = await db.purchases.get(purchaseId)
    if (!p) return
    for (const l of p.lines.filter((x) => lineIds.includes(x.id))) {
      const ref = `compra-${purchaseId}:${l.id}`
      if ((await db.movements.where('ref').equals(ref).count()) > 0) continue // evita afegir-ho dues vegades
      const existing = (await db.products.toArray()).find((x) => norm(x.name) === norm(l.name) && x.unit === l.unit)
      let pid = existing?.id
      if (!pid) pid = (await db.products.add({ name: l.name, qty: 0, unit: l.unit, categoryId: l.categoryId, locationId, price: l.unitPrice, boughtAt: p.date })) as number
      const cur = (await db.products.get(pid))!
      await db.products.update(pid, { qty: Math.round((cur.qty + l.qty) * 1000) / 1000, boughtAt: p.date, price: l.unitPrice ?? cur.price })
      await db.movements.add({ productId: pid, ts: new Date().toISOString(), delta: l.qty, kind: 'compra', ref })
    }
    await db.purchases.update(purchaseId, { inventoryAdded: true })
  })
}

const BACKUP_TABLES = ['settings', 'stores', 'categories', 'locations', 'products', 'movements', 'lists', 'listItems', 'purchases', 'docs', 'cycles', 'alerts'] as const

type BackupBlob = { __elRebostBlob: true; type: string; base64: string }

async function blobToBackup(blob: Blob): Promise<BackupBlob> {
  const bytes = new Uint8Array(await blob.arrayBuffer())
  let binary = ''
  const chunkSize = 0x8000
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize))
  }
  return { __elRebostBlob: true, type: blob.type, base64: btoa(binary) }
}

function backupToBlob(value: unknown): Blob | undefined {
  if (!value || typeof value !== 'object') return undefined
  const candidate = value as Partial<BackupBlob>
  if (candidate.__elRebostBlob !== true || typeof candidate.base64 !== 'string' || typeof candidate.type !== 'string') return undefined
  const binary = atob(candidate.base64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return new Blob([bytes], { type: candidate.type })
}

/** Exporta totes les taules, incloent-hi fotos i documents adjunts codificats en Base64. */
export async function exportAll() {
  const out: Record<string, unknown> = { app: 'el-rebost', version: 2 }
  for (const t of BACKUP_TABLES) {
    const rows = await (db[t] as Table).toArray() as Record<string, unknown>[]
    if (t === 'products') {
      out[t] = await Promise.all(rows.map(async (row) => ({
        ...row,
        ...(row.photo instanceof Blob ? { photo: await blobToBackup(row.photo) } : {}),
      })))
    } else if (t === 'docs') {
      out[t] = await Promise.all(rows.map(async (row) => ({
        ...row,
        ...(row.blob instanceof Blob ? { blob: await blobToBackup(row.blob) } : {}),
      })))
    } else {
      out[t] = rows
    }
  }
  out.exportedAt = new Date().toISOString()
  await setSetting('lastExport', out.exportedAt)
  return out
}

/** Valida la còpia abans de tocar la base de dades i restaura totes les taules en una transacció. */
export async function importAll(raw: unknown): Promise<{ products: number; purchases: number; cycles: number; docs: number }> {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error("Aquest fitxer no és una còpia d'El Rebost.")
  const d = raw as Record<string, unknown>
  if (d.app !== 'el-rebost' || (d.version !== 1 && d.version !== 2) || !Array.isArray(d.cycles) || !Array.isArray(d.products)) {
    throw new Error("Aquest fitxer no és una còpia compatible d'El Rebost.")
  }
  for (const t of BACKUP_TABLES) {
    if (d[t] !== undefined && !Array.isArray(d[t])) throw new Error(`La taula «${t}» de la còpia no és vàlida. No s'ha modificat cap dada.`)
  }
  const normalized: Record<string, unknown[]> = {}
  for (const t of BACKUP_TABLES) {
    const rows = (Array.isArray(d[t]) ? d[t] : []) as Record<string, unknown>[]
    if (t === 'products') {
      normalized[t] = rows.map((row) => ({ ...row, ...(backupToBlob(row.photo) ? { photo: backupToBlob(row.photo) } : {}) }))
    } else if (t === 'docs') {
      normalized[t] = rows.map((row) => {
        const blob = backupToBlob(row.blob)
        if (!blob) throw new Error('La còpia conté un document adjunt invàlid. No s\'ha modificat cap dada.')
        return { ...row, blob }
      })
    } else {
      normalized[t] = rows
    }
  }
  const tables = BACKUP_TABLES.map((t) => db[t] as Table)
  await db.transaction('rw', tables, async () => {
    for (const t of BACKUP_TABLES) {
      const table = db[t] as Table
      await table.clear()
      const rows = normalized[t]
      if (rows.length) await table.bulkPut(rows)
    }
  })
  return {
    products: normalized.products.length,
    purchases: normalized.purchases.length,
    cycles: normalized.cycles.length,
    docs: normalized.docs.length,
  }
}

export { addDays }
export type { BoxLine }
