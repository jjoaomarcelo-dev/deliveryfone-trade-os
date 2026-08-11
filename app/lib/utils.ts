/** Retorna a data de hoje em formato YYYY-MM-DD no fuso local do dispositivo */
export function dataHoje(): string {
  return new Date().toLocaleDateString('en-CA')
}

/** Formata número como moeda BR (sem símbolo) — ex: 2500 → "2.500,00" */
export function fmt(valor: number): string {
  return valor.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

/** Converte string no formato BRL para número — ex: "2.500,00" → 2500 */
export function parseBRL(s: string): number {
  return parseFloat(s.replace(/\./g, '').replace(',', '.')) || 0
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
