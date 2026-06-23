import { parseBRL, fmt, diasNoEstoque, dataHoje } from '../app/lib/utils'

// ─── parseBRL ─────────────────────────────────────────────────────────────────

describe('parseBRL', () => {
  test('converte valor simples', () => {
    expect(parseBRL('100')).toBe(100)
  })

  test('converte valor com centavos', () => {
    expect(parseBRL('100,50')).toBe(100.5)
  })

  test('converte valor acima de R$999 com ponto de milhar', () => {
    expect(parseBRL('1.000,00')).toBe(1000)
  })

  test('converte valor com múltiplos pontos de milhar', () => {
    expect(parseBRL('10.500,99')).toBe(10500.99)
  })

  test('converte "2.500,00"', () => {
    expect(parseBRL('2.500,00')).toBe(2500)
  })

  test('retorna 0 para string vazia', () => {
    expect(parseBRL('')).toBe(0)
  })

  test('retorna 0 para string inválida', () => {
    expect(parseBRL('abc')).toBe(0)
  })

  test('converte string com apenas vírgula', () => {
    expect(parseBRL('0,99')).toBe(0.99)
  })

  test('converte valor inteiro sem formatação', () => {
    expect(parseBRL('5000')).toBe(5000)
  })
})

// ─── fmt ──────────────────────────────────────────────────────────────────────

describe('fmt', () => {
  test('formata valor simples', () => {
    expect(fmt(100)).toBe('100,00')
  })

  test('formata valor com milhar', () => {
    expect(fmt(1000)).toBe('1.000,00')
  })

  test('formata valor com centavos', () => {
    expect(fmt(2500.5)).toBe('2.500,50')
  })

  test('formata zero', () => {
    expect(fmt(0)).toBe('0,00')
  })

  test('formata valor grande', () => {
    expect(fmt(10500.99)).toBe('10.500,99')
  })
})

// ─── parseBRL + fmt (round-trip) ──────────────────────────────────────────────

describe('parseBRL + fmt (round-trip)', () => {
  const casos = [100, 1000, 2500, 10500.99, 0.99]
  casos.forEach(v => {
    test(`${v} → fmt → parseBRL → ${v}`, () => {
      expect(parseBRL(fmt(v))).toBeCloseTo(v, 2)
    })
  })
})

// ─── diasNoEstoque ────────────────────────────────────────────────────────────

describe('diasNoEstoque', () => {
  test('retorna 0 para null', () => {
    expect(diasNoEstoque(null)).toBe(0)
  })

  test('retorna 0 para data de hoje', () => {
    const hoje = new Date().toLocaleDateString('en-CA')
    expect(diasNoEstoque(hoje)).toBe(0)
  })

  test('retorna 1 para ontem', () => {
    const ontem = new Date()
    ontem.setDate(ontem.getDate() - 1)
    const str = ontem.toLocaleDateString('en-CA')
    expect(diasNoEstoque(str)).toBe(1)
  })

  test('retorna 30 para 30 dias atrás', () => {
    const d = new Date()
    d.setDate(d.getDate() - 30)
    const str = d.toLocaleDateString('en-CA')
    expect(diasNoEstoque(str)).toBe(30)
  })
})

// ─── dataHoje ─────────────────────────────────────────────────────────────────

describe('dataHoje', () => {
  test('retorna string no formato YYYY-MM-DD', () => {
    expect(dataHoje()).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })

  test('retorna data de hoje (não UTC)', () => {
    const hoje = new Date().toLocaleDateString('en-CA')
    expect(dataHoje()).toBe(hoje)
  })
})
