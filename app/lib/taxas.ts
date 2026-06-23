import type { SupabaseClient } from '@supabase/supabase-js'
import type { Juros } from './financeiro'
import { TAXA_REAL_FALLBACK } from './financeiro'

export interface Operadora {
  id: string
  nome: string
  ativo: boolean
}

export interface TaxaOperadora {
  operadora_id: string
  parcelas: number
  taxa: number
}

/**
 * Markup efetivo equivalente para que a fórmula multiplicativa existente
 * `preco * (1 + taxa_comercial/100)` produza exatamente o gross-up
 * `preco / (1 - taxa/100)`.
 *
 *   1 + tc/100 = 1 / (1 - t/100)   →   tc = (1/(1 - t/100) - 1) * 100
 *
 * Assim as telas atuais continuam usando o mesmo formato `Juros[]` sem
 * alterar suas fórmulas, e o líquido segue usando `taxa_operadora = t`.
 */
export function taxaComercialEquivalente(taxaOperadora: number): number {
  const t = taxaOperadora / 100
  if (t >= 1) return 0 // proteção; taxa < 100% garantida pelo CHECK do banco
  return (1 / (1 - t) - 1) * 100
}

interface CacheEntry {
  data: Juros[]
  expires: number
}

const CACHE_TTL_MS = 60_000
const cache = new Map<string, CacheEntry>()

/** Invalida o cache de uma filial (chamar após salvar config/taxas). */
export function invalidateTaxas(storeId: string) {
  cache.delete(storeId)
}

/**
 * Carrega as taxas da operadora ATIVA da filial no formato `Juros[]`
 * consumido pelas telas existentes. Cacheado por filial (TTL curto).
 *
 * Fallback quando a filial não tem config: usa TAXA_REAL_FALLBACK
 * (mesmo comportamento histórico, sem quebrar telas).
 */
export async function getTaxasAtivas(
  supabase: SupabaseClient,
  storeId: string,
  opts?: { force?: boolean }
): Promise<Juros[]> {
  if (!opts?.force) {
    const hit = cache.get(storeId)
    if (hit && hit.expires > Date.now()) return hit.data
  }

  const { data: config } = await supabase
    .from('store_payment_config')
    .select('operadora_ativa_id')
    .eq('store_id', storeId)
    .maybeSingle()

  let juros: Juros[] = []
  let temConfig = false

  if (config?.operadora_ativa_id) {
    const { data: taxas } = await supabase
      .from('store_operadora_taxas')
      .select('parcelas, taxa')
      .eq('store_id', storeId)
      .eq('operadora_id', config.operadora_ativa_id)
      .order('parcelas')

    if (taxas && taxas.length > 0) {
      temConfig = true
      // Taxa 0 = parcela não oferecida pela maquininha → excluída do parcelamento
      juros = taxas
        .filter(t => Number(t.taxa) > 0)
        .map(t => ({
          parcelas: t.parcelas,
          taxa_comercial: taxaComercialEquivalente(t.taxa),
          taxa_operadora: t.taxa,
        }))
    }
  }

  // Fallback: nenhuma config cadastrada para a filial (não aplica se a filial
  // já configurou e simplesmente desativou todas as parcelas)
  if (!temConfig) {
    juros = Object.entries(TAXA_REAL_FALLBACK).map(([parcelas, taxa]) => ({
      parcelas: Number(parcelas),
      taxa_comercial: taxaComercialEquivalente(taxa),
      taxa_operadora: taxa,
    }))
  }

  cache.set(storeId, { data: juros, expires: Date.now() + CACHE_TTL_MS })
  return juros
}
