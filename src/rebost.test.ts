import { describe, it, expect, beforeEach } from 'vitest'
import { nextOpenCycle, pendingReception, newCycle, cycleTotal, cycleSpend, cancelCycle, plannedDeliveries, sundayBefore, talkualStats, dayName, chargeDifference } from './talkual'
import { useTestDb, seed, db, applyReception, adjustStock, applyPurchaseToInventory, saveCycle } from './db'

describe('calendari Talkual', () => {
  it('la referència és dimarts i el pagament el diumenge anterior', () => {
    expect(dayName('2026-10-20')).toBe('dimarts')
    expect(sundayBefore('2026-10-20')).toBe('2026-10-18')
  })
  it('el pròxim lliurament és el 3 de novembre amb pagament l\'1 de novembre', () => {
    const [, next] = plannedDeliveries('2026-10-20', 3)
    expect(next).toBe('2026-11-03')
    expect(sundayBefore(next)).toBe('2026-11-01')
    expect(dayName('2026-11-01')).toBe('diumenge')
  })
  it('calcula 19,95 € sense extres i recalcula amb extres i descomptes', () => {
    const c = newCycle('2026-11-03')
    expect(cycleTotal(c)).toBe(19.95)
    c.extras.push({ id: 'a', name: 'Pasta', qty: 2, unit: 'paquet', unitPrice: 1.5, discount: 0.5 })
    c.discount = 1
    expect(cycleTotal(c)).toBe(21.45)
  })
  it('detecta diferències entre càrrec real i calculat', () => {
    const c = newCycle('2026-11-03'); c.paidAmount = 20.5
    expect(chargeDifference(c)).toBe(0.55)
  })
})

describe('pròxim lliurament', () => {
  it('el 20-10 el pròxim és el 3-11 i la caixa d\'avui queda pendent de registrar', () => {
    const ref = newCycle('2026-10-20'); ref.deliveryStatus = 'Confirmat'; ref.deliveryReal = '2026-10-20'
    const cs = [ref, newCycle('2026-11-03'), newCycle('2026-11-17')]
    expect(nextOpenCycle(cs, '2026-10-20')?.id).toBe('tk-2026-11-03')
    expect(pendingReception(cs, '2026-10-20').map((c) => c.id)).toEqual(['tk-2026-10-20'])
  })
  it('si el 3-11 s\'anul·la, el pròxim és el 17-11', () => {
    const cs = [cancelCycle(newCycle('2026-11-03'), { date: '2026-11-01', paid: false }), newCycle('2026-11-17')]
    expect(nextOpenCycle(cs, '2026-10-21')?.id).toBe('tk-2026-11-17')
  })
})

describe('despesa i anul·lacions', () => {
  it('una entrega anul·lada sense cobrar no és despesa', () => {
    const c = cancelCycle(newCycle('2026-11-03'), { date: '2026-10-30', paid: false })
    expect(c.deliveryStatus).toBe('Anul·lat')
    expect(cycleSpend(c)).toBeNull()
  })
  it('si ja s\'havia pagat, es manté el moviment i es descompta el reemborsament', () => {
    let c = newCycle('2026-11-03'); c.paymentStatus = 'Pagat'
    c = cancelCycle(c, { date: '2026-11-02', paid: true, refund: 19.95 })
    expect(cycleSpend(c)?.amount).toBe(0)
    const c2 = cancelCycle({ ...newCycle('2026-11-17'), paymentStatus: 'Pagat' }, { date: '2026-11-16', paid: true })
    expect(cycleSpend(c2)?.amount).toBe(19.95)
  })
  it('un cicle previst no compta com a despesa', () => {
    expect(cycleSpend(newCycle('2026-11-03'))).toBeNull()
    expect(talkualStats([newCycle('2026-11-03')]).totalSpend).toBe(0)
  })
})

describe('base de dades', () => {
  beforeEach(async () => { useTestDb('t' + Math.random()); await seed() })

  it('el seed no crea recepcions ni pagaments inventats a més de la referència', async () => {
    const cs = await db.cycles.toArray()
    const paid = cs.filter((c) => c.paymentStatus === 'Pagat')
    expect(paid).toHaveLength(1)
    expect(paid[0].id).toBe('tk-2026-10-20')
    expect(cs.filter((c) => c.deliveryStatus === 'Rebut')).toHaveLength(0)
    expect(await db.products.count()).toBe(0)
  })
  it('el seed és idempotent', async () => {
    const n = await db.cycles.count(); await seed(); expect(await db.cycles.count()).toBe(n)
  })
  it('la recepció actualitza l\'inventari una sola vegada i es pot corregir sense duplicar', async () => {
    const c = (await db.cycles.get('tk-2026-10-20'))!
    c.deliveryStatus = 'Rebut'
    c.box = [{ id: 'b1', name: 'Pomes', qty: 2, unit: 'kg' }, { id: 'b2', name: 'Enciam', qty: 1, unit: 'ud' }]
    await saveCycle(c)
    await applyReception(c.id, { box: ['b1', 'b2'], extras: [] })
    await applyReception(c.id, { box: ['b1', 'b2'], extras: [] }) // doble clic
    let pomes = (await db.products.toArray()).find((p) => p.name === 'Pomes')!
    expect(pomes.qty).toBe(2)
    expect(await db.products.count()).toBe(2)
    // correcció: només pomes, 3 kg
    c.box = [{ id: 'b1', name: 'Pomes', qty: 3, unit: 'kg' }]; await saveCycle(c)
    await applyReception(c.id, { box: ['b1'], extras: [] })
    pomes = (await db.products.toArray()).find((p) => p.name === 'Pomes')!
    expect(pomes.qty).toBe(3)
    expect((await db.products.toArray()).find((p) => p.name === 'Enciam')!.qty).toBe(0)
  })
  it('no afegeix res a l\'inventari d\'una comanda anul·lada o no rebuda', async () => {
    const c = newCycle('2026-11-03'); c.box = [{ id: 'x', name: 'Taronges', qty: 1, unit: 'kg' }]
    await db.cycles.put(c)
    await expect(applyReception(c.id, { box: ['x'], extras: [] })).rejects.toThrow()
    await db.cycles.put(cancelCycle(c, { date: '2026-11-01', paid: false }))
    await expect(applyReception(c.id, { box: ['x'], extras: [] })).rejects.toThrow()
    expect(await db.products.count()).toBe(0)
  })
  it('els consums deixen traça als moviments', async () => {
    const id = (await db.products.add({ name: 'Pasta', qty: 3, unit: 'paquet' })) as number
    await adjustStock(id, -1, 'consum')
    expect((await db.products.get(id))!.qty).toBe(2)
    expect(await db.movements.where('productId').equals(id).count()).toBe(1)
  })
  it('una compra no entra dues vegades a l\'inventari', async () => {
    const pid = (await db.purchases.add({ date: '2026-10-20', total: 3, discount: 0, status: 'Revisat', source: 'manual', createdAt: '', lines: [{ id: 'l1', name: 'Llet', qty: 6, unit: 'l', amount: 3 }] })) as number
    await applyPurchaseToInventory(pid, ['l1']); await applyPurchaseToInventory(pid, ['l1'])
    expect((await db.products.toArray())[0].qty).toBe(6)
  })
})

describe('còpia de seguretat', () => {
  beforeEach(async () => { useTestDb('b' + Math.random()); await seed() })
  it('exporta i restaura les dades sense perdre res', async () => {
    const { exportAll, importAll } = await import('./db')
    await db.products.add({ name: 'Pasta', qty: 3, unit: 'paquet' })
    const json = JSON.parse(JSON.stringify(await exportAll()))
    await db.products.clear(); await db.cycles.clear()
    const r = await importAll(json)
    expect(r.products).toBe(1)
    expect((await db.products.toArray())[0].name).toBe('Pasta')
    expect((await db.cycles.get('tk-2026-10-20'))?.paymentStatus).toBe('Pagat')
  })
  it('rebutja fitxers que no són una còpia', async () => {
    const { importAll } = await import('./db')
    await expect(importAll({ foo: 1 })).rejects.toThrow()
  })
})
