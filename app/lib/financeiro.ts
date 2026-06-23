export interface Juros {
  parcelas: number
  taxa_comercial: number
  taxa_operadora: number | null
}

/**
 * Taxa estimada da maquininha por número de parcelas.
 * Usada como fallback quando taxa_operadora não está cadastrada no banco.
 */
export const TAXA_REAL_FALLBACK: Record<number, number> = {
  1: 2.49, 2: 3.99, 3: 5.49, 4: 6.99, 5: 8.49,
  6: 9.99, 7: 10.49, 8: 10.99, 9: 11.49, 10: 11.99,
  11: 12.49, 12: 14.00, 18: 17.00, 21: 19.00,
}

/** Valor total cobrado do cliente com juros (taxa_comercial = markup ao cliente) */
export function calcParcelado(preco: number, taxa_comercial: number): number {
  return preco * (1 + taxa_comercial / 100)
}

/**
 * Valor parcelado por gross-up da taxa da operadora repassada ao cliente:
 *   valorParcelado = valorVista / (1 - taxa/100)
 * Ex.: 5000 / (1 - 0,14) = 5813,95
 */
export function calcParceladoOperadora(preco: number, taxa: number): number {
  const t = taxa / 100
  if (t >= 1) return preco
  return preco / (1 - t)
}
