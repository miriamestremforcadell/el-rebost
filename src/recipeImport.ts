import type { Recipe, RecipeIngredient } from './recipes'

const clean = (value: string) => value.replace(/^\s*(?:[-•*▪◦]+|\d+[.)-])\s*/, '').replace(/\s+/g, ' ').trim()
const isHeading = (line: string, words: string) => new RegExp('^\\s*(?:' + words + ')\\s*:?\\s*$', 'i').test(line.trim())

const INGREDIENT_HEAD = 'ingredients?|ingredientes?|ingrédients?'
const STEP_HEAD = 'preparaci[oó]n|preparation|instructions?|directions?|method|elaboraci[oó]|passos?|procediment|instruccions?|preparaci[oó]'
const TITLE_SKIP = /^(ingredients?|ingredientes?|preparaci[oó]n|preparation|instructions?|directions?|method|elaboraci[oó]|passos?|instruccions?)\s*:?$/i

function parseIngredient(line: string): RecipeIngredient | null {
  const value = clean(line)
  if (!value || value.length > 140 || TITLE_SKIP.test(value)) return null
  const match = value.match(/^([\d]+(?:[.,]\d+)?|\d+\/\d+|½|¼|¾)\s*(kg|g|mg|ml|cl|l|oz|lb|cups?|tbsps?|tbsp|tsps?|tsp|cullerades?|culleradetes?|tasses?|latas?|latas|latas?\s+de|ud(?:s)?\.?|units?|dientes?|granos?|pizcas?|punts?)?\s*(?:de\s+)?(.+)$/i)
  if (!match) {
    if (/^(?:to taste|al gusto|al gust|a gusto|a gust|salt|sal|pepper|pebre|pimienta|water|aigua|agua)$/i.test(value)) return { name: value, qty: 0, unit: 'a gust' }
    return { name: value, qty: 0, unit: '—' }
  }
  let qty = match[1] === '½' ? 0.5 : match[1] === '¼' ? 0.25 : match[1] === '¾' ? 0.75 : match[1].includes('/') ? Number(match[1].split('/')[0]) / Number(match[1].split('/')[1]) : Number(match[1].replace(',', '.'))
  if (!Number.isFinite(qty)) qty = 0
  const rawUnit = (match[2] || '—').toLowerCase().replace(/\.$/, '')
  const units: Record<string,string> = { kilogram:'kg', kilograms:'kg', kilo:'kg', kilos:'kg', gram:'g', grams:'g', gr:'g', milliliter:'ml', milliliters:'ml', millilitre:'ml', millilitres:'ml', litre:'l', litres:'l', liter:'l', liters:'l', cl:'ml', cup:'tassa', cups:'tassa', tbsp:'cullerada', tablespoon:'cullerada', tablespoons:'cullerada', tsp:'culleradeta', teaspoon:'culleradeta', teaspoons:'culleradeta', cullerada:'cullerada', cullerades:'cullerada', culleradeta:'culleradeta', culleradetes:'culleradeta', cucharada:'cullerada', cucharadas:'cullerada', cucharadita:'culleradeta', cucharaditas:'culleradeta', tassa:'tassa', tasses:'tassa', taza:'tassa', tazas:'tassa', unit:'ud', units:'ud', unidades:'ud', uds:'ud', ud:'ud', dientes:'gra', diente:'gra', grains:'gra', grain:'gra', pinch:'pessic', pizca:'pessic', pizcas:'pessic' }
  return { name: match[3].trim().replace(/^of\s+/i, ''), qty, unit: units[rawUnit] || rawUnit }
}

export function recipeFromOcrText(text: string, confidence = 0): Recipe {
  const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean)
  const ingredientStart = lines.findIndex((line) => isHeading(line, INGREDIENT_HEAD))
  const stepStart = lines.findIndex((line) => isHeading(line, STEP_HEAD))
  const firstUseful = lines.find((line) => !TITLE_SKIP.test(line) && !/^\\[Captura \\d+\\]$/i.test(line.trim()) && clean(line).length > 2)
  const name = (firstUseful ? clean(firstUseful) : '').slice(0, 90) || 'Recepta importada'
  let ingredientLines: string[] = []
  let stepLines: string[] = []
  if (ingredientStart >= 0) {
    const end = stepStart > ingredientStart ? stepStart : lines.length
    ingredientLines = lines.slice(ingredientStart + 1, end)
  }
  if (stepStart >= 0) stepLines = lines.slice(stepStart + 1)
  if (!ingredientLines.length) {
    ingredientLines = lines.filter((line) => /^\s*(?:[-•*▪◦]|\d+[.)-])\s*/.test(line) && /\d|\b(?:sal|pebre|sugar|flour|farina|tomate|tomàquet|egg|ou|leche|llet|oil|oli)\b/i.test(line))
  }
  if (!stepLines.length && stepStart < 0) {
    const bulletLines = lines.filter((line) => /^\s*\d+[.)-]\s+/.test(line))
    if (bulletLines.length && bulletLines.length > ingredientLines.length) stepLines = bulletLines.slice(ingredientLines.length)
  }
  const ingredients = ingredientLines.map(parseIngredient).filter((item): item is RecipeIngredient => !!item).slice(0, 40)
  const steps = stepLines.map(clean).filter((line) => line.length > 5 && !TITLE_SKIP.test(line)).slice(0, 30)
  const timeMatch = text.match(/(?:\b|⏱\s*)(\d{1,3})\s*(?:min(?:utes?)?|mins?)\b/i)
  const servingMatch = text.match(/\b(\d{1,2})\s*(?:racions?|porciones?|servings?|portions?)\b/i)
  return {
    id: 'import-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 7),
    name, emoji: '🍽️', minutes: timeMatch ? Math.max(1, Number(timeMatch[1])) : 30,
    servings: servingMatch ? Math.max(1, Number(servingMatch[1])) : 2,
    description: 'Recepta importada des d’una captura. Revisa i completa les dades abans de cuinar.',
    ingredients, steps, tags: ['importada'],
    sourceText: text, importedAt: new Date().toISOString(), ocrConfidence: confidence,
  }
}
