/**
 * Handshake entre a Simulação de venda e a Avaliação de compra, via
 * sessionStorage (sobrevive à navegação entre páginas, sem backend).
 *
 * Fluxo:
 *  1. Simulação chama `pedirAvaliacaoTroca(produtoId)` e navega p/ a avaliação.
 *  2. Avaliação lê `consumirRetornoTroca()`; se houver, entra em "modo troca".
 *  3. Ao concluir, a avaliação chama `definirResultadoTroca(...)` e volta p/ a simulação.
 *  4. Simulação lê `consumirResultadoTroca(produtoId)` e usa o valor.
 */

export interface TrocaResultado {
  produtoId: string
  modelo: string
  capacidade: string
  valor: number
}

const K_RETORNO = 'troca_retorno_produto'
const K_RESULTADO = 'troca_resultado'
const K_ESTADO = 'simulacao_estado:' // + produtoId

function hasWindow() {
  return typeof window !== 'undefined'
}

// ── pedido (simulação → avaliação) ──
export function pedirAvaliacaoTroca(produtoId: string) {
  if (hasWindow()) sessionStorage.setItem(K_RETORNO, produtoId)
}

export function consumirRetornoTroca(): string | null {
  if (!hasWindow()) return null
  const v = sessionStorage.getItem(K_RETORNO)
  if (v) sessionStorage.removeItem(K_RETORNO)
  return v
}

// ── resultado (avaliação → simulação) ──
export function definirResultadoTroca(r: TrocaResultado) {
  if (hasWindow()) sessionStorage.setItem(K_RESULTADO, JSON.stringify(r))
}

export function consumirResultadoTroca(produtoId: string): TrocaResultado | null {
  if (!hasWindow()) return null
  const raw = sessionStorage.getItem(K_RESULTADO)
  if (!raw) return null
  try {
    const r = JSON.parse(raw) as TrocaResultado
    if (r.produtoId !== produtoId) return null
    sessionStorage.removeItem(K_RESULTADO)
    return r
  } catch {
    sessionStorage.removeItem(K_RESULTADO)
    return null
  }
}

// ── estado da simulação (preservar seleção ao ir/voltar) ──
export interface SimulacaoEstado {
  base: string
  entrada: string
  formaPagamento: 'a_vista' | 'parcelado'
  parcelas: number
}

export function salvarEstadoSimulacao(produtoId: string, estado: SimulacaoEstado) {
  if (hasWindow()) sessionStorage.setItem(K_ESTADO + produtoId, JSON.stringify(estado))
}

export function consumirEstadoSimulacao(produtoId: string): SimulacaoEstado | null {
  if (!hasWindow()) return null
  const raw = sessionStorage.getItem(K_ESTADO + produtoId)
  if (!raw) return null
  sessionStorage.removeItem(K_ESTADO + produtoId)
  try {
    return JSON.parse(raw) as SimulacaoEstado
  } catch {
    return null
  }
}
