/** Retorna a data de hoje em formato YYYY-MM-DD no fuso local do dispositivo */
export function dataHoje(): string {
  return new Date().toLocaleDateString('en-CA')
}

/** Formata número como moeda BR (sem símbolo) — ex: 2500 → "2.500,00" */
export function fmt(valor: number): string {
  return valor.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

/** Converte valores monetários em formato brasileiro ou decimal para número. */
export function parseBRL(s: string): number {
  const valor = s.replace(/R\$\s?/g, '').replace(/\s/g, '').trim()
  if (!valor || !/[0-9]/.test(valor)) return 0

  const ultimaVirgula = valor.lastIndexOf(',')
  const ultimoPonto = valor.lastIndexOf('.')
  let normalizado = valor

  if (ultimaVirgula >= 0 && ultimoPonto >= 0) {
    // Quando existem os dois separadores, o último representa os centavos.
    normalizado = ultimaVirgula > ultimoPonto
      ? valor.replace(/\./g, '').replace(',', '.')
      : valor.replace(/,/g, '')
  } else if (ultimaVirgula >= 0) {
    normalizado = valor.replace(/\./g, '').replace(',', '.')
  } else if (ultimoPonto >= 0) {
    const quantidadePontos = (valor.match(/\./g) ?? []).length
    const casasDepoisDoPonto = valor.length - ultimoPonto - 1

    // Um único ponto com uma ou duas casas é decimal; nos demais casos,
    // mantém a interpretação brasileira de separador de milhar.
    normalizado = quantidadePontos === 1 && casasDepoisDoPonto <= 2
      ? valor
      : valor.replace(/\./g, '')
  }

  return Number.parseFloat(normalizado) || 0
}

/** Converte o desconto máximo informado no preço mínimo à vista armazenado. */
export function precoMinimoAvista(valorVenda: number, descontoMaximo: number): number {
  return Math.max(0, valorVenda - Math.max(0, descontoMaximo))
}

/** Recupera o desconto máximo a partir do preço mínimo à vista já armazenado. */
export function descontoMaximoAvista(valorVenda: number, precoMinimo: number | null): number {
  if (precoMinimo === null) return 0
  return Math.max(0, valorVenda - precoMinimo)
}

/** Retorna quantos dias um produto está no estoque desde data_entrada */
export function diasNoEstoque(data: string | null): number {
  if (!data) return 0
  const entrada = new Date(data + 'T00:00:00')
  const hoje = new Date()
  return Math.floor((hoje.getTime() - entrada.getTime()) / (1000 * 60 * 60 * 24))
}
