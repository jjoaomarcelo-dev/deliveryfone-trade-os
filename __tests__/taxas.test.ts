import { calcParcelado, calcParceladoOperadora } from '../app/lib/financeiro'
import { taxaComercialEquivalente } from '../app/lib/taxas'

// ─── calcParceladoOperadora — gross-up: vista / (1 - taxa/100) ─────────────────

describe('calcParceladoOperadora', () => {
  test('taxa 0% retorna o próprio preço', () => {
    expect(calcParceladoOperadora(5000, 0)).toBe(5000)
  })

  test('exemplo do prompt: R$5.000 com 14% = R$5.813,95', () => {
    expect(calcParceladoOperadora(5000, 14)).toBeCloseTo(5813.95, 2)
  })

  test('parcela 12x do exemplo ≈ R$484,49', () => {
    const total = calcParceladoOperadora(5000, 14)
    // 5813,95 / 12 = 484,496 (o prompt trunca para 484,49 na exibição)
    expect(total / 12).toBeCloseTo(484.49, 1)
  })

  test('total parcelado é sempre maior que o valor à vista quando taxa > 0', () => {
    expect(calcParceladoOperadora(3000, 8.49)).toBeGreaterThan(3000)
  })

  test('preço zero retorna zero', () => {
    expect(calcParceladoOperadora(0, 14)).toBe(0)
  })

  test('taxa >= 100% é tratada com segurança (não divide por zero/negativo)', () => {
    expect(calcParceladoOperadora(1000, 100)).toBe(1000)
  })
})

// ─── taxaComercialEquivalente — adapter para as telas legadas ──────────────────

describe('taxaComercialEquivalente', () => {
  test('taxa 0% → markup equivalente 0%', () => {
    expect(taxaComercialEquivalente(0)).toBeCloseTo(0, 6)
  })

  test('o markup equivalente reproduz o gross-up via calcParcelado', () => {
    // Para qualquer taxa de operadora, calcParcelado(preco, equivalente)
    // deve igualar calcParceladoOperadora(preco, taxa).
    const preco = 5000
    for (const taxa of [2.49, 5.49, 8.49, 11.99, 14]) {
      const tc = taxaComercialEquivalente(taxa)
      expect(calcParcelado(preco, tc)).toBeCloseTo(calcParceladoOperadora(preco, taxa), 4)
    }
  })

  test('taxa >= 100% retorna 0 (proteção)', () => {
    expect(taxaComercialEquivalente(100)).toBe(0)
  })
})
