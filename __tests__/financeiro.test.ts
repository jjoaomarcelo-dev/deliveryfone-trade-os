import { calcParcelado, TAXA_REAL_FALLBACK } from '../app/lib/financeiro'

// ─── calcParcelado ────────────────────────────────────────────────────────────

describe('calcParcelado', () => {
  test('sem juros (0%) retorna o próprio preço', () => {
    expect(calcParcelado(1000, 0)).toBe(1000)
  })

  test('10% de taxa_comercial sobre R$1.000 = R$1.100', () => {
    expect(calcParcelado(1000, 10)).toBeCloseTo(1100, 2)
  })

  test('14% (12x típico) sobre R$2.500', () => {
    expect(calcParcelado(2500, 14)).toBeCloseTo(2850, 2)
  })

  test('taxa fracionária', () => {
    expect(calcParcelado(1000, 9.99)).toBeCloseTo(1099.9, 1)
  })

  test('preço zero retorna zero', () => {
    expect(calcParcelado(0, 14)).toBe(0)
  })
})

// ─── TAXA_REAL_FALLBACK ───────────────────────────────────────────────────────

describe('TAXA_REAL_FALLBACK', () => {
  test('1x = 2.49%', () => {
    expect(TAXA_REAL_FALLBACK[1]).toBe(2.49)
  })

  test('12x = 14.00%', () => {
    expect(TAXA_REAL_FALLBACK[12]).toBe(14.00)
  })

  test('18x = 17.00%', () => {
    expect(TAXA_REAL_FALLBACK[18]).toBe(17.00)
  })

  test('todas as entradas são valores positivos', () => {
    Object.values(TAXA_REAL_FALLBACK).forEach(taxa => {
      expect(taxa).toBeGreaterThan(0)
    })
  })

  test('taxas crescem conforme aumentam as parcelas (1 → 12)', () => {
    const parcelas = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]
    for (let i = 1; i < parcelas.length; i++) {
      expect(TAXA_REAL_FALLBACK[parcelas[i]]).toBeGreaterThan(TAXA_REAL_FALLBACK[parcelas[i - 1]])
    }
  })

  // Regressão: garante que o bug C-01 (parseBRL) não afeta os valores hardcoded
  test('valores são números, não strings', () => {
    Object.entries(TAXA_REAL_FALLBACK).forEach(([parcela, taxa]) => {
      expect(typeof taxa).toBe('number')
      expect(typeof parcela).toBe('string') // chaves de objeto são string em JS
    })
  })
})

// ─── Integração: calcParcelado com TAXA_REAL_FALLBACK ────────────────────────

describe('calcParcelado com TAXA_REAL_FALLBACK', () => {
  test('preço 12x: valor cobrado do cliente é maior que preço à vista', () => {
    const preco = 3000
    const taxa12x = TAXA_REAL_FALLBACK[12]
    expect(calcParcelado(preco, taxa12x)).toBeGreaterThan(preco)
  })

  test('cada parcela em 12x está dentro de um range razoável', () => {
    const preco = 3000
    const taxa12x = TAXA_REAL_FALLBACK[12]
    const totalCobrado = calcParcelado(preco, taxa12x)
    const parcelaMensal = totalCobrado / 12
    // Parcela de um iPhone de R$3.000 em 12x deve estar entre R$200 e R$400
    expect(parcelaMensal).toBeGreaterThan(200)
    expect(parcelaMensal).toBeLessThan(400)
  })
})
