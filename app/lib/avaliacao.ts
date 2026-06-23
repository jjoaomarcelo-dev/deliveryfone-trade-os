/**
 * ============================================================
 *  AVALIAÇÃO DE COMPRA DE APARELHOS USADOS (iPhone)
 *
 *  Configuração POR FILIAL (editável pelo gestor em
 *  Configurações → Taxas de Avaliação), armazenada no Supabase:
 *    - store_avaliacao_modelos: valor-base + % de desconto por peça
 *    - store_avaliacao_config:  condições + problemas graves
 *
 *  Cálculo:
 *    valorFinal = valor_base × (1 − (Σ % das peças marcadas
 *                                    + % da condição) / 100)
 *  Qualquer "problema grave" marcado ⇒ exige avaliação
 *  presencial por técnico (precisaTecnico = true).
 *
 *  Modelos/capacidades/cores vêm do catálogo oficial iphone-data.ts.
 * ============================================================
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import { MODELOS_IPHONE, GB_IPHONE, CORES_IPHONE } from './iphone-data'

/** Marca fixa — o app trabalha apenas com iPhone (ver ProdutoForm) */
export const MARCA = 'Apple'

/** Lista de modelos, do catálogo oficial */
export const modelos = MODELOS_IPHONE

/** Capacidades de um modelo (do catálogo oficial) */
export function capacidadesDe(modelo: string): string[] {
  return GB_IPHONE[modelo] ?? []
}

/** Cores de um modelo, em inglês (do catálogo oficial) */
export function coresDe(modelo: string): string[] {
  return CORES_IPHONE[modelo] ?? []
}

// ── Peças/defeitos com desconto percentual ──
// Chaves fixas casam com as colunas de store_avaliacao_modelos.
export interface Peca {
  chave: keyof PercentuaisPeca
  label: string
}

export interface PercentuaisPeca {
  pct_tela: number
  pct_tampa: number
  pct_bateria: number
  pct_camera_traseira: number
  pct_camera_frontal: number
  pct_carcaca: number
}

export const PECAS: Peca[] = [
  { chave: 'pct_tela', label: 'Tela' },
  { chave: 'pct_tampa', label: 'Tampa' },
  { chave: 'pct_bateria', label: 'Bateria' },
  { chave: 'pct_camera_traseira', label: 'Câmera traseira' },
  { chave: 'pct_camera_frontal', label: 'Câmera frontal' },
  { chave: 'pct_carcaca', label: 'Carcaça' },
]

// ── Tipos da configuração por filial ──
export interface ModeloAvaliacao extends PercentuaisPeca {
  modelo: string
  /** valor de venda de referência do modelo (fallback) */
  valor_base: number
  /** valor de venda por capacidade (memória) — capacidade → valor */
  valores: Record<string, number>
  /** depreciação base sobre o valor (sempre aplicada) */
  depreciacao_pct: number
}

/** Valor de venda para um modelo na capacidade escolhida (com fallback). */
export function valorBaseDe(modeloData: ModeloAvaliacao | undefined, capacidade: string): number {
  if (!modeloData) return 0
  const v = modeloData.valores?.[capacidade]
  return (v ?? 0) > 0 ? v : (modeloData.valor_base ?? 0)
}

export interface CondicaoAvaliacao {
  nome: string
  pct: number
}

export interface ConfigAvaliacao {
  /** mapa modelo → valores configurados */
  modelos: Record<string, ModeloAvaliacao>
  condicoes: CondicaoAvaliacao[]
  problemasGraves: string[]
}

// ── Cálculo (puro, testável) ──
export interface ResultadoAvaliacao {
  valorBase: number
  /** depreciação base do modelo (%) */
  depreciacaoPct: number
  /** soma dos % das peças marcadas (%) */
  pecasPct: number
  /** % da condição geral */
  condicaoPct: number
  /** soma total deduzida (depreciação + peças + condição), limitada a 100 */
  descontoPct: number
  valor: number
  precisaTecnico: boolean
}

/**
 * Calcula o valor de compra a partir do modelo configurado, das peças
 * marcadas para troca, da condição escolhida e dos problemas graves.
 *
 *   valorFinal = valor_base × (1 − (depreciação + Σ peças + condição) / 100)
 */
export function calcularAvaliacao(params: {
  modeloData: ModeloAvaliacao | undefined
  /** valor de venda resolvido pela capacidade escolhida (ver valorBaseDe) */
  valorBase: number
  pecasMarcadas: Array<keyof PercentuaisPeca>
  condicaoPct: number
  problemasGravesMarcados: string[]
}): ResultadoAvaliacao {
  const { modeloData, valorBase, pecasMarcadas, condicaoPct, problemasGravesMarcados } = params
  const depreciacaoPct = modeloData?.depreciacao_pct ?? 0

  const pecasPct = pecasMarcadas.reduce((soma, chave) => soma + (modeloData?.[chave] ?? 0), 0)
  const condicao = condicaoPct || 0
  const descontoPct = Math.min(100, depreciacaoPct + pecasPct + condicao)

  const valor = Math.max(0, Math.round(valorBase * (1 - descontoPct / 100)))

  return {
    valorBase,
    depreciacaoPct,
    pecasPct,
    condicaoPct: condicao,
    descontoPct,
    valor,
    precisaTecnico: problemasGravesMarcados.length > 0,
  }
}

// ── Acesso ao Supabase (config por filial) com cache curto ──
interface CacheEntry {
  data: ConfigAvaliacao
  expires: number
}

const CACHE_TTL_MS = 60_000
const cache = new Map<string, CacheEntry>()

/** Invalida o cache de uma filial (chamar após salvar config). */
export function invalidateAvaliacao(storeId: string) {
  cache.delete(storeId)
}

const CONDICOES_FALLBACK: CondicaoAvaliacao[] = [
  { nome: 'Impecável', pct: 0 },
  { nome: 'Bom', pct: 5 },
  { nome: 'Regular', pct: 12 },
  { nome: 'Com avarias', pct: 20 },
]

/**
 * Carrega a configuração de avaliação da filial. Cacheada por filial (TTL curto).
 * Se a filial não tiver config (migration não rodada / loja nova), retorna
 * estrutura vazia de modelos e condições padrão.
 */
export async function getConfigAvaliacao(
  supabase: SupabaseClient,
  storeId: string,
  opts?: { force?: boolean }
): Promise<ConfigAvaliacao> {
  if (!opts?.force) {
    const hit = cache.get(storeId)
    if (hit && hit.expires > Date.now()) return hit.data
  }

  const [modelosRes, valoresRes, configRes] = await Promise.all([
    supabase
      .from('store_avaliacao_modelos')
      .select('modelo, valor_base, depreciacao_pct, pct_tela, pct_tampa, pct_bateria, pct_camera_traseira, pct_camera_frontal, pct_carcaca')
      .eq('store_id', storeId),
    supabase
      .from('store_avaliacao_valores')
      .select('modelo, capacidade, valor_base')
      .eq('store_id', storeId),
    supabase
      .from('store_avaliacao_config')
      .select('condicoes, problemas_graves')
      .eq('store_id', storeId)
      .maybeSingle(),
  ])

  // valores por modelo+capacidade
  const valoresPorModelo: Record<string, Record<string, number>> = {}
  ;(valoresRes.data ?? []).forEach(r => {
    if (!valoresPorModelo[r.modelo]) valoresPorModelo[r.modelo] = {}
    valoresPorModelo[r.modelo][r.capacidade] = Number(r.valor_base) || 0
  })

  const modelosMap: Record<string, ModeloAvaliacao> = {}
  ;(modelosRes.data ?? []).forEach(r => {
    modelosMap[r.modelo] = {
      modelo: r.modelo,
      valor_base: Number(r.valor_base) || 0,
      valores: valoresPorModelo[r.modelo] ?? {},
      depreciacao_pct: Number(r.depreciacao_pct) || 0,
      pct_tela: Number(r.pct_tela) || 0,
      pct_tampa: Number(r.pct_tampa) || 0,
      pct_bateria: Number(r.pct_bateria) || 0,
      pct_camera_traseira: Number(r.pct_camera_traseira) || 0,
      pct_camera_frontal: Number(r.pct_camera_frontal) || 0,
      pct_carcaca: Number(r.pct_carcaca) || 0,
    }
  })

  const data: ConfigAvaliacao = {
    modelos: modelosMap,
    condicoes: (configRes.data?.condicoes as CondicaoAvaliacao[] | undefined)?.length
      ? (configRes.data!.condicoes as CondicaoAvaliacao[])
      : CONDICOES_FALLBACK,
    problemasGraves: (configRes.data?.problemas_graves as string[] | undefined) ?? [],
  }

  cache.set(storeId, { data, expires: Date.now() + CACHE_TTL_MS })
  return data
}
