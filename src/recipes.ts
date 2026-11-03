export interface RecipeIngredient { name: string; qty: number; unit: string; aliases?: string[] }
export interface Recipe { id: string; name: string; emoji: string; minutes: number; servings: number; description: string; ingredients: RecipeIngredient[]; steps: string[]; tags: string[] }

export const RECIPES: Recipe[] = [
  { id:'truita-patata', name:'Truita de patates i ceba', emoji:'🍳', minutes:35, servings:2, description:'Un clàssic senzill per aprofitar ous i patates.', tags:['vegetarià','econòmic'], ingredients:[
    {name:'ous',qty:4,unit:'ud',aliases:['ou']},{name:'patata',qty:400,unit:'g',aliases:['patates']},{name:'ceba',qty:1,unit:'ud',aliases:['cebes']},{name:'oli',qty:30,unit:'ml',aliases:['oli d’oliva','oli oliva']}
  ], steps:['Pela i talla les patates i la ceba a làmines fines.','Cou-les a foc suau en una paella amb oli fins que siguin tendres.','Bat els ous, barreja-hi les patates escorregudes i qualla la truita pels dos costats.'] },
  { id:'pasta-tonyina', name:'Pasta amb tomàquet i tonyina', emoji:'🍝', minutes:20, servings:2, description:'Ràpida i adaptable als ingredients que tinguis.', tags:['ràpid','econòmic'], ingredients:[
    {name:'pasta',qty:180,unit:'g',aliases:['macarrons','espaguetis','penne']},{name:'tomàquet',qty:200,unit:'g',aliases:['tomàquet triturat','tomàquets']},{name:'tonyina',qty:1,unit:'llauna',aliases:['tonyina en conserva']},{name:'all',qty:1,unit:'gra',aliases:['alls']}
  ], steps:['Bull la pasta en aigua amb sal segons el temps de l’envàs.','Escalfa el tomàquet amb l’all picat durant uns minuts.','Afegeix la tonyina escorreguda i barreja-ho amb la pasta.'] },
  { id:'crema-carbasso', name:'Crema de carbassó', emoji:'🥣', minutes:30, servings:2, description:'Ideal per donar sortida a verdures que cal consumir aviat.', tags:['vegetarià','aprofitament'], ingredients:[
    {name:'carbassó',qty:2,unit:'ud',aliases:['carbassons']},{name:'patata',qty:1,unit:'ud',aliases:['patates']},{name:'ceba',qty:1,unit:'ud',aliases:['cebes']},{name:'brou',qty:500,unit:'ml',aliases:['brou vegetal','brou de verdures']}
  ], steps:['Renta i talla el carbassó, la patata i la ceba.','Posa les verdures en una olla, cobreix-les amb brou i cou-les 20 minuts.','Tritura fins a obtenir una crema fina i ajusta la sal.'] },
  { id:'amanida-cigrons', name:'Amanida de cigrons', emoji:'🥗', minutes:15, servings:2, description:'Un plat complet sense gaire cuina.', tags:['vegetarià','ràpid'], ingredients:[
    {name:'cigrons',qty:400,unit:'g',aliases:['cigrons cuits']},{name:'tomàquet',qty:2,unit:'ud',aliases:['tomàquets']},{name:'ceba',qty:0.5,unit:'ud',aliases:['cebes']},{name:'olives',qty:40,unit:'g',aliases:['oliva','olives negres']}
  ], steps:['Escorre i esbandeix els cigrons si són de pot.','Talla el tomàquet i la ceba a daus petits.','Barreja-ho amb les olives i amaneix al gust.'] },
  { id:'arros-verdures', name:'Arròs amb verdures', emoji:'🍚', minutes:30, servings:2, description:'Una recepta flexible per aprofitar verdures variades.', tags:['vegetarià','aprofitament'], ingredients:[
    {name:'arròs',qty:160,unit:'g',aliases:['arròs rodó','arròs llarg']},{name:'pastanaga',qty:1,unit:'ud',aliases:['pastanagues']},{name:'pebrot',qty:1,unit:'ud',aliases:['pebrots']},{name:'pèsols',qty:80,unit:'g',aliases:['pèsol']}
  ], steps:['Talla les verdures a daus petits.','Salta-les en una cassola amb una mica d’oli.','Afegeix l’arròs i l’aigua o brou segons les instruccions del paquet i cou fins que sigui fet.'] },
  { id:'pollastre-llimona', name:'Pollastre a la llimona', emoji:'🍗', minutes:35, servings:2, description:'Una manera fàcil de preparar el pollastre amb quatre ingredients.', tags:['proteïna'], ingredients:[
    {name:'pollastre',qty:300,unit:'g',aliases:['pit de pollastre','cuixa de pollastre']},{name:'llimona',qty:1,unit:'ud',aliases:['llimones']},{name:'all',qty:1,unit:'gra',aliases:['alls']},{name:'oli',qty:15,unit:'ml',aliases:['oli d’oliva','oli oliva']}
  ], steps:['Salpebra el pollastre i daura’l en una paella.','Afegeix l’all picat i el suc de llimona.','Acaba la cocció a foc mitjà fins que el pollastre sigui completament cuit.'] },
  { id:'truita-carbasso', name:'Truita de carbassó', emoji:'🍳', minutes:20, servings:2, description:'Molt útil quan tens carbassó i ous a punt de caducar.', tags:['vegetarià','ràpid','aprofitament'], ingredients:[
    {name:'ous',qty:3,unit:'ud',aliases:['ou']},{name:'carbassó',qty:1,unit:'ud',aliases:['carbassons']},{name:'ceba',qty:0.5,unit:'ud',aliases:['cebes']}
  ], steps:['Talla el carbassó i la ceba ben fins.','Salta les verdures fins que siguin tendres.','Afegeix els ous batuts i qualla la truita pels dos costats.'] },
  { id:'iogurt-fruita', name:'Bol de iogurt i fruita', emoji:'🍓', minutes:5, servings:1, description:'Esmorzar o postres per aprofitar fruita madura.', tags:['esmorzar','sense cuina'], ingredients:[
    {name:'iogurt',qty:1,unit:'ud',aliases:['iogurts']},{name:'fruita',qty:1,unit:'ud',aliases:['poma','plàtan','pera','maduixes','fruita de temporada']},{name:'civada',qty:30,unit:'g',aliases:['flocs de civada']}
  ], steps:['Posa el iogurt en un bol.','Talla la fruita madura a trossos i afegeix-la.','Acaba amb els flocs de civada.'] },
  { id:'patata-forn', name:'Patates al forn amb herbes', emoji:'🥔', minutes:40, servings:2, description:'Guarnició senzilla per aprofitar patates.', tags:['vegetarià','econòmic'], ingredients:[
    {name:'patata',qty:400,unit:'g',aliases:['patates']},{name:'oli',qty:20,unit:'ml',aliases:['oli d’oliva','oli oliva']},{name:'all',qty:1,unit:'gra',aliases:['alls']}
  ], steps:['Escalfa el forn a 200 °C.','Talla les patates a grills i barreja-les amb oli, all i herbes.','Enforna-les 30–35 minuts, girant-les a mitja cocció.'] }
];

export interface RecipeIngredientMatch { ingredient: RecipeIngredient; available: number; missing: number; productName?: string; expiring: boolean }
export interface RecipeMatch { recipe: Recipe; matches: RecipeIngredientMatch[]; availableCount: number; missingCount: number; expiringCount: number; score: number }

const normalize = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase('ca').trim();
export function matchRecipe(recipe: Recipe, products: { id?: number; name: string; qty: number; unit: string; expiry?: string }[], expiringIds: Set<number> = new Set()): RecipeMatch {
  const matches = recipe.ingredients.map((ingredient) => {
    const names = [ingredient.name, ...(ingredient.aliases ?? [])].map(normalize);
    const product = products.find((p) => p.qty > 0 && names.some((n) => normalize(p.name) === n || normalize(p.name).includes(n) || n.includes(normalize(p.name))));
    const comparable = product && product.unit === ingredient.unit;
    const available = product ? (comparable ? product.qty : ingredient.qty) : 0;
    const missing = product ? (comparable ? Math.max(0, ingredient.qty - product.qty) : 0) : ingredient.qty;
    return { ingredient, available, missing, productName: product?.name, expiring: !!product?.id && expiringIds.has(product.id) };
  });
  const availableCount = matches.filter((m) => m.missing === 0).length;
  const missingCount = matches.filter((m) => m.missing > 0).length;
  const expiringCount = matches.filter((m) => m.expiring).length;
  return { recipe, matches, availableCount, missingCount, expiringCount, score: availableCount * 3 - missingCount + expiringCount * 2 };
}
