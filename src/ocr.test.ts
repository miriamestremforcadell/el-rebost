import { describe, expect, it } from 'vitest'
import { parseTicketText } from './ocr'

describe('lectura de tiquets', () => {
  it('llegeix quantitats, preus de línia i el descompte final d’un tiquet Caprabo', () => {
    const text = `
CAPRABO S.A. - 7653
CTRA.NACIONAL 240
C:7653 03-11-2026 18:57
Uni €/UN €TOT € T.Club
TOMAQUET SUCAR PA 2,99
ENCIAM ICEB. EROS 0,95
DUO CANÒNIC RUCUL 1,45
2 PIT GALL DINDI 15 1,79 3,58
IOGURT NATURAL 1,33
2 FORMATGE COTTAGE 1,35 2,70
XAPATA 350/300 GR 0,99 0,15
BARRA RéSTIC400G 1,39 0,20
BARRA ASPAS EROSK 0,65 0,10
TONYINA NATURAL 4,20
TRUITES DE BLAT 1,02
XOCOLATA 85% CACA 1,75
2 #XAMPU H&S 300+30 3,99 7,98 0,18
2 PROTECTOR MAXIPLU 3,59 7,18 1,44
TORTELLONI 4 1,59
TOTALS 39,75 2,07
% Descompte
(2a-50%) -2,00
Total dtes per oferta 2,00
TOTAL A PAGAR 37,75€
`
    const result = parseTicketText(text)
    expect(result.date).toBe('2026-11-03')
    expect(result.total).toBe(37.75)
    expect(result.discount).toBe(2)
    expect(result.lines).toHaveLength(15)
    expect(result.lines.find((line) => line.name.includes('PIT GALL'))).toMatchObject({ qty: 2, unitPrice: 1.79, amount: 3.58 })
    expect(result.lines.find((line) => line.name.includes('XAPATA'))).toMatchObject({ qty: 1, amount: 0.99 })
    expect(result.lines.find((line) => line.name.includes('XAMPU'))).toMatchObject({ qty: 2, unitPrice: 3.99, amount: 7.98 })
    expect(result.lines.reduce((sum, line) => sum + line.amount, 0)).toBeCloseTo(39.75)
  })
})
