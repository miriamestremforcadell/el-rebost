export interface TicketOcrResult {
  text: string
  confidence: number
  date?: string
  total?: number
  discount: number
  lines: { name: string; qty: number; unitPrice?: number; amount: number }[]
}

type TesseractApi = {
  recognize: (image: string | Blob | HTMLCanvasElement, langs: string, options?: Record<string, unknown>) => Promise<{ data: { text: string; confidence: number } }>
}
type PdfApi = {
  GlobalWorkerOptions: { workerSrc: string }
  getDocument: (source: { data: Uint8Array }) => { promise: Promise<{ numPages: number; getPage: (n: number) => Promise<{ getViewport: (opts: { scale: number }) => { width: number; height: number }; render: (opts: { canvasContext: CanvasRenderingContext2D; viewport: { width: number; height: number } }) => { promise: Promise<void> } }> }> }
}
declare global {
  interface Window { Tesseract?: TesseractApi; pdfjsLib?: PdfApi }
}

const scripts = new Map<string, Promise<void>>()
function loadScript(src: string): Promise<void> {
  if (scripts.has(src)) return scripts.get(src)!
  const promise = new Promise<void>((resolve, reject) => {
    const script = document.createElement('script')
    script.src = src
    script.async = true
    script.onload = () => resolve()
    script.onerror = () => reject(new Error("No s'ha pogut carregar el motor de lectura. Comprova la connexió i torna-ho a provar."))
    document.head.appendChild(script)
  })
  scripts.set(src, promise)
  return promise
}

function parseText(text: string, confidence: number): TicketOcrResult {
  const lines = text.split(/\\r?\\n/).map((s) => s.replace(/\\s+/g, ' ').trim()).filter(Boolean)
  const dateMatch = text.match(/\\b(\\d{1,2})[./-](\\d{1,2})[./-](\\d{2,4})\\b/)
  let date: string | undefined
  if (dateMatch) {
    const year = dateMatch[3].length === 2 ? `20${dateMatch[3]}` : dateMatch[3]
    const month = dateMatch[2].padStart(2, '0')
    const day = dateMatch[1].padStart(2, '0')
    const candidate = `${year}-${month}-${day}`
    if (!Number.isNaN(Date.parse(candidate)) && Number(candidate.slice(0, 4)) >= 2000) date = candidate
  }

  const money = (s: string) => {
    const normalized = s.replace(/\\s/g, '').replace(/\\.(?=\\d{3}(?:[,€]|$))/g, '').replace(',', '.').replace(/[€]/g, '')
    const n = Number(normalized)
    return Number.isFinite(n) && Math.abs(n) < 100000 ? Math.round(n * 100) / 100 : undefined
  }
  let total: number | undefined
  for (let i = lines.length - 1; i >= 0; i--) {
    if (/\\b(total a pagar|total pagar|total|import|amount due|balance due)\\b/i.test(lines[i])) {
      const matches = [...lines[i].matchAll(/-?\\d{1,5}(?:[.,]\\d{2})/g)]
      if (matches.length) {
        const candidate = money(matches[matches.length - 1][0])
        if (candidate !== undefined && candidate >= 0) { total = candidate; break }
      }
    }
  }

  // Prioritza el total de descomptes del tiquet per evitar comptar dues vegades
  // les línies individuals d'oferta que també apareixen impreses.
  let discount: number | undefined
  const discountTotal = [...lines].reverse().find((line) => /total\\s+(?:dtes|descomptes?)\\b/i.test(line))
  if (discountTotal) {
    const matches = [...discountTotal.matchAll(/-?\\d{1,5}(?:[.,]\\d{2})/g)]
    if (matches.length) discount = Math.abs(money(matches[matches.length - 1][0]) ?? 0)
  }
  if (discount === undefined) {
    const offerDiscounts = lines.filter((line) => /descompte|oferta|\\b2a\\s*[- ]?\\s*50%/i.test(line))
      .map((line) => [...line.matchAll(/-\\s*\\d{1,5}[.,]\\d{2}|\\d{1,5}[.,]\\d{2}\\s*-?/g)].pop()?.[0])
      .filter((value): value is string => Boolean(value))
      .map((value) => Math.abs(money(value.replace(/\\s/g, '').replace(/-$/, '')) ?? 0))
    if (offerDiscounts.length) discount = Math.round(offerDiscounts.reduce((sum, value) => sum + value, 0) * 100) / 100
  }

  const items: { name: string; qty: number; unitPrice?: number; amount: number }[] = []
  for (const line of lines) {
    if (/\\b(total|subtotal|iva|vat|efectivo|tarjeta|cambio|descuento|descomptes?|dtes|gracias|cliente|fecha|ticket|tiquet|cajero|terminal|base imponible|a pagar|\\% descompte)\\b/i.test(line)) continue
    // Els tiquets poden imprimir: quantitat + preu unitari + import de línia
    // + estalvi T.Club. Aquest últim no es resta del total pagat.
    const quantityMatch = line.match(/^(\\d{1,3})\\s+(.+?)\\s+((?:\\d{1,5}[,.]\\d{2}\\s*){1,3})$/)
    if (quantityMatch) {
      const values = [...quantityMatch[3].matchAll(/\\d{1,5}[,.]\\d{2}/g)].map((m) => money(m[0])).filter((n): n is number => n !== undefined)
      if (values.length >= 2) {
        const qty = Number(quantityMatch[1])
        const name = quantityMatch[2].replace(/[|*_]/g, '').trim()
        if (qty > 0 && name.length >= 2 && values[1] > 0 && items.length < 80) {
          items.push({ name, qty, unitPrice: values[0], amount: values[1] })
          continue
        }
      }
    }
    // Sense quantitat explícita, el primer import és el preu de la línia;
    // una segona xifra final acostuma a ser l'estalvi de la targeta de fidelització.
    const single = line.match(/^(.{2,48}?)\\s+(\\d{1,5}[,.]\\d{2})(?:\\s+\\d{1,5}[,.]\\d{2})?\\s*€?$/)
    if (!single) continue
    const name = single[1].replace(/[|*_]/g, '').trim()
    const amount = money(single[2])
    if (name.length >= 2 && amount !== undefined && !/^\\d+$/.test(name) && items.length < 80) {
      items.push({ name, qty: 1, amount })
    }
  }
  return { text, confidence, date, total, discount: discount ?? 0, lines: items }
}
async function filePages(file: File): Promise<(Blob | HTMLCanvasElement)[]> {
  if (file.type.startsWith('image/')) return [file]
  if (file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf')) {
    throw new Error('Format no compatible. Tria una fotografia o un PDF.')
  }
  await loadScript('https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js')
  const pdf = window.pdfjsLib
  if (!pdf) throw new Error('No s’ha pogut iniciar el lector de PDF.')
  pdf.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js'
  const data = new Uint8Array(await file.arrayBuffer())
  const documentPdf = await pdf.getDocument({ data }).promise
  const canvases: HTMLCanvasElement[] = []
  const pageCount = Math.min(documentPdf.numPages, 8)
  for (let n = 1; n <= pageCount; n++) {
    const page = await documentPdf.getPage(n)
    const viewport = page.getViewport({ scale: 1.6 })
    const canvas = document.createElement('canvas')
    canvas.width = Math.ceil(viewport.width)
    canvas.height = Math.ceil(viewport.height)
    const ctx = canvas.getContext('2d')
    if (!ctx) continue
    await page.render({ canvasContext: ctx, viewport }).promise
    canvases.push(canvas)
  }
  return canvases
}

/** OCR runs in the browser; image/PDF bytes are not sent to an OCR API. OCR engines load from public CDNs. */
export async function readTicket(file: File, onProgress?: (progress: number) => void): Promise<TicketOcrResult> {
  if (file.size > 25 * 1024 * 1024) throw new Error('El fitxer supera els 25 MB. Comprimeix-lo o fes una foto més petita.')
  await loadScript('https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js')
  if (!window.Tesseract) throw new Error('No s’ha pogut iniciar el motor OCR.')
  const pages = await filePages(file)
  const parts: string[] = []
  const confidences: number[] = []
  for (let i = 0; i < pages.length; i++) {
    const result = await window.Tesseract.recognize(pages[i], 'cat+spa+eng', {
      logger: (m: { status?: string; progress?: number }) => {
        if (m.status === 'recognizing text' && typeof m.progress === 'number') onProgress?.((i + m.progress) / pages.length)
      },
    })
    parts.push(result.data.text)
    confidences.push(result.data.confidence)
  }
  return parseText(parts.join('\n'), confidences.length ? confidences.reduce((a, b) => a + b, 0) / confidences.length : 0)
}


export interface RecipeOcrResult { text: string; confidence: number }

/** Llegeix captures de receptes al navegador. Les imatges no s'envien a cap API. */
export async function readRecipeImages(files: File[], onProgress?: (progress: number) => void): Promise<RecipeOcrResult> {
  if (!files.length) throw new Error('Selecciona almenys una captura de pantalla.')
  if (files.length > 8) throw new Error('Pots importar fins a 8 captures alhora.')
  if (files.some((file) => !file.type.startsWith('image/'))) throw new Error('Selecciona fitxers d’imatge (JPG, PNG o WEBP).')
  if (files.some((file) => file.size > 20 * 1024 * 1024)) throw new Error('Cada imatge ha de pesar menys de 20 MB.')
  await loadScript('https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js')
  if (!window.Tesseract) throw new Error('No s’ha pogut iniciar el motor OCR.')
  const parts: string[] = []
  const confidences: number[] = []
  for (let i = 0; i < files.length; i++) {
    const result = await window.Tesseract.recognize(files[i], 'cat+spa+eng', {
      logger: (m: { status?: string; progress?: number }) => {
        if (m.status === 'recognizing text' && typeof m.progress === 'number') onProgress?.((i + m.progress) / files.length)
      },
    })
    parts.push(result.data.text)
    confidences.push(result.data.confidence)
    onProgress?.((i + 1) / files.length)
  }
  return {
    text: parts.map((part, i) => files.length > 1 ? `[Captura ${i + 1}]\n${part}` : part).join('\n\n').trim(),
    confidence: confidences.length ? confidences.reduce((a, b) => a + b, 0) / confidences.length : 0,
  }
}
