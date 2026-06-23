'use client'

import { useEffect, useState, useMemo, useRef } from 'react'
import { createClient } from '../../lib/supabase'
import { useRouter } from 'next/navigation'
import { SpinnerPage } from '../../components/Spinner'
import { useToast, ToastContainer } from '../../components/Toast'
import { fmt } from '../../lib/utils'
import SeletorPilulas from '../../components/SeletorPilulas'
import {
  MARCA,
  modelos,
  capacidadesDe,
  coresDe,
  PECAS,
  getConfigAvaliacao,
  calcularAvaliacao,
  valorBaseDe,
  type ConfigAvaliacao,
  type PercentuaisPeca,
} from '../../lib/avaliacao'
import { consumirRetornoTroca, definirResultadoTroca } from '../../lib/simulacaoTroca'

const ETAPAS = ['Aparelho', 'Estado', 'Avaliação']

export default function AvaliacaoCompra() {
  const router = useRouter()
  const supabase = useMemo(() => createClient(), [])
  const toast = useToast()

  const [carregando, setCarregando] = useState(true)
  const [salvando, setSalvando] = useState(false)
  const [storeId, setStoreId] = useState('')
  const [userId, setUserId] = useState('')
  const [userNome, setUserNome] = useState('')
  const [config, setConfig] = useState<ConfigAvaliacao | null>(null)

  const [etapa, setEtapa] = useState(0)

  // Etapa 0 — aparelho
  const [modelo, setModelo] = useState('')
  const [capacidade, setCapacidade] = useState('')
  const [cor, setCor] = useState('')

  // Etapa 1 — estado
  const [pecasMarcadas, setPecasMarcadas] = useState<Array<keyof PercentuaisPeca>>([])
  const [condicaoNome, setCondicaoNome] = useState('')
  const [problemasMarcados, setProblemasMarcados] = useState<string[]>([])

  // Etapa 2 — registro
  const [clienteNome, setClienteNome] = useState('')
  const [observacoes, setObservacoes] = useState('')

  // Modo troca: veio da simulação de venda (volta o valor pra lá)
  const [trocaProdutoId, setTrocaProdutoId] = useState<string | null>(null)
  const handshakeLido = useRef(false)

  useEffect(() => {
    // consome o handshake da troca UMA vez (Strict Mode roda o efeito 2x)
    if (!handshakeLido.current) {
      handshakeLido.current = true
      setTrocaProdutoId(consumirRetornoTroca())
    }
    async function carregar() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/login'); return }
      setUserId(user.id)

      const { data: profile } = await supabase
        .from('profiles').select('nome, store_id').eq('id', user.id).single()
      if (!profile) { router.push('/dashboard'); return }
      setStoreId(profile.store_id)
      setUserNome(profile.nome)

      const cfg = await getConfigAvaliacao(supabase, profile.store_id)
      setConfig(cfg)
      // condição padrão = a primeira (geralmente "Impecável")
      if (cfg.condicoes[0]) setCondicaoNome(cfg.condicoes[0].nome)

      setCarregando(false)
    }
    carregar()
  }, [])

  const capacidades = modelo ? capacidadesDe(modelo) : []
  const coresDisponiveis = modelo ? coresDe(modelo) : []
  const specCompleta = !!(modelo && capacidade && cor)

  const modeloData = config && modelo ? config.modelos[modelo] : undefined
  const condicaoPct = config?.condicoes.find(c => c.nome === condicaoNome)?.pct ?? 0
  const valorBase = valorBaseDe(modeloData, capacidade)

  const resultado = useMemo(
    () => calcularAvaliacao({ modeloData, valorBase, pecasMarcadas, condicaoPct, problemasGravesMarcados: problemasMarcados }),
    [modeloData, valorBase, pecasMarcadas, condicaoPct, problemasMarcados]
  )

  function selModelo(m: string) {
    setModelo(m); setCapacidade(''); setCor('')
  }
  function togglePeca(chave: keyof PercentuaisPeca) {
    setPecasMarcadas(prev => prev.includes(chave) ? prev.filter(p => p !== chave) : [...prev, chave])
  }
  function toggleProblema(nome: string) {
    setProblemasMarcados(prev => prev.includes(nome) ? prev.filter(p => p !== nome) : [...prev, nome])
  }

  function reiniciar() {
    setModelo(''); setCapacidade(''); setCor('')
    setPecasMarcadas([]); setProblemasMarcados([])
    setCondicaoNome(config?.condicoes[0]?.nome ?? '')
    setClienteNome(''); setObservacoes('')
    setEtapa(0)
  }

  /** Insere a avaliação no histórico. Retorna true em sucesso. */
  async function registrar(): Promise<boolean> {
    const detalhe = {
      condicao: condicaoNome,
      pecas: pecasMarcadas.map(ch => PECAS.find(p => p.chave === ch)?.label ?? ch),
      problemas_graves: problemasMarcados,
      desconto_pct: resultado.descontoPct,
    }
    const { error } = await supabase.from('avaliacoes').insert({
      store_id: storeId,
      avaliador_id: userId,
      avaliador_nome: userNome,
      cliente_nome: clienteNome.trim() || null,
      marca: MARCA,
      modelo,
      capacidade,
      cor,
      condicoes: detalhe,
      valor_base: resultado.valorBase,
      valor_avaliado: resultado.valor,
      precisa_tecnico: resultado.precisaTecnico,
      observacoes: observacoes.trim() || null,
    })
    if (error) {
      toast.erro(error.message || 'Erro ao salvar avaliação')
      return false
    }
    return true
  }

  async function salvar() {
    setSalvando(true)
    try {
      if (await registrar()) {
        toast.sucesso('Avaliação prévia registrada. Veja em 🕘 Histórico.')
        reiniciar()
      }
    } finally {
      setSalvando(false)
    }
  }

  async function usarNaSimulacao() {
    if (!trocaProdutoId) return
    setSalvando(true)
    try {
      if (await registrar()) {
        definirResultadoTroca({
          produtoId: trocaProdutoId,
          modelo: `${MARCA} ${modelo}`,
          capacidade,
          valor: resultado.valor,
        })
        router.push(`/dashboard/simulacao/${trocaProdutoId}`)
      }
    } finally {
      setSalvando(false)
    }
  }

  if (carregando) return <SpinnerPage />

  const semConfig = !modeloData || valorBase === 0
  const problemas = config?.problemasGraves ?? []
  const condicoes = config?.condicoes ?? []

  return (
    <div className="min-h-screen pb-24" style={{ backgroundColor: '#0a0a0a' }}>
      <ToastContainer toasts={toast.toasts} onRemover={toast.remover} />

      <header className="border-b px-6 py-4 flex items-center gap-4 sticky top-0 z-10"
        style={{ backgroundColor: '#111', borderColor: '#1f1f1f' }}>
        <button onClick={() => router.push('/dashboard/estoque')}
          className="text-sm px-3 py-1.5 rounded-lg border transition-all"
          style={{ borderColor: '#2a2a2a', color: '#888' }}
          onMouseEnter={e => { e.currentTarget.style.borderColor = '#c8960c'; e.currentTarget.style.color = '#c8960c' }}
          onMouseLeave={e => { e.currentTarget.style.borderColor = '#2a2a2a'; e.currentTarget.style.color = '#888' }}>
          ← Voltar
        </button>
        <div>
          <h1 className="font-bold text-white">Avaliação de Compra de Celular</h1>
          <p className="text-xs" style={{ color: '#666' }}>Estimativa prévia — confirmação presencial pelo técnico</p>
        </div>
        <button onClick={() => router.push('/dashboard/avaliacao/historico')}
          className="ml-auto text-sm px-3 py-1.5 rounded-lg border transition-all flex items-center gap-1.5"
          style={{ borderColor: '#2a2a2a', color: '#888' }}
          onMouseEnter={e => { e.currentTarget.style.borderColor = '#c8960c'; e.currentTarget.style.color = '#c8960c' }}
          onMouseLeave={e => { e.currentTarget.style.borderColor = '#2a2a2a'; e.currentTarget.style.color = '#888' }}>
          🕘 Histórico
        </button>
      </header>

      <main className="max-w-3xl mx-auto px-6 py-8 flex flex-col gap-6">

        {/* Aviso fixo de avaliação prévia */}
        <div className="rounded-xl border px-4 py-3 flex items-start gap-3"
          style={{ backgroundColor: '#1a140a', borderColor: '#78350f' }}>
          <span className="text-lg leading-none mt-0.5">⚠️</span>
          <p className="text-xs leading-relaxed" style={{ color: '#fcd34d' }}>
            Esta é uma <b>avaliação prévia</b>. O valor final depende de <b>conferência presencial por um técnico</b>,
            principalmente em casos de problemas mais graves.
          </p>
        </div>

        {/* Banner: avaliação para troca dentro de uma simulação */}
        {trocaProdutoId && (
          <div className="rounded-xl border px-4 py-3 flex items-start gap-3"
            style={{ backgroundColor: '#0a1a0a', borderColor: '#14532d' }}>
            <span className="text-lg leading-none mt-0.5">🔄</span>
            <p className="text-xs leading-relaxed" style={{ color: '#86efac' }}>
              Avaliação do aparelho da <b>troca</b>. Ao finalizar, o valor volta para a <b>simulação de venda</b>.
            </p>
          </div>
        )}

        {/* Indicador de etapas */}
        <div className="flex items-center gap-2">
          {ETAPAS.map((nome, i) => {
            const ativa = i === etapa
            const concluida = i < etapa
            return (
              <div key={nome} className="flex items-center gap-2 flex-1">
                <div className="flex items-center gap-2">
                  <div className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold border"
                    style={{
                      backgroundColor: ativa || concluida ? '#c8960c' : '#1a1a1a',
                      borderColor: ativa || concluida ? '#c8960c' : '#2a2a2a',
                      color: ativa || concluida ? '#000' : '#666',
                    }}>
                    {concluida ? '✓' : i + 1}
                  </div>
                  <span className="text-xs font-medium hidden sm:block" style={{ color: ativa ? '#fff' : '#666' }}>{nome}</span>
                </div>
                {i < ETAPAS.length - 1 && (
                  <div className="flex-1 h-px" style={{ backgroundColor: concluida ? '#c8960c' : '#2a2a2a' }} />
                )}
              </div>
            )
          })}
        </div>

        {/* ETAPA 0 — APARELHO */}
        {etapa === 0 && (
          <div className="rounded-2xl border p-6 flex flex-col gap-6" style={{ backgroundColor: '#111', borderColor: '#1f1f1f' }}>
            <div className="flex items-center justify-between">
              <h2 className="font-semibold text-white">Especificações do aparelho</h2>
              <span className="text-xs px-3 py-1 rounded-full font-semibold"
                style={{ backgroundColor: '#1a1a1a', color: '#c8960c' }}>{MARCA}</span>
            </div>

            <div>
              <label className="text-xs font-semibold block mb-2" style={{ color: '#888' }}>Modelo</label>
              <SeletorPilulas opcoes={modelos} valor={modelo} layout="grid" onSelecionar={selModelo} />
            </div>

            <div>
              <label className="text-xs font-semibold block mb-2" style={{ color: '#888' }}>Capacidade</label>
              {modelo ? (
                <SeletorPilulas opcoes={capacidades} valor={capacidade} onSelecionar={setCapacidade} />
              ) : (
                <p className="text-xs" style={{ color: '#555' }}>Selecione o modelo primeiro</p>
              )}
            </div>

            <div>
              <label className="text-xs font-semibold block mb-2" style={{ color: '#888' }}>Cor</label>
              {capacidade ? (
                <SeletorPilulas opcoes={coresDisponiveis} valor={cor} onSelecionar={setCor} />
              ) : (
                <p className="text-xs" style={{ color: '#555' }}>Selecione a capacidade primeiro</p>
              )}
            </div>

            <button onClick={() => setEtapa(1)} disabled={!specCompleta}
              className="w-full py-3.5 rounded-xl font-bold text-black transition-all disabled:opacity-40"
              style={{ backgroundColor: '#c8960c' }}>
              Continuar →
            </button>
          </div>
        )}

        {/* ETAPA 1 — ESTADO */}
        {etapa === 1 && (
          <div className="flex flex-col gap-6">
            {semConfig && (
              <div className="rounded-xl border px-4 py-3 text-xs" style={{ backgroundColor: '#1a0a0a', borderColor: '#7f1d1d', color: '#fca5a5' }}>
                Este modelo ainda não tem valores configurados. Peça ao gestor para preencher em
                <b> Configurações → Taxas de Avaliação</b>.
              </div>
            )}

            {/* Condição geral */}
            <div className="rounded-2xl border p-6" style={{ backgroundColor: '#111', borderColor: '#1f1f1f' }}>
              <div className="flex items-center justify-between mb-3">
                <h2 className="font-semibold text-white">Condição geral</h2>
                <span className="text-xs px-3 py-1 rounded-full font-semibold" style={{ backgroundColor: '#1a1a1a', color: '#c8960c' }}>
                  {MARCA} {modelo}
                </span>
              </div>
              {condicoes.length > 0 ? (
                <SeletorPilulas opcoes={condicoes.map(c => c.nome)} valor={condicaoNome} onSelecionar={setCondicaoNome} />
              ) : (
                <p className="text-xs" style={{ color: '#555' }}>Nenhuma condição configurada.</p>
              )}
            </div>

            {/* Peças a trocar */}
            <div className="rounded-2xl border p-6" style={{ backgroundColor: '#111', borderColor: '#1f1f1f' }}>
              <h2 className="font-semibold text-white mb-1">Peças que precisam de troca</h2>
              <p className="text-xs mb-4" style={{ color: '#666' }}>Marque o que está com defeito. O desconto é o configurado para este modelo.</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {PECAS.map(p => {
                  const marcada = pecasMarcadas.includes(p.chave)
                  const pct = modeloData?.[p.chave] ?? 0
                  return (
                    <button key={p.chave} onClick={() => togglePeca(p.chave)}
                      className="flex items-center gap-3 p-3 rounded-xl border text-left transition-all"
                      style={{ backgroundColor: marcada ? '#1a1505' : '#1a1a1a', borderColor: marcada ? '#c8960c' : '#2a2a2a' }}>
                      <div className="w-4 h-4 rounded border flex items-center justify-center flex-shrink-0"
                        style={{ borderColor: marcada ? '#c8960c' : '#444', backgroundColor: marcada ? '#c8960c' : 'transparent' }}>
                        {marcada && <span className="text-[10px] font-black text-black leading-none">✓</span>}
                      </div>
                      <span className="text-sm flex-1" style={{ color: marcada ? '#fff' : '#ccc' }}>{p.label}</span>
                      <span className="text-xs font-semibold" style={{ color: marcada ? '#c8960c' : '#666' }}>−{pct}%</span>
                    </button>
                  )
                })}
              </div>
            </div>

            {/* Problemas graves → técnico */}
            {problemas.length > 0 && (
              <div className="rounded-2xl border p-6" style={{ backgroundColor: '#111', borderColor: '#7f1d1d44' }}>
                <h2 className="font-semibold text-white mb-1">Problemas graves</h2>
                <p className="text-xs mb-4" style={{ color: '#666' }}>
                  Estes problemas exigem avaliação presencial por um técnico para confirmar o valor.
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {problemas.map(nome => {
                    const marcado = problemasMarcados.includes(nome)
                    return (
                      <button key={nome} onClick={() => toggleProblema(nome)}
                        className="flex items-center gap-3 p-3 rounded-xl border text-left transition-all"
                        style={{ backgroundColor: marcado ? '#1a0a0a' : '#1a1a1a', borderColor: marcado ? '#f87171' : '#2a2a2a' }}>
                        <div className="w-4 h-4 rounded border flex items-center justify-center flex-shrink-0"
                          style={{ borderColor: marcado ? '#f87171' : '#444', backgroundColor: marcado ? '#f87171' : 'transparent' }}>
                          {marcado && <span className="text-[10px] font-black text-black leading-none">✓</span>}
                        </div>
                        <span className="text-sm flex-1" style={{ color: marcado ? '#fff' : '#ccc' }}>{nome}</span>
                      </button>
                    )
                  })}
                </div>
              </div>
            )}

            <div className="flex gap-3">
              <button onClick={() => setEtapa(0)}
                className="px-5 py-3.5 rounded-xl font-medium border transition-all" style={{ borderColor: '#2a2a2a', color: '#888' }}>
                ← Voltar
              </button>
              <button onClick={() => setEtapa(2)}
                className="flex-1 py-3.5 rounded-xl font-bold text-black transition-all" style={{ backgroundColor: '#c8960c' }}>
                Ver avaliação →
              </button>
            </div>
          </div>
        )}

        {/* ETAPA 2 — RESULTADO */}
        {etapa === 2 && (
          <div className="flex flex-col gap-6">
            {/* Resumo */}
            <div className="rounded-2xl border p-6" style={{ backgroundColor: '#111', borderColor: '#1f1f1f' }}>
              <p className="text-sm font-bold text-white">{MARCA} {modelo}</p>
              <p className="text-xs mb-3" style={{ color: '#666' }}>{capacidade} • {cor} • {condicaoNome}</p>
              <div className="flex flex-wrap gap-2">
                {pecasMarcadas.map(ch => (
                  <span key={ch} className="text-[10px] border rounded-full px-2 py-0.5" style={{ borderColor: '#c8960c44', color: '#c8960c' }}>
                    Troca: {PECAS.find(p => p.chave === ch)?.label}
                  </span>
                ))}
                {problemasMarcados.map(nome => (
                  <span key={nome} className="text-[10px] border rounded-full px-2 py-0.5" style={{ borderColor: '#7f1d1d', color: '#fca5a5' }}>
                    {nome}
                  </span>
                ))}
              </div>
            </div>

            {/* Valor */}
            <div className="rounded-2xl border p-8 text-center" style={{ backgroundColor: '#111', borderColor: '#c8960c44' }}>
              <p className="text-sm mb-2" style={{ color: '#888' }}>Valor de compra estimado</p>
              <p className="text-5xl font-black" style={{ color: '#c8960c' }}>R$ {fmt(resultado.valor)}</p>
              <p className="text-xs mt-3" style={{ color: '#555' }}>
                Venda R$ {fmt(resultado.valorBase)} · depreciação {resultado.depreciacaoPct}%
                {resultado.pecasPct > 0 && ` + peças ${resultado.pecasPct}%`}
                {resultado.condicaoPct > 0 && ` + condição ${resultado.condicaoPct}%`}
                {' '}= −{resultado.descontoPct}%
              </p>
            </div>

            {/* Alerta técnico (problemas graves) */}
            {resultado.precisaTecnico && (
              <div className="rounded-xl border px-4 py-4 flex items-start gap-3" style={{ backgroundColor: '#1a0a0a', borderColor: '#7f1d1d' }}>
                <span className="text-xl leading-none mt-0.5">🛠️</span>
                <div>
                  <p className="text-sm font-bold" style={{ color: '#fca5a5' }}>Avaliação presencial obrigatória</p>
                  <p className="text-xs mt-1 leading-relaxed" style={{ color: '#fca5a5' }}>
                    Foram marcados problemas graves ({problemasMarcados.join(', ')}). Este valor é apenas uma
                    referência inicial e <b>precisa ser confirmado por um técnico presencialmente</b>.
                  </p>
                </div>
              </div>
            )}

            {/* Dados opcionais */}
            <div className="rounded-2xl border p-6 flex flex-col gap-4" style={{ backgroundColor: '#111', borderColor: '#1f1f1f' }}>
              <div>
                <label className="text-xs font-semibold block mb-2" style={{ color: '#888' }}>Nome do cliente (opcional)</label>
                <input value={clienteNome} onChange={e => setClienteNome(e.target.value)}
                  placeholder="Ex.: João Silva"
                  className="w-full rounded-lg px-4 py-2.5 text-white border outline-none text-sm"
                  style={{ backgroundColor: '#1a1a1a', borderColor: '#2a2a2a' }} />
              </div>
              <div>
                <label className="text-xs font-semibold block mb-2" style={{ color: '#888' }}>Observações (opcional)</label>
                <textarea value={observacoes} onChange={e => setObservacoes(e.target.value)}
                  rows={3} placeholder="Detalhes adicionais sobre o aparelho ou a negociação"
                  className="w-full rounded-lg px-4 py-2.5 text-white border outline-none text-sm resize-none"
                  style={{ backgroundColor: '#1a1a1a', borderColor: '#2a2a2a' }} />
              </div>
            </div>

            <div className="flex gap-3">
              <button onClick={() => setEtapa(1)}
                className="px-5 py-3.5 rounded-xl font-medium border transition-all" style={{ borderColor: '#2a2a2a', color: '#888' }}>
                ← Voltar
              </button>
              {trocaProdutoId ? (
                <button onClick={usarNaSimulacao} disabled={salvando}
                  className="flex-1 py-3.5 rounded-xl font-bold text-black transition-all disabled:opacity-50" style={{ backgroundColor: '#4ade80' }}>
                  {salvando ? 'Salvando...' : '🔄 Usar na simulação'}
                </button>
              ) : (
                <button onClick={salvar} disabled={salvando}
                  className="flex-1 py-3.5 rounded-xl font-bold text-black transition-all disabled:opacity-50" style={{ backgroundColor: '#c8960c' }}>
                  {salvando ? 'Salvando...' : '✓ Registrar avaliação prévia'}
                </button>
              )}
            </div>

            <button onClick={reiniciar}
              className="text-sm py-2 transition-all" style={{ color: '#666' }}
              onMouseEnter={e => e.currentTarget.style.color = '#c8960c'}
              onMouseLeave={e => e.currentTarget.style.color = '#666'}>
              Nova avaliação
            </button>
          </div>
        )}

      </main>
    </div>
  )
}
