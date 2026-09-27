import { calcularValorAposTributos, TAXA_TRIBUTARIA_ESTIMADA_PADRAO } from '../app/lib/tributos'

describe('calcularValorAposTributos', () => {
  test('aplica a taxa tributária estimada sobre o valor', () => {
    expect(calcularValorAposTributos(2500, 8)).toBeCloseTo(2300, 2)
  })

  test('mantém o valor quando a taxa é zero', () => {
    expect(calcularValorAposTributos(2500, 0)).toBe(2500)
  })

  test('protege o cálculo contra percentuais negativos', () => {
    expect(calcularValorAposTributos(2500, -5)).toBe(2500)
  })

  test('limita percentuais acima de 100%', () => {
    expect(calcularValorAposTributos(2500, 120)).toBe(0)
  })
})

describe('TAXA_TRIBUTARIA_ESTIMADA_PADRAO', () => {
  test('usa 8% quando a filial ainda não possui configuração', () => {
    expect(TAXA_TRIBUTARIA_ESTIMADA_PADRAO).toBe(8)
  })
})
