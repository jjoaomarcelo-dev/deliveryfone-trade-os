import {
  calcularAvaliacao,
  valorBaseDe,
  capacidadesDe,
  coresDe,
  modelos,
  PECAS,
  MARCA,
  type ModeloAvaliacao,
} from '../app/lib/avaliacao'
import { MODELOS_IPHONE, GB_IPHONE, CORES_IPHONE } from '../app/lib/iphone-data'

// modelo de exemplo (espelha a planilha do iPhone 13)
const iphone13: ModeloAvaliacao = {
  modelo: 'iPhone 13',
  valor_base: 1700,                       // referência/fallback
  valores: { '128GB': 1700, '256GB': 1870, '512GB': 2040 },
  depreciacao_pct: 0,                      // testes de peças isolam a depreciação em 0
  pct_tela: 13,
  pct_tampa: 10,
  pct_bateria: 13,
  pct_camera_traseira: 13,
  pct_camera_frontal: 10,
  pct_carcaca: 8,
}

// ─── valorBaseDe (valor por capacidade, com fallback) ──────────────────────────

describe('valorBaseDe', () => {
  test('usa o valor da capacidade escolhida', () => {
    expect(valorBaseDe(iphone13, '256GB')).toBe(1870)
    expect(valorBaseDe(iphone13, '512GB')).toBe(2040)
  })
  test('faz fallback para valor_base quando a capacidade não tem valor', () => {
    expect(valorBaseDe(iphone13, '1TB')).toBe(1700)
  })
  test('modelo indefinido = 0', () => {
    expect(valorBaseDe(undefined, '128GB')).toBe(0)
  })
})

// ─── calcularAvaliacao ──────────────────────────────────────────────────────────

describe('calcularAvaliacao', () => {
  test('sem defeitos e condição 0% = valor da capacidade cheio', () => {
    const r = calcularAvaliacao({
      modeloData: iphone13, valorBase: 1700, pecasMarcadas: [], condicaoPct: 0, problemasGravesMarcados: [],
    })
    expect(r.valor).toBe(1700)
    expect(r.descontoPct).toBe(0)
    expect(r.precisaTecnico).toBe(false)
  })

  test('usa o valor da capacidade (256GB = 1870)', () => {
    const r = calcularAvaliacao({
      modeloData: iphone13, valorBase: valorBaseDe(iphone13, '256GB'),
      pecasMarcadas: [], condicaoPct: 0, problemasGravesMarcados: [],
    })
    expect(r.valorBase).toBe(1870)
    expect(r.valor).toBe(1870)
  })

  test('soma o % das peças marcadas', () => {
    const r = calcularAvaliacao({
      modeloData: iphone13, valorBase: 1700, pecasMarcadas: ['pct_tela', 'pct_bateria'], condicaoPct: 0, problemasGravesMarcados: [],
    })
    // 13 + 13 = 26% de 1700 = 442 → 1700 - 442 = 1258
    expect(r.descontoPct).toBe(26)
    expect(r.valor).toBe(1258)
  })

  test('inclui o % da condição', () => {
    const r = calcularAvaliacao({
      modeloData: iphone13, valorBase: 1700, pecasMarcadas: ['pct_carcaca'], condicaoPct: 12, problemasGravesMarcados: [],
    })
    // 8 + 12 = 20% de 1700 = 340 → 1360
    expect(r.descontoPct).toBe(20)
    expect(r.valor).toBe(1360)
  })

  test('desconto é limitado a 100% (valor nunca negativo)', () => {
    const r = calcularAvaliacao({
      modeloData: iphone13, valorBase: 1700,
      pecasMarcadas: ['pct_tela', 'pct_tampa', 'pct_bateria', 'pct_camera_traseira', 'pct_camera_frontal', 'pct_carcaca'],
      condicaoPct: 80,
      problemasGravesMarcados: [],
    })
    expect(r.descontoPct).toBe(100)
    expect(r.valor).toBe(0)
  })

  test('depreciação é sempre aplicada e soma com peças e condição', () => {
    const r = calcularAvaliacao({
      modeloData: { ...iphone13, depreciacao_pct: 33 },
      valorBase: 1700,
      pecasMarcadas: ['pct_tela'], // 13
      condicaoPct: 5,
      problemasGravesMarcados: [],
    })
    // 33 + 13 + 5 = 51% de 1700 = 867 → 1700 - 867 = 833
    expect(r.depreciacaoPct).toBe(33)
    expect(r.pecasPct).toBe(13)
    expect(r.descontoPct).toBe(51)
    expect(r.valor).toBe(833)
  })

  test('problema grave marcado ⇒ precisaTecnico', () => {
    const r = calcularAvaliacao({
      modeloData: iphone13, valorBase: 1700, pecasMarcadas: [], condicaoPct: 0, problemasGravesMarcados: ['Não carrega'],
    })
    expect(r.precisaTecnico).toBe(true)
  })

  test('modelo sem config = valor-base 0', () => {
    const r = calcularAvaliacao({
      modeloData: undefined, valorBase: 0, pecasMarcadas: ['pct_tela'], condicaoPct: 5, problemasGravesMarcados: [],
    })
    expect(r.valorBase).toBe(0)
    expect(r.valor).toBe(0)
  })
})

// ─── reúso do catálogo oficial (iphone-data) ──────────────────────────────────

describe('catálogo vem do iphone-data', () => {
  test('marca fixa Apple', () => {
    expect(MARCA).toBe('Apple')
  })
  test('modelos são exatamente os MODELOS_IPHONE', () => {
    expect(modelos).toBe(MODELOS_IPHONE)
  })
  test('capacidadesDe espelha GB_IPHONE', () => {
    expect(capacidadesDe('iPhone 13')).toEqual(GB_IPHONE['iPhone 13'])
  })
  test('coresDe espelha CORES_IPHONE (em inglês)', () => {
    expect(coresDe('iPhone 15 Pro')).toEqual(CORES_IPHONE['iPhone 15 Pro'])
  })
})

// ─── PECAS ────────────────────────────────────────────────────────────────────

describe('PECAS', () => {
  test('as 6 peças da planilha estão presentes', () => {
    expect(PECAS.map(p => p.chave)).toEqual([
      'pct_tela', 'pct_tampa', 'pct_bateria', 'pct_camera_traseira', 'pct_camera_frontal', 'pct_carcaca',
    ])
  })
})
