import { describe, it, expect, beforeEach } from 'vitest'
import { nextOpenCycle, pendingReception, newCycle, cycleTotal, cycleSpend, cancelCycle, plannedDeliveries, sundayBefore, talkualStats, dayName, chargeDifference } from './talkual'
import { useTestDb, seed, db, applyReception, adjustStock, applyPurchaseToInventory, saveCycle } from './db'
import { inventoryInsights } from './inventory'

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


describe('preus i còpia completa', () => {
  beforeEach(async () => { useTestDb('extra' + Math.random()); await seed() })

  it('manté el preu zero com a valor vàlid i el mostra a les observacions', async () => {
    const { priceObservations } = await import('./stats')
    const purchase = {
      date: '2026-10-21', total: 0, discount: 0, lines: [
        { id: 'free', name: 'Mostra gratuïta', qty: 1, unit: 'ud', unitPrice: 0, amount: 0 },
      ], status: 'Revisat' as const, source: 'manual' as const, createdAt: '',
    }
    const obs = priceObservations([purchase], [])
    expect(obs).toHaveLength(1)
    expect(obs[0].unitPrice).toBe(0)
    expect(obs[0].basePrice).toBe(0)
  })

  it('inclou i restaura els documents adjunts i les fotos', async () => {
    const { exportAll, importAll } = await import('./db')
    await db.products.add({ name: 'Foto', qty: 1, unit: 'ud', photo: new Blob(['foto'], { type: 'image/jpeg' }), emoji: '🍎' })
    const listId = await db.lists.add({ name: 'Compra', createdAt: '2026-11-03' })
    await db.lists.update(listId, { budget: 35, spentTotal: 12.5 })
    await db.listItems.add({ listId, name: 'Pomes', qty: 2, unit: 'ud', section: 'Fruita i verdura', paidPrice: 1.8, barcode: '8410000000000', photo: new Blob(['foto-llista'], { type: 'image/jpeg' }), emoji: '🍎' })
    await db.docs.add({ name: 'tiquet.pdf', type: 'application/pdf', blob: new Blob(['pdf-test'], { type: 'application/pdf' }), createdAt: '2026-10-21T00:00:00.000Z' })
    const backup = JSON.parse(JSON.stringify(await exportAll()))
    await db.products.clear()
    await db.listItems.clear()
    await db.lists.clear()
    await db.docs.clear()
    const restored = await importAll(backup)
    expect(restored.docs).toBe(1)
    expect((await db.docs.toArray())[0].blob).toBeInstanceOf(Blob)
    expect(await (await db.docs.toArray())[0].blob.text()).toBe('pdf-test')
    expect((await db.products.toArray())[0].photo).toBeInstanceOf(Blob)
    expect(await (await db.products.toArray())[0].photo!.text()).toBe('foto')
    expect((await db.products.toArray())[0].emoji).toBe('🍎')
    const restoredItem = (await db.listItems.toArray())[0]
    expect(restoredItem.emoji).toBe('🍎')
    expect(restoredItem.section).toBe('Fruita i verdura')
    expect(restoredItem.paidPrice).toBe(1.8)
    expect(restoredItem.barcode).toBe('8410000000000')
    expect((await db.lists.get(listId))?.budget).toBe(35)
    expect((await db.lists.get(listId))?.spentTotal).toBe(12.5)
    expect(restoredItem.photo).toBeInstanceOf(Blob)
    expect(await restoredItem.photo!.text()).toBe('foto-llista')
  })

  it('rebutja taules malformades abans de modificar dades', async () => {
    const { importAll } = await import('./db')
    await db.products.add({ name: 'Conserva', qty: 2, unit: 'ud' })
    const invalid = { app: 'el-rebost', version: 2, products: [], cycles: [], docs: 'no és una taula' }
    await expect(importAll(invalid)).rejects.toThrow()
    expect((await db.products.toArray()).map((p) => p.name)).toEqual(['Conserva'])
  })
})


describe('control intel·ligent del rebost', () => {
  const today = '2026-11-03'
  it('prioritza productes caducats i pròxims a caducar i ignora estoc zero', () => {
    const products = [
      { id: 1, name: 'Iogurt', qty: 2, unit: 'ud', expiry: '2026-11-02' },
      { id: 2, name: 'Llet', qty: 1, unit: 'l', expiry: '2026-11-05' },
      { id: 3, name: 'Formatge', qty: 0, unit: 'ud', expiry: '2026-11-04' },
      { id: 4, name: 'Arròs', qty: 1, unit: 'kg', expiry: '2026-11-20' },
    ]
    const result = inventoryInsights(products, [], today, 5)
    expect(result.expiry.map((x) => [x.product.name, x.days])).toEqual([['Iogurt', -1], ['Llet', 2]])
  })
  it('calcula consum, ritme, freqüència de compra i reposició suggerida sense afegir res automàticament', () => {
    const products = [
      { id: 1, name: 'Cafè', qty: 1, unit: 'paquet', min: 2 },
      { id: 2, name: 'Arròs', qty: 5, unit: 'kg' },
    ]
    const movements = [
      { id: 1, productId: 1, ts: '2026-10-10T10:00:00.000Z', delta: 1, kind: 'compra' as const },
      { id: 2, productId: 1, ts: '2026-10-24T10:00:00.000Z', delta: 1, kind: 'compra' as const },
      { id: 3, productId: 1, ts: '2026-11-02T10:00:00.000Z', delta: -1, kind: 'consum' as const },
      { id: 4, productId: 2, ts: '2026-10-30T10:00:00.000Z', delta: -3, kind: 'consum' as const },
      { id: 5, productId: 2, ts: '2026-10-30T10:01:00.000Z', delta: -100, kind: 'correcció' as const },
    ]
    const result = inventoryInsights(products, movements, today, 5)
    const coffee = result.consumption.find((x) => x.product.id === 1)!
    expect(coffee.consumed).toBe(1)
    expect(coffee.purchaseCount).toBe(2)
    expect(coffee.averagePurchaseInterval).toBe(14)
    expect(result.replenishment.map((x) => x.product.name)).toContain('Cafè')
    expect(result.replenishment.find((x) => x.product.name === 'Cafè')?.suggestedQty).toBeGreaterThan(0)
    expect(result.consumption.find((x) => x.product.id === 2)?.consumed).toBe(3)
    expect(result.replenishment.some((x) => x.product.name === 'Arròs')).toBe(false)
  })
  it('suggereix reposició per ritme de consum encara que no hi hagi mínim definit', () => {
    const products = [{ id: 7, name: 'Llet', qty: 1, unit: 'l' }]
    const movements = Array.from({ length: 10 }, (_, i) => ({
      id: i + 1, productId: 7, ts: `2026-10-${String(20 + i).padStart(2, '0')}T10:00:00.000Z`,
      delta: -1, kind: 'consum' as const,
    }))
    const result = inventoryInsights(products, movements, today, 5)
    expect(result.replenishment[0]?.product.name).toBe('Llet')
    expect(result.replenishment[0]?.reason).toContain('Estoc aproximat')
  })
})

describe('receptes i aprofitament', () => {
  it('prioritza receptes que aprofiten ingredients propers a caducar', async () => {
    const { RECIPES, matchRecipe } = await import('./recipes')
    const recipe = RECIPES.find((r) => r.id === 'truita-carbasso')!
    const products = [
      { id: 1, name: 'Carbassó', qty: 2, unit: 'ud', expiry: '2026-11-04' },
      { id: 2, name: 'Ous', qty: 4, unit: 'ud' },
      { id: 3, name: 'Ceba', qty: 1, unit: 'ud' },
    ]
    const result = matchRecipe(recipe, products, new Set([1]))
    expect(result.missingCount).toBe(0)
    expect(result.expiringCount).toBe(1)
    expect(result.score).toBeGreaterThan(matchRecipe(recipe, products).score)
  })
  it('detecta ingredients que falten i quantitats parcials', async () => {
    const { RECIPES, matchRecipe } = await import('./recipes')
    const recipe = RECIPES.find((r) => r.id === 'truita-carbasso')!
    const result = matchRecipe(recipe, [{ id: 1, name: 'Carbassó', qty: 0.5, unit: 'ud' }])
    expect(result.missingCount).toBe(3)
    expect(result.matches.find((x) => x.ingredient.name === 'carbassó')?.missing).toBe(0.5)
  })
})

describe('planificació setmanal de receptes', () => {
  it('acumula necessitats de diverses receptes i descompta l’estoc una sola vegada', async () => {
    const { RECIPES, missingIngredientsForRecipes } = await import('./recipes')
    const recipes = RECIPES.filter((r) => r.id === 'truita-carbasso')
    const doubled = [...recipes, ...recipes]
    const missing = missingIngredientsForRecipes(doubled, [{name:'Ous',qty:4,unit:'ud'}])
    expect(missing.find((x) => x.name === 'ous')?.qty).toBe(2)
  })
  it('converteix kg a g quan compara l’estoc amb la recepta', async () => {
    const { RECIPES, matchRecipe } = await import('./recipes')
    const recipe = RECIPES.find((r) => r.id === 'truita-patata')!
    const result = matchRecipe(recipe, [{name:'patates',qty:0.2,unit:'kg'}])
    expect(result.matches.find((x) => x.ingredient.name === 'patata')?.missing).toBe(200)
  })
})


describe('importació de receptes des de captures', () => {
  it('extreu el títol, ingredients, quantitats, temps i racions d’un text OCR en anglès', async () => {
    const { recipeFromOcrText } = await import('./recipeImport')
    const recipe = recipeFromOcrText('Chicken pasta\nIngredients:\n200 g pasta\n2 chicken breasts\n1 tbsp olive oil\nPreparation:\n1. Boil the pasta for 10 minutes.\n2. Cook the chicken and mix.', 87)
    expect(recipe.name).toBe('Chicken pasta')
    expect(recipe.ingredients[0]).toMatchObject({ name:'pasta', qty:200, unit:'g' })
    expect(recipe.ingredients[1]).toMatchObject({ name:'chicken breasts', qty:2 })
    expect(recipe.steps).toHaveLength(2)
    expect(recipe.ocrConfidence).toBe(87)
  })
  it('conserva els ingredients sense quantitat perquè l’usuari els completi', async () => {
    const { recipeFromOcrText } = await import('./recipeImport')
    const recipe = recipeFromOcrText('Truita\nIngredients:\nOus\nSal al gust\nPreparació:\nBat els ous i cou la truita.')
    expect(recipe.ingredients).toHaveLength(2)
    expect(recipe.ingredients[0]).toMatchObject({ name:'Ous', qty:0, unit:'—' })
    expect(recipe.ingredients[1]).toMatchObject({ name:'Sal al gust', qty:0, unit:'a gust' })
  })
})
