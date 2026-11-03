import { useEffect, useRef, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, UNITS, addProduct, findProduct, type ListItem, type Purchase, type Product } from '../db'
import { priceObservations } from '../stats'
import { Sheet, Field, Empty, Title, ProductVisual, num } from '../ui'
import { eur } from '../talkual'


const SHOP_SECTIONS = ['Fruita i verdura','Carnisseria i aviram','Peixateria','Forn i fleca','Làctics i ous','Pasta, arròs i llegums','Conserves i salses','Esmorzar i snacks','Begudes','Congelats','Neteja','Higiene personal','Mascotes','Altres']
function sectionForCategory(category?: string) {
  const s = (category || '').toLocaleLowerCase()
  if (s.includes('fruita') || s.includes('verdura')) return 'Fruita i verdura'
  if (s.includes('carn') || s.includes('poll')) return 'Carnisseria i aviram'
  if (s.includes('peix')) return 'Peixateria'
  if (s.includes('pa i fleca') || s.includes('fleca')) return 'Forn i fleca'
  if (s.includes('làct') || s.includes('ous')) return 'Làctics i ous'
  if (s.includes('pasta') || s.includes('arròs') || s.includes('llegum')) return 'Pasta, arròs i llegums'
  if (s.includes('conserv') || s.includes('sals')) return 'Conserves i salses'
  if (s.includes('esmorzar') || s.includes('snack')) return 'Esmorzar i snacks'
  if (s.includes('beguda') || s.includes('aigua')) return 'Begudes'
  if (s.includes('congel')) return 'Congelats'
  if (s.includes('neteja') || s.includes('bugada')) return 'Neteja'
  if (s.includes('higiene') || s.includes('sabó') || s.includes('xampú')) return 'Higiene personal'
  if (s.includes('mascot')) return 'Mascotes'
  return 'Altres'
}
type OffProduct = { name: string; brand?: string; barcode: string; quantity?: string }
declare global { interface Window { ZXing?: { BrowserMultiFormatReader: new () => { decodeFromVideoDevice: (deviceId: string | undefined, video: HTMLVideoElement, callback: (result: { getText: () => string } | undefined, error: unknown) => void) => Promise<{ stop: () => void }> } } } }
function BarcodeLookup({ onProduct, onClose }: { onProduct: (p: OffProduct) => void; onClose: () => void }) {
  const video = useRef<HTMLVideoElement>(null)
  const [status, setStatus] = useState('Preparant la càmera…')
  const [barcode, setBarcode] = useState('')
  const [found, setFound] = useState<OffProduct | null>(null)
  const [busy, setBusy] = useState(false)
  const controls = useRef<{ stop: () => void } | null>(null)
  const lookup = async (code: string) => {
    const clean = code.replace(/\s/g, '')
    if (!/^\d{8,14}$/.test(clean)) { setStatus('El codi ha de tenir entre 8 i 14 xifres.'); return }
    setBusy(true); setStatus('Consultant Open Food Facts…')
    try {
      const response = await fetch('https://world.openfoodfacts.org/api/v2/product/' + encodeURIComponent(clean) + '.json?fields=product_name,brands,quantity')
      if (!response.ok) throw new Error('No s’ha pogut consultar Open Food Facts.')
      const data = await response.json()
      if (data.status !== 1 || !data.product?.product_name) { setStatus('No hem trobat aquest producte. Pots introduir-lo manualment.'); setFound(null); return }
      setFound({ name: data.product.product_name, brand: data.product.brands || undefined, barcode: clean, quantity: data.product.quantity || undefined })
      setStatus('Producte trobat. Revisa les dades abans d’afegir-lo.')
    } catch { setStatus('No s’ha pogut consultar la base de dades. Comprova la connexió o introdueix el producte manualment.') }
    finally { setBusy(false) }
  }
  useEffect(() => {
    let cancelled = false
    const start = async () => {
      try {
        if (!window.ZXing) {
          setStatus('Carregant el lector de codis…')
          await new Promise<void>((resolve, reject) => {
            const existing = document.querySelector<HTMLScriptElement>('script[data-zxing]')
            if (existing) { if (window.ZXing) resolve(); else { existing.addEventListener('load', () => resolve(), { once: true }); existing.addEventListener('error', () => reject(), { once: true }) }; return }
            const script = document.createElement('script'); script.src = 'https://unpkg.com/@zxing/library@0.21.3/umd/index.min.js'; script.async = true; script.dataset.zxing = 'true'; script.onload = () => resolve(); script.onerror = () => reject(); document.head.appendChild(script)
          })
        }
        if (cancelled) return
        if (!window.ZXing || !video.current) throw new Error('No s’ha pogut carregar el lector.')
        const reader = new window.ZXing.BrowserMultiFormatReader()
        setStatus('Apunta la càmera al codi de barres.')
        controls.current = await reader.decodeFromVideoDevice(undefined, video.current, (result) => {
          if (result && !cancelled) { const code = result.getText(); setBarcode(code); controls.current?.stop(); void lookup(code) }
        })
      } catch { if (!cancelled) setStatus('No s’ha pogut iniciar la càmera. Comprova els permisos o introdueix el codi manualment.') }
    }
    void start()
    return () => { cancelled = true; controls.current?.stop(); controls.current = null }
  }, [])
  return <Sheet title="Escaneja un codi de barres" onClose={onClose}>
    <div className="space-y-3">
      <video ref={video} className="max-h-64 w-full rounded-xl bg-black object-cover" muted playsInline />
      <p className="text-sm text-mute">{status}</p>
      <div className="flex gap-2"><input className="min-w-0 flex-1" inputMode="numeric" value={barcode} onChange={(e) => setBarcode(e.target.value)} placeholder="O escriu el codi de barres" /><button className="btn-s" disabled={busy || !barcode.trim()} onClick={() => void lookup(barcode)}>Cerca</button></div>
      {found && <div className="card"><div className="font-semibold">{found.name}</div>{found.brand && <div className="text-sm text-mute">{found.brand}</div>}{found.quantity && <div className="text-xs text-mute">{found.quantity}</div>}<button className="btn-p mt-3 w-full" onClick={() => onProduct(found)}>Utilitza aquest producte</button></div>}
      <p className="text-xs text-mute">La lectura utilitza la càmera del dispositiu i consulta Open Food Facts. Si el producte no hi és, pots afegir-lo manualment.</p>
    </div>
  </Sheet>
}

export default function Compra({ onModeChange }: { onModeChange?: (active: boolean) => void }) {
  const lists = useLiveQuery(() => db.lists.toArray(), [], [])
  const [sel, setSel] = useState<number | undefined>()
  const [newName, setNewName] = useState('')
  const [budgetInput, setBudgetInput] = useState('')
  const cur = lists.find((l) => l.id === sel) ?? lists[0]
  useEffect(() => { setBudgetInput(cur?.budget === undefined ? '' : String(cur.budget)) }, [cur?.id, cur?.budget])
  const items = useLiveQuery(() => (cur ? db.listItems.where('listId').equals(cur.id!).toArray() : []), [cur?.id], [] as ListItem[])
  const cats = useLiveQuery(() => db.categories.toArray(), [], [])
  const stores = useLiveQuery(() => db.stores.filter((s) => !s.archived).toArray(), [], [])
  const purchases = useLiveQuery(() => db.purchases.toArray(), [], [] as Purchase[])
  const products = useLiveQuery(() => db.products.toArray(), [], [] as Product[])
  const [adding, setAdding] = useState(false)
  const [scanning, setScanning] = useState(false)
  const [voiceAdding, setVoiceAdding] = useState(false)
  const [scanResult, setScanResult] = useState<OffProduct | null>(null)
  const [confirming, setConfirming] = useState(false)
  const [shoppingMode, setShoppingMode] = useState(false)
  const [group, setGroup] = useState<'categoria' | 'establiment' | 'seccio'>('seccio')
  const [storeFilter, setStoreFilter] = useState<number | 'all' | 'none'>('all')
  const visibleItems = items.filter((i) => storeFilter === 'all' || (storeFilter === 'none' ? !i.storeId : i.storeId === storeFilter))
  const pendingEstimate = items.filter((i) => !i.bought).reduce((s, i) => s + (i.estPrice ?? 0) * i.qty, 0)
  const spent = (cur?.spentTotal ?? 0) + items.filter((i) => i.bought).reduce((s, i) => s + (i.paidPrice ?? i.estPrice ?? 0) * i.qty, 0)
  const totalPlan = pendingEstimate + spent
  const budget = cur?.budget ?? 0
  const groups = new Map<string, ListItem[]>()
  for (const i of visibleItems) {
    const k = group === 'categoria' ? (cats.find((c) => c.id === i.categoryId)?.name ?? 'Sense categoria') : group === 'establiment' ? (stores.find((s) => s.id === i.storeId)?.name ?? 'Sense establiment') : (i.section || sectionForCategory(cats.find((c) => c.id === i.categoryId)?.name) || 'Altres')
    groups.set(k, [...(groups.get(k) ?? []), i])
  }
  return (
    <>
      <Title right={<div className="flex gap-2"><button type="button" className="btn-s" onClick={() => setVoiceAdding(true)} disabled={!cur}>🎙️ Veu</button><button type="button" className="btn-s" onClick={() => setScanning(true)} disabled={!cur}>▦ Escaneja</button><button type="button" className="btn-p" onClick={() => setAdding(true)} disabled={!cur}>＋ Producte</button></div>}>Compra</Title>
      <div className="mb-3 flex gap-2 overflow-x-auto">
        {lists.map((l) => <button key={l.id} onClick={() => { setSel(l.id); setStoreFilter('all') }} className={cur?.id === l.id ? 'btn-p !min-h-[36px]' : 'btn-s !min-h-[36px]'}>{l.name}</button>)}
      </div>
      <form className="mb-4 flex gap-2" onSubmit={async (e) => { e.preventDefault(); if (!newName.trim()) return; const id = (await db.lists.add({ name: newName.trim(), createdAt: new Date().toISOString() })) as number; setSel(id); setNewName('') }}>
        <input placeholder={lists.length ? 'Nova llista…' : 'Crea la primera llista (ex.: Compra setmanal)'} value={newName} onChange={(e) => setNewName(e.target.value)} />
        <button className="btn-s">Crea</button>
      </form>
      {!cur && <Empty>Encara no tens cap llista de compra.</Empty>}
      {cur && <FavoriteProducts listId={cur.id!} products={products.filter((p) => p.favorite)} cats={cats} stores={stores} />}
      {cur && (
        <>
          <div className="mb-3"><button type="button" className="btn-p w-full !min-h-[52px] text-base" onClick={() => { setShoppingMode(true); onModeChange?.(true) }} disabled={!items.some((i) => !i.bought)}>🛒 Comença a comprar</button></div>
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2 text-sm">
            <div className="min-w-0"><div className="text-mute">Pendent estimat: <b className="text-ink">{eur(pendingEstimate)}</b> · Comprat (real o estimat): <b className="text-ink">{eur(spent)}</b></div><div className="text-xs text-mute">Total previst: {eur(totalPlan)}{budget > 0 ? ' · Pressupost: ' + eur(budget) : ''}</div></div>
            <select className="!w-auto" value={group} onChange={(e) => setGroup(e.target.value as 'categoria' | 'establiment' | 'seccio')} aria-label="Agrupa per"><option value="seccio">Per secció</option><option value="categoria">Per categoria</option><option value="establiment">Per establiment</option></select>
          </div>
          <div className="mb-3 flex flex-wrap items-center gap-2 rounded-xl bg-page p-3"><label className="text-sm font-medium" htmlFor="list-budget">Pressupost de la llista (€)</label><input id="list-budget" className="!w-28 !min-h-[36px]" inputMode="decimal" type="number" min="0" step="0.01" value={budgetInput} placeholder="Sense límit" onChange={(e) => setBudgetInput(e.target.value)} onBlur={() => { const v=budgetInput.trim().replace(',', '.'); const n=v === '' ? undefined : Number(v); if (n === undefined || (Number.isFinite(n) && n >= 0)) db.lists.update(cur.id!, { budget: n }) }} /><span className="text-xs text-mute">{budget > 0 ? Math.round(totalPlan / budget * 100) + '% del pressupost' : 'Sense pressupost definit'}</span>{budget > 0 && <div className="h-2 w-full overflow-hidden rounded-full bg-line"><div className={`h-full ${totalPlan > budget ? 'bg-bad' : totalPlan >= budget * .8 ? 'bg-warn' : 'bg-brand'}`} style={{ width: `${Math.min(100, totalPlan / budget * 100)}%` }} /></div>}{budget > 0 && totalPlan > budget && <p className="w-full text-xs font-medium text-bad">La compra supera el pressupost en {eur(totalPlan - budget)}.</p>}</div>
          <div className="mb-3 flex gap-2 overflow-x-auto pb-1" aria-label="Filtra per establiment">
            <button className={storeFilter === 'all' ? 'btn-p !min-h-[36px]' : 'btn-s !min-h-[36px]'} onClick={() => setStoreFilter('all')}>Tots ({items.filter((i) => !i.bought).length})</button>
            {stores.map((store) => <button key={store.id} className={storeFilter === store.id ? 'btn-p !min-h-[36px]' : 'btn-s !min-h-[36px]'} onClick={() => setStoreFilter(store.id!)}>{store.name} ({items.filter((i) => i.storeId === store.id && !i.bought).length})</button>)}
            <button className={storeFilter === 'none' ? 'btn-p !min-h-[36px]' : 'btn-s !min-h-[36px]'} onClick={() => setStoreFilter('none')}>Sense establiment ({items.filter((i) => !i.storeId && !i.bought).length})</button>
          </div>
          {visibleItems.length === 0 && <Empty>{storeFilter === 'all' ? 'La llista és buida.' : 'No hi ha productes pendents en aquest establiment.'}</Empty>}
          {[...groups.entries()].map(([g, xs]) => (
            <section key={g} className="mb-4">
              <h2 className="mb-1 text-sm font-semibold text-mute">{g}</h2>
              <ul className="space-y-2">{xs.map((i) => (
                <li key={i.id} className="card flex items-center gap-3 !p-3">
                  <input type="checkbox" checked={!!i.bought} onChange={(e) => db.listItems.update(i.id!, { bought: e.target.checked, ...(e.target.checked && i.paidPrice === undefined && i.estPrice !== undefined ? { paidPrice: i.estPrice } : {}) })} aria-label={`Marca ${i.name} com a comprat`} />
                  <ProductVisual photo={i.photo} emoji={i.emoji} fallback={cats.find((c) => c.id === i.categoryId)?.icon} size="sm" />
                  <div className={`min-w-0 flex-1 ${i.bought ? 'line-through opacity-50' : ''}`}>
                    <div className="truncate font-medium">{i.name}</div>
                    <div className="text-xs text-mute">{i.qty} {i.unit}{i.note ? ` · ${i.note}` : ''}</div>
                    {!i.bought ? <div className="mt-1 flex items-center gap-2 text-xs text-mute"><span>Estimació €/u</span><input className="!w-24 !min-h-[32px] !py-1" inputMode="decimal" aria-label={`Preu estimat de ${i.name}`} value={i.estPrice ?? ''} placeholder="Sense preu" onChange={(e) => { const value = e.target.value.trim(); const price = value === '' ? undefined : num(value); if (price === undefined || (Number.isFinite(price) && price >= 0)) db.listItems.update(i.id!, { estPrice: price, estSource: price === undefined ? undefined : 'manual' }) }} />{i.estPrice !== undefined && <span>{eur(i.estPrice * i.qty)} total</span>}</div> : <div className="mt-1 flex items-center gap-2 text-xs text-mute"><span>Pagat €/u</span><input className="!w-24 !min-h-[32px] !py-1" inputMode="decimal" aria-label={`Preu pagat de ${i.name}`} value={i.paidPrice ?? ''} placeholder="Sense dada" onChange={(e) => { const v=e.target.value.trim(); const p=v === '' ? undefined : num(v); if (p === undefined || (Number.isFinite(p) && p >= 0)) db.listItems.update(i.id!, { paidPrice: p }) }} />{i.paidPrice !== undefined && <span>{eur(i.paidPrice * i.qty)} total</span>}</div>}
                  </div>
                  <button className="btn-g !px-2" onClick={() => db.listItems.delete(i.id!)} aria-label={`Elimina ${i.name}`}>🗑</button>
                </li>))}
              </ul>
            </section>
          ))}
          <div className="mt-4 grid grid-cols-2 gap-2">
            <button className="btn-p" onClick={() => setConfirming(true)} disabled={!items.some((i) => i.bought)}>Confirma la compra</button>
            <button className="btn-s" onClick={async () => { const id = (await db.lists.add({ name: `${cur.name} (còpia)`, createdAt: new Date().toISOString(), budget: cur.budget })) as number; await db.listItems.bulkAdd(items.map(({ id: _i, ...r }) => ({ ...r, listId: id, bought: false, paidPrice: undefined }))); setSel(id) }}>Reutilitza</button>
            <button className="btn-d col-span-2" onClick={async () => { if (confirm('Eliminar la llista sencera?')) { await db.listItems.where('listId').equals(cur.id!).delete(); await db.lists.delete(cur.id!); setSel(undefined) } }}>Elimina la llista</button>
          </div>
        </>
      )}
      {shoppingMode && cur && <ShoppingMode listName={cur.name} items={items} stores={stores} cats={cats} onClose={() => { setShoppingMode(false); onModeChange?.(false) }} onConfirm={() => { setShoppingMode(false); onModeChange?.(false); setConfirming(true) }} />}
      {voiceAdding && cur && <VoiceAdd listId={cur.id!} products={products} cats={cats} stores={stores} onClose={() => setVoiceAdding(false)} />}
      {scanning && <BarcodeLookup onProduct={(p) => { setScanResult(p); setAdding(true); setScanning(false) }} onClose={() => setScanning(false)} />}
      {adding && cur && <AddItem listId={cur.id!} cats={cats} stores={stores} purchases={purchases} scanResult={scanResult} onScanUsed={() => setScanResult(null)} defaultStoreId={typeof storeFilter === 'number' ? storeFilter : undefined} onClose={() => setAdding(false)} />}
      {confirming && cur && <ConfirmBuy listId={cur.id!} items={items.filter((i) => i.bought)} onClose={() => setConfirming(false)} />}
    </>
  )
}




type VoiceLine = { id: number; name: string; qty: string; unit: string }
type SpeechRecognitionLike = {
  lang: string
  interimResults: boolean
  continuous: boolean
  onresult: ((event: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null
  onerror: ((event: { error: string }) => void) | null
  onend: (() => void) | null
  start: () => void
  stop: () => void
}
declare global {
  interface Window {
    SpeechRecognition?: new () => SpeechRecognitionLike
    webkitSpeechRecognition?: new () => SpeechRecognitionLike
  }
}
const NUMBER_WORDS: Record<string, number> = {
  un: 1, una: 1, uno: 1, una: 1, dos: 2, dues: 2, dos: 2, tres: 3, quatre: 4, cuatro: 4,
  cinc: 5, cinco: 5, sis: 6, seis: 6, set: 7, siete: 7, vuit: 8, ocho: 8, nou: 9, nueve: 9,
  deu: 10, diez: 10, mig: 0.5, media: 0.5, medio: 0.5
}
function parseVoiceItems(raw: string): VoiceLine[] {
  const chunks = raw.replace(/[\n;]+/g, ",").split(/,|\s+ i \s+|\s+and\s+|\s+y\s+/i).map((x) => x.trim()).filter(Boolean)
  const rows: VoiceLine[] = []
  for (const chunk of chunks) {
    const match = chunk.match(/^([\d]+(?:[.,]\d+)?|[a-zà-ÿ]+)?\s*(litres?|litros?|litres|l|ml|quilos?|kilos?|kg|grams?|gramos?|g|paquets?|paquetes?|ampolles?|botellas?|llaunes?|latas?|pots?|botes?|caixes?|cajas?|unitats?|unidades?|ud)?\s*(?:de\s+)?(.+)$/i)
    if (!match) { rows.push({ id: rows.length, name: chunk, qty: "1", unit: "ud" }); continue }
    const qtyRaw = (match[1] || "1").toLocaleLowerCase()
    const qty = NUMBER_WORDS[qtyRaw] ?? Number(qtyRaw.replace(",", "."))
    const unitRaw = (match[2] || "ud").toLocaleLowerCase()
    const unit = /^(l|litre|litres|litro|litros)$/.test(unitRaw) ? "l"
      : unitRaw === "ml" ? "ml"
      : /^(kg|quilo|quilos|kilo|kilos)$/.test(unitRaw) ? "kg"
      : /^(g|gram|grams|gramo|gramos)$/.test(unitRaw) ? "g"
      : /^(paquet|paquets|paquete|paquetes)$/.test(unitRaw) ? "paquet"
      : /^(ampolla|ampolles|botella|botellas)$/.test(unitRaw) ? "ampolla"
      : /^(llauna|llaunes|lata|latas)$/.test(unitRaw) ? "llauna"
      : /^(pot|pots|bote|botes)$/.test(unitRaw) ? "pot"
      : /^(caixa|caixes|caja|cajas)$/.test(unitRaw) ? "caixa" : "ud"
    const name = (match[3] || "").trim().replace(/[.!?]+$/, "")
    if (name) rows.push({ id: rows.length, name, qty: String(Number.isFinite(qty) && qty > 0 ? qty : 1), unit })
  }
  return rows
}
function VoiceAdd({ listId, products, cats, stores, onClose }: {
  listId: number
  products: Product[]
  cats: { id?: number; name: string }[]
  stores: { id?: number; name: string }[]
  onClose: () => void
}) {
  const [language, setLanguage] = useState("ca-ES")
  const [transcript, setTranscript] = useState("")
  const [lines, setLines] = useState<VoiceLine[]>([])
  const [listening, setListening] = useState(false)
  const [status, setStatus] = useState("")
  const recognition = useRef<SpeechRecognitionLike | null>(null)
  const supported = typeof window !== "undefined" && !!(window.SpeechRecognition || window.webkitSpeechRecognition)
  useEffect(() => () => { recognition.current?.stop() }, [])
  const start = () => {
    const Speech = window.SpeechRecognition || window.webkitSpeechRecognition
    if (!Speech) { setStatus("Aquest navegador no ofereix reconeixement de veu. Pots utilitzar el dictat del teclat o escriure la frase."); return }
    try {
      const rec = new Speech()
      recognition.current = rec
      rec.lang = language
      rec.interimResults = false
      rec.continuous = false
      rec.onresult = (event) => {
        const spoken = Array.from(event.results).map((result) => result[0]?.transcript ?? "").join(" ")
        setTranscript((current) => current ? current + ", " + spoken : spoken)
        setStatus("Transcripció rebuda. Revisa el text abans de convertir-lo.")
      }
      rec.onerror = (event) => { setStatus(event.error === "not-allowed" ? "Cal donar permís al micròfon. També pots utilitzar el dictat del teclat." : "No s'ha pogut reconèixer la veu. Torna-ho a provar o utilitza el dictat del teclat."); setListening(false) }
      rec.onend = () => setListening(false)
      setStatus("Escoltant… parla ara.")
      setListening(true)
      rec.start()
    } catch { setListening(false); setStatus("No s'ha pogut iniciar el micròfon. Pots escriure o dictar amb el teclat.") }
  }
  const convert = () => {
    const parsed = parseVoiceItems(transcript)
    setLines(parsed)
    setStatus(parsed.length ? "Revisa els productes, les quantitats i les unitats abans d'afegir-los." : "No he pogut identificar cap producte. Prova de separar-los amb comes.")
  }
  const updateLine = (id: number, patch: Partial<VoiceLine>) => setLines((current) => current.map((line) => line.id === id ? { ...line, ...patch } : line))
  const addAll = async () => {
    const valid = lines.filter((line) => line.name.trim() && Number(line.qty.replace(",", ".")) > 0)
    for (const line of valid) {
      const qty = Number(line.qty.replace(",", "."))
      const matched = products.find((p) => p.name.trim().toLocaleLowerCase("ca") === line.name.trim().toLocaleLowerCase("ca"))
      const storeId = matched?.preferredStoreId
      const rows = await db.listItems.where("listId").equals(listId).toArray()
      const existing = rows.find((row) => !row.bought && row.name.trim().toLocaleLowerCase("ca") === line.name.trim().toLocaleLowerCase("ca") && row.unit === line.unit)
      if (existing) {
        await db.listItems.update(existing.id!, { qty: Math.round((existing.qty + qty) * 1000) / 1000, ...(storeId !== undefined ? { storeId } : {}) })
      } else {
        const category = matched?.categoryId ?? cats.find((cat) => cat.name.toLocaleLowerCase("ca").includes(line.name.toLocaleLowerCase("ca")))?.id
        await db.listItems.add({ listId, name: matched?.name ?? line.name.trim(), qty, unit: line.unit, storeId, categoryId: category, photo: matched?.photo, emoji: matched?.emoji, brand: matched?.brand, barcode: matched?.barcode, estPrice: matched?.price })
      }
    }
    onClose()
  }
  return <Sheet title="Afegeix productes per veu" onClose={onClose}>
    <div className="space-y-3">
      <p className="text-sm text-mute">Digues els productes seguits i revisa la llista abans d'afegir-la. Exemple: «Afegeix dos litres de llet, un paquet d'arròs i sis iogurts».</p>
      <Field label="Idioma de reconeixement"><select value={language} onChange={(e) => setLanguage(e.target.value)}><option value="ca-ES">Català</option><option value="es-ES">Castellà</option><option value="en-US">Anglès</option></select></Field>
      <button type="button" className="btn-p w-full" onClick={start} disabled={listening}>{listening ? "Escoltant…" : "🎙️ Comença a parlar"}</button>
      {!supported && <p className="text-xs text-mute">El reconeixement integrat no està disponible en aquest navegador. Pots utilitzar el micròfon del teclat per dictar dins del camp de text.</p>}
      <Field label="Transcripció (també pots escriure o dictar amb el teclat)"><textarea rows={3} value={transcript} onChange={(e) => setTranscript(e.target.value)} placeholder="Dos litres de llet, un paquet d'arròs…" /></Field>
      <button type="button" className="btn-s w-full" onClick={convert} disabled={!transcript.trim()}>Converteix en productes</button>
      {status && <p className="text-sm text-mute" role="status">{status}</p>}
      {lines.length > 0 && <>
        <div className="space-y-2">
          {lines.map((line) => <div key={line.id} className="grid grid-cols-[minmax(0,1fr)_76px_92px] gap-2 rounded-xl border border-line p-2">
            <input aria-label="Nom del producte" value={line.name} onChange={(e) => updateLine(line.id, { name: e.target.value })} />
            <input aria-label="Quantitat" inputMode="decimal" value={line.qty} onChange={(e) => updateLine(line.id, { qty: e.target.value })} />
            <select aria-label="Unitat" value={line.unit} onChange={(e) => updateLine(line.id, { unit: e.target.value })}>{UNITS.map((unit) => <option key={unit}>{unit}</option>)}</select>
          </div>)}
        </div>
        <button type="button" className="btn-p w-full" onClick={() => void addAll()} disabled={!lines.some((line) => line.name.trim() && Number(line.qty.replace(",", ".")) > 0)}>Afegeix {lines.length} productes a la llista</button>
      </>}
      <p className="text-xs text-mute">El reconeixement de veu depèn del navegador i pot enviar l'àudio al servei del proveïdor. Si no està disponible, el dictat del teclat és una alternativa. No s'afegeixen productes fins que no els revisis i confirmis.</p>
    </div>
  </Sheet>
}

function FavoriteProducts({ listId, products, cats, stores }: {
  listId: number
  products: Product[]
  cats: { id?: number; name: string; icon?: string }[]
  stores: { id?: number; name: string }[]
}) {
  const [quantities, setQuantities] = useState<Record<number, string>>({})
  const [selected, setSelected] = useState<Set<number>>(new Set())
  const [open, setOpen] = useState(true)
  const qtyFor = (p: Product) => quantities[p.id!] ?? String(p.habitualQty ?? 1)
  const addOne = async (p: Product) => {
    const qty = num(qtyFor(p))
    if (!Number.isFinite(qty) || qty <= 0) return
    const unit = p.habitualUnit || p.unit
    const rows = await db.listItems.where("listId").equals(listId).toArray()
    const existing = rows.find((item) => !item.bought && item.name.trim().toLocaleLowerCase("ca") === p.name.trim().toLocaleLowerCase("ca") && item.unit === unit)
    if (existing) {
      await db.listItems.update(existing.id!, { qty: Math.round((existing.qty + qty) * 1000) / 1000, storeId: p.preferredStoreId ?? existing.storeId })
    } else {
      await db.listItems.add({ listId, name: p.name, qty, unit, storeId: p.preferredStoreId, categoryId: p.categoryId, photo: p.photo, emoji: p.emoji, brand: p.brand, barcode: p.barcode, estPrice: p.price })
    }
    await db.products.update(p.id!, { habitualQty: qty, habitualUnit: unit })
  }
  const addSelected = async () => {
    for (const p of products.filter((product) => selected.has(product.id!))) await addOne(p)
    setSelected(new Set())
    alert("Productes habituals afegits a la llista.")
  }
  return (
    <section className="mb-4 rounded-xl border border-line bg-page p-3">
      <button type="button" className="flex w-full items-center justify-between text-left font-semibold" onClick={() => setOpen(!open)}>
        <span>★ Productes habituals ({products.length})</span><span className="text-sm text-mute">{open ? "Amaga −" : "Mostra +"}</span>
      </button>
      {open && (products.length === 0 ? <p className="mt-2 text-sm text-mute">Marca productes amb ☆ des del rebost per tenir-los aquí i afegir-los ràpidament.</p> : <>
        <div className="mt-3 space-y-2">
          {products.map((p) => <div key={p.id} className="flex items-center gap-2 rounded-lg bg-surface p-2">
            <input type="checkbox" checked={selected.has(p.id!)} onChange={(e) => { const next = new Set(selected); e.target.checked ? next.add(p.id!) : next.delete(p.id!); setSelected(next) }} aria-label={`Selecciona ${p.name}`} />
            <ProductVisual photo={p.photo} emoji={p.emoji} fallback={cats.find((c) => c.id === p.categoryId)?.icon} size="sm" />
            <div className="min-w-0 flex-1"><div className="truncate text-sm font-medium">{p.name}</div><div className="text-xs text-mute">{p.brand ? p.brand + " · " : ""}{stores.find((s) => s.id === p.preferredStoreId)?.name ?? "Sense establiment preferit"}</div></div>
            <div className="flex items-center gap-1"><input className="!w-16 !min-h-[36px] !px-1" inputMode="decimal" aria-label={`Quantitat habitual de ${p.name}`} value={qtyFor(p)} onChange={(e) => setQuantities((old) => ({ ...old, [p.id!]: e.target.value }))} /><span className="text-xs text-mute">{p.habitualUnit || p.unit}</span></div>
            <button type="button" className="btn-p !min-h-[36px] !px-2" onClick={() => void addOne(p)}>＋</button>
          </div>)}
        </div>
        {selected.size > 0 && <button type="button" className="btn-p mt-3 w-full" onClick={() => void addSelected()}>Afegeix els {selected.size} seleccionats</button>}
      </>)}
    </section>
  )
}

function ShoppingMode({ listName, items, stores, cats, onClose, onConfirm }: {
  listName: string
  items: ListItem[]
  stores: { id?: number; name: string }[]
  cats: { id?: number; name: string; icon?: string }[]
  onClose: () => void
  onConfirm: () => void
}) {
  const [storeFilter, setStoreFilter] = useState<number | 'all' | 'none'>('all')
  const [lastMarked, setLastMarked] = useState<number | undefined>()
  const pending = items.filter((item) => !item.bought)
  const visible = pending.filter((item) => storeFilter === 'all' || (storeFilter === 'none' ? !item.storeId : item.storeId === storeFilter))
  const bought = items.filter((item) => item.bought)
  const progress = items.length ? Math.round(bought.length / items.length * 100) : 0
  const estimate = pending.reduce((sum, item) => sum + (item.estPrice ?? 0) * item.qty, 0)
  const groups = new Map<string, ListItem[]>()
  for (const item of visible) {
    const section = item.section || sectionForCategory(cats.find((category) => category.id === item.categoryId)?.name)
    groups.set(section, [...(groups.get(section) ?? []), item])
  }
  const markBought = async (item: ListItem) => {
    await db.listItems.update(item.id!, { bought: true, ...(item.paidPrice === undefined && item.estPrice !== undefined ? { paidPrice: item.estPrice } : {}) })
    setLastMarked(item.id)
  }
  const undo = async () => {
    if (lastMarked === undefined) return
    await db.listItems.update(lastMarked, { bought: false })
    setLastMarked(undefined)
  }
  const lastItem = items.find((item) => item.id === lastMarked && item.bought)
  return (
    <div className="shopping-mode fixed inset-0 z-[60] flex flex-col bg-bg" role="dialog" aria-modal="true" aria-label="Mode compra">
      <header className="shrink-0 border-b border-line bg-surface px-4 pb-3 pt-[calc(0.75rem+env(safe-area-inset-top))]">
        <div className="mx-auto flex max-w-2xl items-center justify-between gap-3">
          <div className="min-w-0"><p className="text-xs font-medium uppercase tracking-wide text-mute">Mode compra</p><h1 className="truncate text-xl font-bold">{listName}</h1></div>
          <button type="button" className="btn-s !min-h-[40px] !px-3" onClick={onClose}>Surt ✕</button>
        </div>
        <div className="mx-auto mt-3 max-w-2xl">
          <div className="mb-1 flex justify-between text-sm"><span>{bought.length} de {items.length} productes</span><b>{progress}%</b></div>
          <div className="h-2.5 overflow-hidden rounded-full bg-line"><div className="h-full rounded-full bg-brand transition-all" style={{ width: progress + '%' }} /></div>
          <div className="mt-2 flex justify-between text-xs text-mute"><span>{pending.length} pendents</span><span>Estimació pendent: {eur(estimate)}</span></div>
        </div>
      </header>
      <div className="shrink-0 border-b border-line bg-bg px-4 py-2">
        <div className="mx-auto flex max-w-2xl gap-2 overflow-x-auto">
          <button type="button" className={storeFilter === 'all' ? 'btn-p !min-h-[36px]' : 'btn-s !min-h-[36px]'} onClick={() => setStoreFilter('all')}>Tots ({pending.length})</button>
          {stores.map((store) => <button type="button" key={store.id} className={storeFilter === store.id ? 'btn-p !min-h-[36px]' : 'btn-s !min-h-[36px]'} onClick={() => setStoreFilter(store.id!)}>{store.name} ({pending.filter((item) => item.storeId === store.id).length})</button>)}
          <button type="button" className={storeFilter === 'none' ? 'btn-p !min-h-[36px]' : 'btn-s !min-h-[36px]'} onClick={() => setStoreFilter('none')}>Sense establiment ({pending.filter((item) => !item.storeId).length})</button>
        </div>
      </div>
      <main className="min-h-0 flex-1 overflow-y-auto px-4 py-3 pb-[calc(1rem+env(safe-area-inset-bottom))]">
        <div className="mx-auto max-w-2xl">
          {lastItem && <button type="button" className="mb-3 w-full rounded-xl border border-brand/30 bg-brandsoft px-4 py-3 text-left text-sm font-semibold text-brand" onClick={() => void undo()}>↶ Desfés: {lastItem.name}</button>}
          {pending.length === 0 ? (
            <div className="card py-8 text-center">
              <div className="mb-2 text-4xl">🎉</div><h2 className="text-xl font-bold">Compra completada!</h2>
              <p className="mt-2 text-sm text-mute">Has marcat tots els {items.length} productes de la llista.</p>
              <p className="mt-1 text-lg font-semibold">{eur(bought.reduce((sum, item) => sum + (item.paidPrice ?? item.estPrice ?? 0) * item.qty, 0))}</p>
              <button type="button" className="btn-p mt-5 w-full" onClick={onConfirm}>Confirma la compra</button>
              <button type="button" className="btn-s mt-2 w-full" onClick={onClose}>Torna a la llista</button>
            </div>
          ) : visible.length === 0 ? (
            <div className="card text-center text-sm text-mute">No queden productes pendents en aquest establiment.</div>
          ) : [...groups.entries()].map(([section, sectionItems]) => (
            <section key={section} className="mb-5">
              <h2 className="mb-2 text-sm font-bold uppercase tracking-wide text-mute">{section}</h2>
              <ul className="space-y-2">{sectionItems.map((item) => (
                <li key={item.id}>
                  <button type="button" className="card flex min-h-[76px] w-full items-center gap-3 !p-3 text-left active:scale-[.99]" onClick={() => void markBought(item)} aria-label={`Marca ${item.name} com a comprat`}>
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border-2 border-brand/50 text-brand"><span className="text-lg">＋</span></span>
                    <span className="min-w-0 flex-1"><span className="block font-semibold">{item.name}</span><span className="text-sm text-mute">{item.qty} {item.unit}{item.note ? ' · ' + item.note : ''}</span></span>
                    <span className="shrink-0 text-xs text-mute">{item.estPrice !== undefined ? eur(item.estPrice * item.qty) : ''}</span>
                  </button>
                </li>
              ))}</ul>
            </section>
          ))}
        </div>
      </main>
      {pending.length > 0 && <footer className="shrink-0 border-t border-line bg-surface px-4 py-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))]"><div className="mx-auto flex max-w-2xl items-center justify-between gap-3"><span className="text-sm text-mute">{pending.length} productes per trobar</span><button type="button" className="btn-s !min-h-[40px]" onClick={onClose}>Pausa la compra</button></div></footer>}
    </div>
  )
}

function AddItem({ listId, cats, stores, purchases, scanResult, onScanUsed, defaultStoreId, onClose }: { listId: number; cats: { id?: number; name: string }[]; stores: { id?: number; name: string }[]; purchases: Purchase[]; scanResult: OffProduct | null; onScanUsed: () => void; defaultStoreId?: number; onClose: () => void }) {
  const [f, setF] = useState<Partial<ListItem>>({ qty: 1, unit: 'ud', storeId: defaultStoreId })
  const [selectedProductId, setSelectedProductId] = useState<number | ''>('')
  useEffect(() => { if (scanResult) { setF((x) => ({ ...x, name: scanResult.name, brand: scanResult.brand, barcode: scanResult.barcode })); onScanUsed() } }, [scanResult])
  const set = (k: keyof ListItem, v: unknown) => setF((x) => ({ ...x, [k]: v }))
  const suggestions = useLiveQuery(() => db.products.orderBy('name').toArray(), [], [])
  const save = async () => {
    if (!f.name?.trim()) return
    if (f.estPrice !== undefined && (!Number.isFinite(f.estPrice) || f.estPrice < 0)) { alert('El preu estimat ha de ser 0 € o superior.'); return }
    let item = { ...f, listId, name: f.name.trim() } as ListItem
    const matchedProduct = await findProduct(item.name, item.unit)
    if (matchedProduct) item = { ...item, categoryId: item.categoryId ?? matchedProduct.categoryId, brand: item.brand ?? matchedProduct.brand, barcode: item.barcode ?? matchedProduct.barcode, photo: item.photo ?? matchedProduct.photo, emoji: item.emoji ?? matchedProduct.emoji }
    const stores_ = await db.stores.toArray()
    const reviewed = purchases.filter((p) => p.status === 'Revisat' && p.lines.some((line) => line.name.trim().toLowerCase() === item.name.toLowerCase() && line.unit === item.unit && p.storeId))
    if (item.storeId === undefined && !defaultStoreId && reviewed.length) {
      const counts = new Map<number, { count: number; latest: string }>()
      for (const p of reviewed) { const sid = p.storeId!; const prev = counts.get(sid) ?? { count: 0, latest: '' }; counts.set(sid, { count: prev.count + 1, latest: p.date > prev.latest ? p.date : prev.latest }) }
      item.storeId = [...counts.entries()].sort((a, b) => b[1].count - a[1].count || b[1].latest.localeCompare(a[1].latest))[0]?.[0]
    }
    if (item.estPrice === undefined) {
      const obs = priceObservations(purchases, stores_).filter((o) => o.name === item.name.toLowerCase())
      const storeName = stores_.find((s) => s.id === item.storeId)?.name
      const matchingStore = storeName ? obs.filter((o) => o.storeName === storeName) : []
      const available = matchingStore.length ? matchingStore : obs
      const last = available[available.length - 1]
      if (last) { item = { ...item, estPrice: last.unitPrice, estSource: storeName && last.storeName === storeName ? 'última compra' : 'altre establiment' } }
    } else item.estSource = 'manual'
    const normalizedName = item.name.trim().toLocaleLowerCase()
    const existing = (await db.listItems.where('listId').equals(listId).toArray()).find((row) => !row.bought && row.name.trim().toLocaleLowerCase() === normalizedName && row.unit === item.unit)
    if (existing?.id !== undefined) {
      await db.listItems.update(existing.id, { qty: Math.round((existing.qty + item.qty) * 1000) / 1000, ...(item.estPrice !== undefined ? { estPrice: item.estPrice, estSource: item.estSource } : {}), ...(item.storeId !== undefined ? { storeId: item.storeId } : {}), ...(item.photo ? { photo: item.photo } : {}), ...(item.emoji ? { emoji: item.emoji } : {}) })
    } else {
      await db.listItems.add(item)
    }
    onClose()
  }
  return (
    <Sheet title="Afegeix a la llista" onClose={onClose}>
      <div className="space-y-3">
        <Field label="Producte (pots escriure'n un de nou)"><input autoFocus list="habituals" value={f.name ?? ''} onChange={(e) => { set('name', e.target.value); setSelectedProductId('') }} placeholder="Escriu el nom del producte" /></Field>
        <Field label="Marca (opcional)"><input value={f.brand ?? ''} onChange={(e) => set('brand', e.target.value)} placeholder="Marca del producte" /></Field>
        <datalist id="habituals">{suggestions.map((p) => <option key={p.id} value={p.name} />)}</datalist>
        <Field label="O selecciona un producte del rebost"><select value={selectedProductId} onChange={(e) => { const id = e.target.value ? Number(e.target.value) : ''; setSelectedProductId(id); const product = suggestions.find((p) => p.id === id); if (product) setF((current) => ({ ...current, name: product.name, unit: product.unit, categoryId: product.categoryId, estPrice: product.price, photo: product.photo, emoji: product.emoji, brand: product.brand, barcode: product.barcode })) }}><option value="">— Tria un producte —</option>{suggestions.map((p) => <option key={p.id} value={p.id}>{p.name} · {p.qty} {p.unit} disponibles</option>)}</select></Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Quantitat"><input inputMode="decimal" value={f.qty ?? ''} onChange={(e) => set('qty', num(e.target.value))} /></Field>
          <Field label="Unitat"><select value={f.unit} onChange={(e) => set('unit', e.target.value)}>{UNITS.map((u) => <option key={u}>{u}</option>)}</select></Field>
          <Field label="Categoria"><select value={f.categoryId ?? ''} onChange={(e) => set('categoryId', e.target.value ? Number(e.target.value) : undefined)}><option value="">—</option>{cats.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></Field>
          <Field label="Establiment"><select value={f.storeId ?? ''} onChange={(e) => set('storeId', e.target.value ? Number(e.target.value) : undefined)}><option value="">—</option>{stores.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></Field>
          <Field label="Secció de botiga"><select value={f.section ?? ''} onChange={(e) => set('section', e.target.value || undefined)}><option value="">Automàtica / Altres</option>{SHOP_SECTIONS.map((s) => <option key={s} value={s}>{s}</option>)}</select></Field>
        </div>
        <div className="flex items-center gap-3"><ProductVisual photo={f.photo} emoji={f.emoji} size="lg" /><div className="min-w-0 flex-1"><Field label="Foto (opcional)"><input type="file" accept="image/*" capture="environment" className="text-sm" onChange={(e) => { const file=e.target.files?.[0]; if(!file || !file.type.startsWith("image/")) return; const reader=new FileReader(); reader.onload=()=>{ const img=new Image(); img.onload=()=>{ const scale=Math.min(1,640/Math.max(img.width,img.height)); const canvas=document.createElement("canvas"); canvas.width=Math.max(1,Math.round(img.width*scale)); canvas.height=Math.max(1,Math.round(img.height*scale)); const ctx=canvas.getContext("2d"); if(ctx){ctx.drawImage(img,0,0,canvas.width,canvas.height);canvas.toBlob(blob=>{if(blob){set("photo",blob);set("emoji",undefined)}},"image/jpeg",0.78)} }; img.src=String(reader.result) }; reader.readAsDataURL(file) }} /></Field></div></div>
        <Field label="O tria un emoji"><div className="flex flex-wrap gap-2">{["🍎","🥬","🍗","🐟","🥚","🥖","🍝","🥫","🧀","🥣","🧊","💧","🧽","🧼","🧴","🧻","🧺","🐾","☕","🍫","🍚","🥛","🫒","📦"].map(emoji=><button key={emoji} type="button" onClick={()=>{set("emoji",emoji);set("photo",undefined)}} className={`rounded-lg border p-2 text-xl ${f.emoji===emoji?"border-brand bg-page":"border-line"}`}>{emoji}</button>)}</div></Field>
        {(f.photo || f.emoji) && <button type="button" className="btn-g" onClick={()=>{set("photo",undefined);set("emoji",undefined)}}>Treu la imatge</button>}
        <Field label="Preu estimat per unitat (€, opcional)"><input inputMode="decimal" value={f.estPrice ?? ''} onChange={(e) => set('estPrice', e.target.value ? num(e.target.value) : undefined)} /></Field>
        <Field label="Notes"><input value={f.note ?? ''} onChange={(e) => set('note', e.target.value)} /></Field>
        <button type="button" className="btn-p w-full" onClick={() => save()}>Afegeix a la llista</button>
      </div>
    </Sheet>
  )
}

function ConfirmBuy({ listId, items, onClose }: { listId: number; items: ListItem[]; onClose: () => void }) {
  const locs = useLiveQuery(() => db.locations.toArray(), [], [])
  const [pick, setPick] = useState<Set<number>>(new Set(items.map((i) => i.id!)))
  const [loc, setLoc] = useState<number | undefined>()
  const [done, setDone] = useState(false)
  const run = async () => {
    for (const i of items.filter((x) => pick.has(x.id!))) {
      const have = await findProduct(i.name, i.unit)
      if (have) { await db.products.update(have.id!, { qty: have.qty + i.qty, photo: have.photo ?? i.photo, emoji: have.emoji ?? i.emoji, brand: have.brand ?? i.brand, barcode: have.barcode ?? i.barcode }); await db.movements.add({ productId: have.id!, ts: new Date().toISOString(), delta: i.qty, kind: 'compra', ref: `llista:${i.id}` }) }
      else await addProduct({ name: i.name, qty: i.qty, unit: i.unit, categoryId: i.categoryId, locationId: loc, price: i.estPrice, photo: i.photo, emoji: i.emoji, brand: i.brand, barcode: i.barcode }, 'compra', `llista:${i.id}`)
    }
    const actual = items.reduce((sum, i) => sum + (i.paidPrice ?? i.estPrice ?? 0) * i.qty, 0)
    const list = await db.lists.get(listId)
    await db.lists.update(listId, { spentTotal: (list?.spentTotal ?? 0) + actual })
    await db.listItems.bulkDelete(items.map((i) => i.id!))
    setDone(true)
  }
  return (
    <Sheet title="Confirma la compra" onClose={onClose}>
      {done ? <><p className="mb-3">Fet. Els productes seleccionats ja són al rebost.</p><button className="btn-p w-full" onClick={onClose}>Tanca</button></> : <>
        <p className="mb-3 text-sm text-mute">Marcar un producte com a comprat no vol dir que ja sigui a casa. Tria quins vols afegir al rebost; la resta es treuen de la llista igualment.</p>
        <ul className="mb-3 space-y-1">{items.map((i) => <li key={i.id}><label className="flex items-center gap-2"><input type="checkbox" checked={pick.has(i.id!)} onChange={(e) => { const n = new Set(pick); e.target.checked ? n.add(i.id!) : n.delete(i.id!); setPick(n) }} />{i.name} <span className="text-xs text-mute">{i.qty} {i.unit}</span></label></li>)}</ul>
        <Field label="Ubicació dels productes nous"><select value={loc ?? ''} onChange={(e) => setLoc(e.target.value ? Number(e.target.value) : undefined)}><option value="">—</option>{locs.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}</select></Field>
        <button className="btn-p mt-4 w-full" onClick={run}>Confirma i afegeix al rebost</button>
      </>}
    </Sheet>
  )
}
