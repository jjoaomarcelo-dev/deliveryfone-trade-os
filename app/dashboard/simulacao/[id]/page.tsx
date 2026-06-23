'use client'

import { useEffect, useState, useMemo, useRef } from 'react'
import { createClient } from '../../../lib/supabase'
import { useRouter, useParams } from 'next/navigation'
import { SpinnerPage } from '../../../components/Spinner'
import { useToast, ToastContainer } from '../../../components/Toast'
import { fmt, parseBRL } from '../../../lib/utils'
import { type Juros, calcParcelado } from '../../../lib/financeiro'
import { getTaxasAtivas } from '../../../lib/taxas'
import {
  pedirAvaliacaoTroca,
  consumirResultadoTroca,
  salvarEstadoSimulacao,
  consumirEstadoSimulacao,
  type TrocaResultado,
} from '../../../lib/simulacaoTroca'

interface Produto {
  id: string
  modelo: string
  valor: number
  valor_avista: number | null
  promocao: number | null
  atributos: { gb?: string; cor?: string } | null
}

type BaseOpcao = 'normal' | 'avista' | 'promocao'

const PARCELAS_RESUMIDAS = [2, 4, 6, 8, 10, 12, 16, 18]

export default function SimulacaoVenda() {
  const router = useRouter()
  const params = useParams()
  const produtoId = String(params.id)
  const supabase = useMemo(() => createClient(), [])
  const toast = useToast()

  const [carregando, setCarregando] = useState(true)
  const [salvando, setSalvando] = useState(false)
  const [storeId, setStoreId] = useState('')
  const [userId, setUserId] = useState('')
  const [userNome, setUserNome] = useState('')
  const [produto, setProduto] = useState<Produto | null>(null)
  const [juros, setJuros] = useState<Juros[]>([])

  const [base, setBase] = useState<BaseOpcao>('normal')
  const [entrada, setEntrada] = useState('')
  const [troca, setTroca] = useState<TrocaResultado | null>(null)
  const [formaPagamento, setFormaPagamento] = useState<'a_vista' | 'parcelado'>('a_vista')
  const [parcelas, setParcelas] = useState(0)
  const [tabelaModo, setTabelaModo] = useState<'resumida' | 'completa'>('resumida')
  const [precoPersonalizado, setPrecoPersonalizado] = useState('')
  const [clienteNome, setClienteNome] = useState('')
  const handshakeLido = useRef(false)

  useEffect(() => {
    // consome o handshake da troca UMA vez (Strict Mode roda o efeito 2x)
    const estado = handshakeLido.current ? null : consumirEstadoSimulacao(produtoId)
    const resTroca = handshakeLido.current ? null : consumirResultadoTroca(produtoId)
    handshakeLido.current = true

    async function carregar() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/login'); return }
      setUserId(user.id)

      const { data: profile } = await supabase
        .from('profiles').select('store_id, nome').eq('id', user.id).single()
      if (!profile) { router.push('/dashboard'); return }
      setStoreId(profile.store_id)
      setUserNome(profile.nome ?? '')

      const [{ data: prod }, taxas, { data: sim }] = await Promise.all([
        supabase.from('products').select('id, modelo, valor, valor_avista, promocao, atributos').eq('id', produtoId).single(),
        getTaxasAtivas(supabase, profile.store_id),
        supabase.from('simulacoes').select('*').eq('produto_id', produtoId).eq('vendedor_id', user.id).maybeSingle(),
      ])
      if (!prod) { router.push('/dashboard/estoque'); return }
      setProduto(prod as Produto)
      if (taxas) setJuros(taxas)

      // pré-preenche com a simulação salva deste vendedor (se houver)
      if (sim) {
        if (sim.base === 'personalizado') {
          setPrecoPersonalizado(sim.preco_base ? String(sim.preco_base) : '')
        } else {
          setBase((sim.base as BaseOpcao) ?? 'normal')
        }
        setEntrada(sim.entrada ? String(sim.entrada) : '')
        setFormaPagamento((sim.forma_pagamento as 'a_vista' | 'parcelado') ?? 'a_vista')
        setParcelas(sim.parcelas ?? 0)
        setClienteNome(sim.cliente_nome ?? '')
        if (sim.troca_valor && Number(sim.troca_valor) > 0) {
          setTroca({ produtoId, modelo: sim.troca_descricao ?? 'Aparelho na troca', capacidade: '', valor: Number(sim.troca_valor) })
        }
      }

      // restaura estado salvo (ao voltar da avaliação) e o resultado da troca — têm prioridade
      if (estado) {
        setBase(estado.base as BaseOpcao)
        setEntrada(estado.entrada)
        setFormaPagamento(estado.formaPagamento)
        setParcelas(estado.parcelas)
      }
      if (resTroca) setTroca(resTroca)

      setCarregando(false)
    }
    carregar()
  }, [produtoId])

  function irAvaliarTroca() {
    salvarEstadoSimulacao(produtoId, { base, entrada, formaPagamento, parcelas })
    pedirAvaliacaoTroca(produtoId)
    router.push('/dashboard/avaliacao')
  }

  async function confirmar() {
    if (!produto) return
    if (!clienteNome.trim()) { toast.erro('Informe o nome do cliente para confirmar.'); return }
    setSalvando(true)
    try {
      const valorTrocaC = troca?.valor ?? 0
      const valorEntradaC = parseBRL(entrada)
      const aPagarC = Math.max(0, precoPartida - valorTrocaC - valorEntradaC)

      const { error } = await supabase.from('simulacoes').upsert({
        store_id: storeId,
        produto_id: produtoId,
        vendedor_id: userId,
        vendedor_nome: userNome,
        cliente_nome: clienteNome.trim(),
        base: precoCustom > 0 ? 'personalizado' : base,
        preco_base: precoPartida,
        entrada: valorEntradaC,
        troca_valor: valorTrocaC,
        troca_descricao: troca ? `${troca.modelo}${troca.capacidade ? ' · ' + troca.capacidade : ''}` : null,
        forma_pagamento: formaPagamento,
        parcelas,
        valor_a_pagar: aPagarC,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'produto_id,vendedor_id' })
      if (error) throw error
      toast.sucesso('Simulação salva — fica guardada no card do produto.')
      setTimeout(() => router.push('/dashboard/estoque'), 800)
    } catch (e) {
      toast.erro(e instanceof Error ? e.message : 'Erro ao salvar simulação')
    } finally {
      setSalvando(false)
    }
  }

  async function cancelar() {
    if (!confirm('Cancelar esta simulação? Ela será removida do card do produto.')) return
    setSalvando(true)
    const { error } = await supabase.from('simulacoes')
      .delete().eq('produto_id', produtoId).eq('vendedor_id', userId)
    setSalvando(false)
    if (error) { toast.erro('Erro ao cancelar: ' + error.message); return }
    router.push('/dashboard/estoque')
  }

  if (carregando || !produto) return <SpinnerPage />

  const temAvista = produto.valor_avista != null && Number(produto.valor_avista) > 0 && Number(produto.valor_avista) !== Number(produto.valor)
  const temPromo = produto.promocao != null && Number(produto.promocao) > 0

  const precoBase =
    base === 'avista' ? Number(produto.valor_avista) :
    base === 'promocao' ? Number(produto.promocao) :
    Number(produto.valor)

  // menor preço disponível (normal / máx à vista / promocional)
  const menorPreco = Math.min(
    Number(produto.valor),
    ...(temAvista ? [Number(produto.valor_avista)] : []),
    ...(temPromo ? [Number(produto.promocao)] : []),
  )

  // preço personalizado: se informado, vira o preço de partida
  const precoCustom = parseBRL(precoPersonalizado)
  const precoPartida = precoCustom > 0 ? precoCustom : precoBase
  // desconto a mais = quanto abaixo do menor preço disponível
  const descontoAMais = precoCustom > 0 && precoCustom < menorPreco ? menorPreco - precoCustom : 0

  const valorTroca = troca?.valor ?? 0
  const valorEntrada = parseBRL(entrada)
  const aPagar = Math.max(0, precoPartida - valorTroca - valorEntrada)

  const opcoesBase: { key: BaseOpcao; label: string; valor: number; mostrar: boolean }[] = [
    { key: 'normal', label: 'Valor normal', valor: Number(produto.valor), mostrar: true },
    { key: 'avista', label: 'À vista', valor: Number(produto.valor_avista ?? 0), mostrar: temAvista },
    { key: 'promocao', label: 'Promocional', valor: Number(produto.promocao ?? 0), mostrar: temPromo },
  ]

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
          <h1 className="font-bold text-white">Simulação de Venda</h1>
          <p className="text-xs" style={{ color: '#666' }}>
            {produto.modelo}{produto.atributos?.gb ? ` · ${produto.atributos.gb}` : ''}{produto.atributos?.cor ? ` · ${produto.atributos.cor}` : ''}
          </p>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-6 py-8 flex flex-col gap-6">

        {/* PREÇO BASE */}
        <div className="rounded-2xl border p-6" style={{ backgroundColor: '#111', borderColor: '#1f1f1f' }}>
          <h2 className="font-semibold text-white mb-3">Preço de partida</h2>
          <div className="flex flex-wrap gap-2" style={{ opacity: precoCustom > 0 ? 0.5 : 1 }}>
            {opcoesBase.filter(o => o.mostrar).map(o => {
              const ativo = base === o.key && precoCustom === 0
              return (
                <button key={o.key} onClick={() => setBase(o.key)}
                  className="px-4 py-2.5 rounded-xl text-sm font-bold border transition-all text-left"
                  style={{
                    backgroundColor: ativo ? '#c8960c' : '#1a1a1a',
                    borderColor: ativo ? '#c8960c' : '#2a2a2a',
                    color: ativo ? '#000' : '#aaa',
                  }}>
                  {o.label}<br />
                  <span className="text-xs font-medium" style={{ color: ativo ? '#00000099' : '#777' }}>R$ {fmt(o.valor)}</span>
                </button>
              )
            })}
          </div>

          {/* Preço personalizado */}
          <div className="mt-4 pt-4 border-t" style={{ borderColor: '#1f1f1f' }}>
            <label className="text-xs font-semibold block mb-2" style={{ color: '#888' }}>
              Preço personalizado (opcional)
            </label>
            <input value={precoPersonalizado} onChange={e => setPrecoPersonalizado(e.target.value)} inputMode="decimal"
              placeholder={`Ex.: ${fmt(menorPreco)}`}
              className="w-full rounded-lg px-4 py-2.5 text-white border outline-none text-sm"
              style={{ backgroundColor: '#1a1a1a', borderColor: descontoAMais > 0 ? '#4ade8055' : '#2a2a2a' }} />
            {precoCustom > 0 && (
              descontoAMais > 0 ? (
                <p className="text-xs mt-2" style={{ color: '#4ade80' }}>
                  ✅ R$ {fmt(descontoAMais)} de desconto a mais (abaixo do menor preço R$ {fmt(menorPreco)})
                </p>
              ) : (
                <p className="text-xs mt-2" style={{ color: '#777' }}>
                  Preço acima ou igual ao menor disponível (R$ {fmt(menorPreco)}) — sem desconto extra.
                </p>
              )
            )}
          </div>
        </div>

        {/* TROCA */}
        <div className="rounded-2xl border p-6" style={{ backgroundColor: '#111', borderColor: '#1f1f1f' }}>
          <h2 className="font-semibold text-white mb-1">Aparelho na troca</h2>
          <p className="text-xs mb-4" style={{ color: '#666' }}>
            Se o cliente vai dar um aparelho como parte do pagamento, avalie-o e o valor entra aqui.
          </p>

          {troca ? (
            <div className="rounded-xl p-4 flex items-center justify-between" style={{ backgroundColor: '#0a1a0a', border: '1px solid #14532d' }}>
              <div>
                <p className="text-sm font-bold text-white">{troca.modelo}{troca.capacidade ? ` · ${troca.capacidade}` : ''}</p>
                <p className="text-xs" style={{ color: '#4ade80' }}>Avaliado em R$ {fmt(troca.valor)}</p>
              </div>
              <div className="flex gap-2">
                <button onClick={irAvaliarTroca}
                  className="text-xs px-3 py-1.5 rounded-lg border transition-all"
                  style={{ borderColor: '#2a2a2a', color: '#888' }}>Reavaliar</button>
                <button onClick={() => setTroca(null)}
                  className="text-xs px-3 py-1.5 rounded-lg border transition-all"
                  style={{ borderColor: '#7f1d1d', color: '#f87171' }}>Remover</button>
              </div>
            </div>
          ) : (
            <button onClick={irAvaliarTroca}
              className="w-full py-3 rounded-xl text-sm font-bold border transition-all"
              style={{ borderColor: '#c8960c44', color: '#c8960c', backgroundColor: '#c8960c11' }}
              onMouseEnter={e => e.currentTarget.style.backgroundColor = '#c8960c22'}
              onMouseLeave={e => e.currentTarget.style.backgroundColor = '#c8960c11'}>
              📲 Avaliar aparelho da troca
            </button>
          )}
        </div>

        {/* ENTRADA */}
        <div className="rounded-2xl border p-6" style={{ backgroundColor: '#111', borderColor: '#1f1f1f' }}>
          <h2 className="font-semibold text-white mb-1">Valor de entrada</h2>
          <p className="text-xs mb-3" style={{ color: '#666' }}>Sinal pago à vista, além da troca (opcional).</p>
          <input value={entrada} onChange={e => setEntrada(e.target.value)} inputMode="decimal"
            placeholder="0,00"
            className="w-full rounded-lg px-4 py-2.5 text-white border outline-none text-sm"
            style={{ backgroundColor: '#1a1a1a', borderColor: '#2a2a2a' }} />
        </div>

        {/* RESUMO */}
        <div className="rounded-2xl border p-6" style={{ backgroundColor: '#111', borderColor: '#c8960c44' }}>
          <h2 className="font-semibold text-white mb-3">Resumo</h2>
          <div className="flex flex-col gap-1.5 text-sm">
            <Linha label="Preço de partida" valor={precoPartida} cor="#aaa" />
            {descontoAMais > 0 && <Linha label="Desconto a mais" valor={-descontoAMais} cor="#4ade80" />}
            {valorTroca > 0 && <Linha label="− Troca" valor={-valorTroca} cor="#4ade80" />}
            {valorEntrada > 0 && <Linha label="− Entrada" valor={-valorEntrada} cor="#4ade80" />}
            <div className="flex items-center justify-between pt-2 mt-1 border-t" style={{ borderColor: '#2a2a2a' }}>
              <span className="font-bold text-white">Valor a pagar</span>
              <span className="text-2xl font-black" style={{ color: '#c8960c' }}>R$ {fmt(aPagar)}</span>
            </div>
          </div>
        </div>

        {/* FORMA DE PAGAMENTO */}
        <div className="rounded-2xl border p-6" style={{ backgroundColor: '#111', borderColor: '#1f1f1f' }}>
          <h2 className="font-semibold text-white mb-3">Forma de pagamento</h2>
          <div className="flex gap-2 mb-4">
            {([['a_vista', 'À vista'], ['parcelado', 'Parcelado']] as const).map(([key, label]) => (
              <button key={key} onClick={() => setFormaPagamento(key)}
                className="flex-1 py-2.5 rounded-xl text-sm font-bold border transition-all"
                style={{
                  backgroundColor: formaPagamento === key ? '#c8960c' : '#1a1a1a',
                  borderColor: formaPagamento === key ? '#c8960c' : '#2a2a2a',
                  color: formaPagamento === key ? '#000' : '#aaa',
                }}>
                {label}
              </button>
            ))}
          </div>

          {formaPagamento === 'a_vista' ? (
            <div className="rounded-xl p-4 text-center" style={{ backgroundColor: '#1a1a1a' }}>
              <p className="text-xs" style={{ color: '#888' }}>Total à vista</p>
              <p className="text-3xl font-black text-white mt-1">R$ {fmt(aPagar)}</p>
            </div>
          ) : juros.length === 0 ? (
            <p className="text-xs" style={{ color: '#666' }}>Nenhuma taxa de parcelamento configurada.</p>
          ) : (
            <>
            {/* Tabela resumida ou completa */}
            <div className="flex gap-2 mb-3">
              {(['resumida', 'completa'] as const).map(modo => (
                <button key={modo} onClick={() => setTabelaModo(modo)}
                  className="flex-1 py-2 rounded-xl text-xs font-bold border transition-all"
                  style={{
                    backgroundColor: tabelaModo === modo ? '#c8960c15' : '#1a1a1a',
                    borderColor: tabelaModo === modo ? '#c8960c' : '#2a2a2a',
                    color: tabelaModo === modo ? '#c8960c' : '#888',
                  }}>
                  {modo === 'resumida' ? 'Resumida' : 'Completa'}
                </button>
              ))}
            </div>
            <div className="rounded-xl overflow-hidden border" style={{ borderColor: '#2a2a2a' }}>
              <table className="w-full text-sm">
                <thead>
                  <tr style={{ backgroundColor: '#1a1a1a' }}>
                    <th className="px-4 py-2.5 text-left font-medium" style={{ color: '#666' }}>Parcelas</th>
                    <th className="px-4 py-2.5 text-left font-medium" style={{ color: '#666' }}>Valor/parcela</th>
                    <th className="px-4 py-2.5 text-left font-medium" style={{ color: '#666' }}>Total</th>
                  </tr>
                </thead>
                <tbody>
                  {(tabelaModo === 'resumida' ? juros.filter(j => PARCELAS_RESUMIDAS.includes(j.parcelas)) : juros).map((j, i) => {
                    const total = calcParcelado(aPagar, j.taxa_comercial)
                    const sel = parcelas === j.parcelas
                    return (
                      <tr key={j.parcelas}
                        onClick={() => setParcelas(j.parcelas)}
                        className="cursor-pointer transition-all"
                        style={{ backgroundColor: sel ? '#c8960c18' : i % 2 === 0 ? '#111' : '#141414' }}>
                        <td className="px-4 py-2.5 font-medium" style={{ color: sel ? '#c8960c' : '#fff' }}>{j.parcelas}x</td>
                        <td className="px-4 py-2.5 font-semibold" style={{ color: '#c8960c' }}>R$ {fmt(total / j.parcelas)}</td>
                        <td className="px-4 py-2.5" style={{ color: '#666' }}>R$ {fmt(total)}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
            </>
          )}
        </div>

        {/* CLIENTE + CONFIRMAR */}
        <div className="rounded-2xl border p-6" style={{ backgroundColor: '#111', borderColor: '#1f1f1f' }}>
          <h2 className="font-semibold text-white mb-1">Confirmar simulação</h2>
          <p className="text-xs mb-3" style={{ color: '#666' }}>
            Informe o cliente e confirme. A simulação fica guardada no card do produto, só para você,
            até a venda fechar ou você cancelar.
          </p>
          <input value={clienteNome} onChange={e => setClienteNome(e.target.value)}
            placeholder="Nome do cliente"
            className="w-full rounded-lg px-4 py-2.5 text-white border outline-none text-sm mb-3"
            style={{ backgroundColor: '#1a1a1a', borderColor: '#2a2a2a' }} />
          <button onClick={confirmar} disabled={salvando}
            className="w-full py-3.5 rounded-xl font-bold text-black transition-all disabled:opacity-50"
            style={{ backgroundColor: '#c8960c' }}>
            {salvando ? 'Salvando...' : '✓ Confirmar simulação'}
          </button>
          <button onClick={cancelar} disabled={salvando}
            className="w-full mt-2 py-3 rounded-xl font-bold border transition-all disabled:opacity-50"
            style={{ borderColor: '#7f1d1d', color: '#f87171', backgroundColor: '#f8717110' }}>
            Cancelar simulação
          </button>
        </div>

      </main>
    </div>
  )
}

function Linha({ label, valor, cor }: { label: string; valor: number; cor: string }) {
  return (
    <div className="flex items-center justify-between">
      <span style={{ color: '#888' }}>{label}</span>
      <span style={{ color: cor }}>R$ {fmt(Math.abs(valor))}</span>
    </div>
  )
}
