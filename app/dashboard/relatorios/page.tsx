'use client'

import { useEffect, useState, useCallback, useMemo } from 'react'
import { createClient } from '../../lib/supabase'
import { useRouter } from 'next/navigation'
import { fmt, dataHoje } from '../../lib/utils'
import { SpinnerPage } from '../../components/Spinner'

// ─── Tipos ───────────────────────────────────────────────────────────────────

interface Profile {
  id: string
  nome: string
  cargo: string
  store_id: string
  stores: { nome: string } | null
}

interface Venda {
  id: string
  modelo: string
  categoria: string | null
  atributos: { gb?: string; cor?: string; custo_total?: number } | null
  vendido_por: string | null
  vendido_por_id: string | null
  forma_pagamento: string | null
  valor_venda: number | null
  valor_liquido: number | null
  margem_bruta: number | null
  desconto_aplicado: number | null
  parcelas_venda: number | null
  data_venda: string | null
  data_confirmacao: string | null
  confirmado_por: string | null
}

interface VendedorStat {
  nome: string
  qtd: number
  totalBruto: number
  totalLiquido: number
  totalMargem: number
  totalDesconto: number
  ticketMedio: number
}

type Periodo = 'hoje' | 'semana' | 'mes' | 'personalizado'

// ─── Helpers ─────────────────────────────────────────────────────────────────

function dataInicioPeriodo(periodo: Periodo, custom?: string): string {
  const hoje = new Date()
  if (periodo === 'hoje') return dataHoje()
  if (periodo === 'semana') {
    const d = new Date(hoje)
    d.setDate(d.getDate() - 6)
    return d.toLocaleDateString('en-CA')
  }
  if (periodo === 'mes') {
    const d = new Date(hoje)
    d.setDate(1)
    return d.toLocaleDateString('en-CA')
  }
  return custom ?? dataHoje()
}

function labelForma(f: string | null) {
  if (!f) return '—'
  const map: Record<string, string> = {
    a_vista: 'À vista', parcelado: 'Parcelado', misto: 'Misto', boleto: 'Boleto',
  }
  return map[f] ?? f
}

function formatData(d: string | null) {
  if (!d) return '—'
  const [y, m, day] = d.split('-')
  return `${day}/${m}/${y}`
}

// ─── Componente ───────────────────────────────────────────────────────────────

export default function Relatorios() {
  const router = useRouter()
  const supabase = useMemo(() => createClient(), [])

  const [profile, setProfile] = useState<Profile | null>(null)
  const [vendas, setVendas] = useState<Venda[]>([])
  const [carregando, setCarregando] = useState(true)
  const [periodo, setPeriodo] = useState<Periodo>('mes')
  const [customInicio, setCustomInicio] = useState('')
  const [customFim, setCustomFim] = useState(dataHoje())
  const [vendedorFiltro, setVendedorFiltro] = useState<string>('todos')
  const [abaAtiva, setAbaAtiva] = useState<'vendedores' | 'vendas'>('vendedores')

  // Carregar perfil
  useEffect(() => {
    async function init() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/login'); return }
      const { data } = await supabase
        .from('profiles')
        .select('id, nome, cargo, store_id, stores(nome)')
        .eq('id', user.id)
        .single()
      if (data) {
        const storesNorm = Array.isArray(data.stores) ? (data.stores[0] ?? null) : data.stores
        setProfile({ ...data, stores: storesNorm } as Profile)
      }
    }
    init()
  }, [])

  // Carregar vendas confirmadas
  const carregarVendas = useCallback(async () => {
    if (!profile) return
    setCarregando(true)

    const inicio = dataInicioPeriodo(periodo, customInicio || undefined)
    const fim = periodo === 'personalizado' ? customFim : dataHoje()

    let query = supabase
      .from('products')
      .select('id, modelo, categoria, atributos, vendido_por, vendido_por_id, forma_pagamento, valor_venda, valor_liquido, margem_bruta, desconto_aplicado, parcelas_venda, data_venda, data_confirmacao, confirmado_por')
      .eq('store_id', profile.store_id)
      .eq('status', 'confirmado')
      .gte('data_confirmacao', inicio)
      .lte('data_confirmacao', fim)
      .order('data_confirmacao', { ascending: false })

    if (profile.cargo === 'vendedor') {
      query = query.eq('vendido_por_id', profile.id)
    }

    const { data } = await query
    setVendas((data as Venda[]) ?? [])
    setCarregando(false)
  }, [profile, periodo, customInicio, customFim])

  useEffect(() => {
    if (profile) carregarVendas()
  }, [profile, carregarVendas])

  // ── Estatísticas globais ──────────────────────────────────────────────────
  const totalBruto    = vendas.reduce((s, v) => s + (v.valor_venda ?? 0), 0)
  const totalLiquido  = vendas.reduce((s, v) => s + (v.valor_liquido ?? v.valor_venda ?? 0), 0)
  const totalMargem   = vendas.reduce((s, v) => s + (v.margem_bruta ?? 0), 0)
  const totalDesconto = vendas.reduce((s, v) => s + (v.desconto_aplicado ?? 0), 0)
  const ticketMedio   = vendas.length > 0 ? totalBruto / vendas.length : 0

  // ── Ranking por vendedor ──────────────────────────────────────────────────
  const statsMap: Record<string, VendedorStat> = {}
  vendas.forEach(v => {
    const nome = v.vendido_por ?? 'Desconhecido'
    if (!statsMap[nome]) {
      statsMap[nome] = { nome, qtd: 0, totalBruto: 0, totalLiquido: 0, totalMargem: 0, totalDesconto: 0, ticketMedio: 0 }
    }
    statsMap[nome].qtd++
    statsMap[nome].totalBruto    += v.valor_venda ?? 0
    statsMap[nome].totalLiquido  += v.valor_liquido ?? v.valor_venda ?? 0
    statsMap[nome].totalMargem   += v.margem_bruta ?? 0
    statsMap[nome].totalDesconto += v.desconto_aplicado ?? 0
  })
  const ranking = Object.values(statsMap)
    .map(s => ({ ...s, ticketMedio: s.qtd > 0 ? s.totalBruto / s.qtd : 0 }))
    .sort((a, b) => b.totalBruto - a.totalBruto)

  const vendedores = ['todos', ...ranking.map(r => r.nome)]
  const vendasFiltradas = vendedorFiltro === 'todos'
    ? vendas
    : vendas.filter(v => (v.vendido_por ?? 'Desconhecido') === vendedorFiltro)

  const ehGestor = profile?.cargo === 'gestor'

  // ── Exportar CSV ──────────────────────────────────────────────────────────
  function exportarCSV() {
    const linhas = vendasFiltradas
    if (linhas.length === 0) return

    const cabecalho = [
      'Data Confirmação', 'Modelo', 'Categoria', 'Vendido Por',
      'Forma Pagamento', 'Parcelas', 'Valor Bruto (R$)', 'Valor Líquido (R$)',
      'Margem Bruta (R$)', 'Desconto (R$)', 'Confirmado Por',
    ]

    const formatarValor = (v: number | null) =>
      v !== null ? v.toFixed(2).replace('.', ',') : ''

    const rows = linhas.map(v => [
      v.data_confirmacao ?? '',
      v.modelo,
      v.categoria ?? '',
      v.vendido_por ?? '',
      v.forma_pagamento ?? '',
      v.parcelas_venda?.toString() ?? '',
      formatarValor(v.valor_venda),
      formatarValor(v.valor_liquido),
      formatarValor(v.margem_bruta),
      formatarValor(v.desconto_aplicado),
      v.confirmado_por ?? '',
    ].map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(';'))

    const csv = [cabecalho.map(c => `"${c}"`).join(';'), ...rows].join('\n')
    const bom = '﻿' // BOM para Excel reconhecer UTF-8
    const blob = new Blob([bom + csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `relatorio_${dataHoje()}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  // ── Render: loading ───────────────────────────────────────────────────────
  if (!profile) return <SpinnerPage />

  return (
    <div className="min-h-screen" style={{ backgroundColor: '#0a0a0a' }}>

      {/* ── Header ── */}
      <header className="border-b px-6 py-4 flex items-center justify-between"
        style={{ backgroundColor: '#111', borderColor: '#1f1f1f' }}>
        <div className="flex items-center gap-3">
          <button onClick={() => router.push('/dashboard')} className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg flex items-center justify-center font-black text-black text-sm"
              style={{ backgroundColor: '#c8960c' }}>D</div>
            <div>
              <span className="font-bold text-white">Delivery</span>
              <span className="font-bold" style={{ color: '#c8960c' }}>Fone</span>
            </div>
          </button>
          <div className="w-px h-5 mx-1" style={{ backgroundColor: '#2a2a2a' }} />
          <span className="text-sm font-semibold" style={{ color: '#c8960c' }}>Relatórios</span>
        </div>
        <div className="flex items-center gap-3">
          {vendasFiltradas.length > 0 && (
            <button onClick={exportarCSV}
              className="text-sm px-3 py-1.5 rounded-lg border transition-all font-medium"
              style={{ borderColor: '#c8960c', color: '#c8960c', backgroundColor: '#c8960c18' }}
              onMouseEnter={e => { e.currentTarget.style.backgroundColor = '#c8960c33' }}
              onMouseLeave={e => { e.currentTarget.style.backgroundColor = '#c8960c18' }}>
              ↓ CSV
            </button>
          )}
          <button onClick={() => router.push('/dashboard/estoque')}
            className="text-sm px-3 py-1.5 rounded-lg border transition-all"
            style={{ borderColor: '#2a2a2a', color: '#666' }}>
            ← Estoque
          </button>
          <div className="text-right">
            <p className="text-sm font-medium text-white">{profile.nome}</p>
            <p className="text-xs capitalize" style={{ color: '#c8960c' }}>{profile.cargo}</p>
          </div>
        </div>
      </header>

      <main className="px-6 py-6 max-w-5xl mx-auto">

        {/* ── Filtro de período ── */}
        <div className="flex flex-wrap items-center gap-2 mb-6">
          {(['hoje', 'semana', 'mes', 'personalizado'] as Periodo[]).map(p => (
            <button key={p} onClick={() => setPeriodo(p)}
              className="px-4 py-1.5 rounded-full text-sm font-medium border transition-all"
              style={{
                backgroundColor: periodo === p ? '#c8960c' : '#1a1a1a',
                borderColor:     periodo === p ? '#c8960c' : '#2a2a2a',
                color:           periodo === p ? '#000'    : '#888',
              }}>
              {p === 'hoje' ? 'Hoje' : p === 'semana' ? '7 dias' : p === 'mes' ? 'Este mês' : 'Personalizado'}
            </button>
          ))}

          {periodo === 'personalizado' && (
            <div className="flex items-center gap-2 ml-2">
              <input type="date" value={customInicio} onChange={e => setCustomInicio(e.target.value)}
                className="rounded-lg px-3 py-1.5 text-sm text-white border outline-none"
                style={{ backgroundColor: '#1a1a1a', borderColor: '#2a2a2a' }} />
              <span style={{ color: '#444' }}>até</span>
              <input type="date" value={customFim} onChange={e => setCustomFim(e.target.value)}
                className="rounded-lg px-3 py-1.5 text-sm text-white border outline-none"
                style={{ backgroundColor: '#1a1a1a', borderColor: '#2a2a2a' }} />
            </div>
          )}
        </div>

        {/* ── Cards globais ── */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
          {[
            { label: 'Vendas',       valor: vendas.length,   fmt: (v: number) => `${v}`,              cor: '#60a5fa', emoji: '📦' },
            { label: 'Receita bruta', valor: totalBruto,     fmt: (v: number) => `R$ ${fmt(v)}`,      cor: '#4ade80', emoji: '💰' },
            { label: 'Lucro total',  valor: totalMargem,     fmt: (v: number) => `R$ ${fmt(v)}`,      cor: '#a78bfa', emoji: '📈' },
            { label: 'Ticket médio', valor: ticketMedio,     fmt: (v: number) => `R$ ${fmt(v)}`,      cor: '#fb923c', emoji: '🎯' },
          ].map(card => (
            <div key={card.label} className="rounded-2xl border p-4"
              style={{ backgroundColor: '#111', borderColor: '#1f1f1f' }}>
              <div className="flex items-center gap-1.5 mb-3">
                <span className="text-base">{card.emoji}</span>
                <span className="text-xs" style={{ color: '#555' }}>{card.label}</span>
              </div>
              {carregando
                ? <div className="h-6 w-20 rounded animate-pulse" style={{ backgroundColor: '#1f1f1f' }} />
                : <p className="text-xl font-bold" style={{ color: card.cor }}>{card.fmt(card.valor)}</p>
              }
            </div>
          ))}
        </div>

        {/* Linha secundária: líquido e descontos */}
        <div className="grid grid-cols-2 gap-3 mb-8">
          <div className="rounded-xl border px-4 py-3 flex justify-between items-center"
            style={{ backgroundColor: '#111', borderColor: '#1f1f1f' }}>
            <span className="text-xs" style={{ color: '#555' }}>Receita líquida (após taxas)</span>
            {carregando
              ? <div className="h-5 w-24 rounded animate-pulse" style={{ backgroundColor: '#1f1f1f' }} />
              : <span className="text-sm font-bold" style={{ color: '#4ade80' }}>R$ {fmt(totalLiquido)}</span>
            }
          </div>
          <div className="rounded-xl border px-4 py-3 flex justify-between items-center"
            style={{ backgroundColor: '#111', borderColor: '#1f1f1f' }}>
            <span className="text-xs" style={{ color: '#555' }}>Descontos concedidos</span>
            {carregando
              ? <div className="h-5 w-24 rounded animate-pulse" style={{ backgroundColor: '#1f1f1f' }} />
              : <span className="text-sm font-bold" style={{ color: totalDesconto > 0 ? '#f87171' : '#555' }}>
                  {totalDesconto > 0 ? `− R$ ${fmt(totalDesconto)}` : '—'}
                </span>
            }
          </div>
        </div>

        {/* ── Abas ── */}
        <div className="flex gap-1 mb-4 border-b" style={{ borderColor: '#1f1f1f' }}>
          {(ehGestor ? ['vendedores', 'vendas'] : ['vendas']).map(aba => (
            <button key={aba} onClick={() => setAbaAtiva(aba as typeof abaAtiva)}
              className="px-4 py-2.5 text-sm font-medium border-b-2 transition-all -mb-px"
              style={{
                borderColor: abaAtiva === aba ? '#c8960c' : 'transparent',
                color:       abaAtiva === aba ? '#c8960c' : '#555',
              }}>
              {aba === 'vendedores' ? '👤 Por vendedor' : '📋 Vendas detalhadas'}
            </button>
          ))}
        </div>

        {/* ── Aba: ranking por vendedor ── */}
        {abaAtiva === 'vendedores' && ehGestor && (
          <div className="rounded-2xl border overflow-hidden" style={{ borderColor: '#1f1f1f' }}>
            {/* Cabeçalho da tabela */}
            <div className="grid px-4 py-2.5 text-xs font-medium"
              style={{ backgroundColor: '#161616', color: '#555', gridTemplateColumns: '1fr 60px 120px 120px 100px 100px' }}>
              <span>Vendedor</span>
              <span className="text-right">Vendas</span>
              <span className="text-right">Receita bruta</span>
              <span className="text-right">Lucro</span>
              <span className="text-right">Ticket médio</span>
              <span className="text-right">Descontos</span>
            </div>

            {carregando ? (
              Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="px-4 py-4 border-t flex gap-4" style={{ borderColor: '#1a1a1a' }}>
                  <div className="h-4 flex-1 rounded animate-pulse" style={{ backgroundColor: '#1f1f1f' }} />
                  <div className="h-4 w-20 rounded animate-pulse" style={{ backgroundColor: '#1f1f1f' }} />
                </div>
              ))
            ) : ranking.length === 0 ? (
              <div className="px-4 py-12 text-center" style={{ color: '#444' }}>
                Nenhuma venda confirmada neste período
              </div>
            ) : (
              ranking.map((s, idx) => (
                <div key={s.nome}
                  className="grid px-4 py-3.5 border-t items-center transition-all cursor-pointer"
                  style={{ borderColor: '#1a1a1a', gridTemplateColumns: '1fr 60px 120px 120px 100px 100px', backgroundColor: idx === 0 ? '#c8960c08' : 'transparent' }}
                  onClick={() => { setAbaAtiva('vendas'); setVendedorFiltro(s.nome) }}>
                  <div className="flex items-center gap-2">
                    {idx === 0 && <span className="text-sm">🥇</span>}
                    {idx === 1 && <span className="text-sm">🥈</span>}
                    {idx === 2 && <span className="text-sm">🥉</span>}
                    {idx > 2 && <span className="text-sm w-5 text-center" style={{ color: '#444' }}>{idx + 1}</span>}
                    <span className="text-sm font-medium text-white">{s.nome}</span>
                  </div>
                  <span className="text-sm text-right font-bold" style={{ color: '#60a5fa' }}>{s.qtd}</span>
                  <span className="text-sm text-right font-bold" style={{ color: '#4ade80' }}>R$ {fmt(s.totalBruto)}</span>
                  <span className="text-sm text-right font-bold" style={{ color: s.totalMargem > 0 ? '#a78bfa' : '#555' }}>
                    {s.totalMargem > 0 ? `R$ ${fmt(s.totalMargem)}` : '—'}
                  </span>
                  <span className="text-sm text-right" style={{ color: '#fb923c' }}>R$ {fmt(s.ticketMedio)}</span>
                  <span className="text-sm text-right" style={{ color: s.totalDesconto > 0 ? '#f87171' : '#444' }}>
                    {s.totalDesconto > 0 ? `−R$ ${fmt(s.totalDesconto)}` : '—'}
                  </span>
                </div>
              ))
            )}
          </div>
        )}

        {/* ── Aba: vendas detalhadas ── */}
        {abaAtiva === 'vendas' && (
          <>
            {/* Filtro por vendedor (só gestor vê) */}
            {ehGestor && (
              <div className="flex items-center gap-2 mb-4 flex-wrap">
                <span className="text-xs" style={{ color: '#555' }}>Filtrar:</span>
                {vendedores.map(v => (
                  <button key={v} onClick={() => setVendedorFiltro(v)}
                    className="px-3 py-1 rounded-full text-xs font-medium border transition-all"
                    style={{
                      backgroundColor: vendedorFiltro === v ? '#c8960c22' : '#1a1a1a',
                      borderColor:     vendedorFiltro === v ? '#c8960c'   : '#2a2a2a',
                      color:           vendedorFiltro === v ? '#c8960c'   : '#666',
                    }}>
                    {v === 'todos' ? 'Todos' : v}
                  </button>
                ))}
              </div>
            )}

            <div className="rounded-2xl border overflow-hidden" style={{ borderColor: '#1f1f1f' }}>
              {/* Header da tabela */}
              <div className="grid px-4 py-2.5 text-xs font-medium"
                style={{ backgroundColor: '#161616', color: '#555', gridTemplateColumns: '1fr 90px 110px 90px 80px' }}>
                <span>Produto</span>
                <span>Forma</span>
                <span className="text-right">Valor bruto</span>
                <span className="text-right">Lucro</span>
                <span className="text-right">Data</span>
              </div>

              {carregando ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <div key={i} className="px-4 py-4 border-t flex gap-4" style={{ borderColor: '#1a1a1a' }}>
                    <div className="h-4 flex-1 rounded animate-pulse" style={{ backgroundColor: '#1f1f1f' }} />
                    <div className="h-4 w-24 rounded animate-pulse" style={{ backgroundColor: '#1f1f1f' }} />
                  </div>
                ))
              ) : vendasFiltradas.length === 0 ? (
                <div className="px-4 py-12 text-center" style={{ color: '#444' }}>
                  Nenhuma venda confirmada neste período
                </div>
              ) : (
                vendasFiltradas.map(v => {
                  const temDesconto = (v.desconto_aplicado ?? 0) > 0
                  const margemCor = v.margem_bruta !== null
                    ? (v.margem_bruta > 0 ? '#4ade80' : '#f87171')
                    : '#555'
                  return (
                    <div key={v.id} className="grid px-4 py-3 border-t items-center"
                      style={{ borderColor: '#1a1a1a', gridTemplateColumns: '1fr 90px 110px 90px 80px' }}>
                      <div>
                        <p className="text-sm font-medium text-white leading-tight">
                          {v.modelo}
                          {v.atributos?.gb ? ` · ${v.atributos.gb}` : ''}
                          {temDesconto && <span className="ml-1 text-xs px-1.5 py-0.5 rounded-full" style={{ backgroundColor: '#f8717120', color: '#f87171' }}>−{fmt(v.desconto_aplicado!)}↓</span>}
                        </p>
                        {ehGestor && v.vendido_por && (
                          <p className="text-xs mt-0.5" style={{ color: '#555' }}>{v.vendido_por}</p>
                        )}
                      </div>
                      <div>
                        <p className="text-xs" style={{ color: '#888' }}>{labelForma(v.forma_pagamento)}</p>
                        {v.parcelas_venda && <p className="text-xs" style={{ color: '#555' }}>{v.parcelas_venda}x</p>}
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-bold" style={{ color: '#4ade80' }}>
                          R$ {fmt(v.valor_venda ?? 0)}
                        </p>
                        {v.valor_liquido !== null && v.valor_liquido !== v.valor_venda && (
                          <p className="text-xs" style={{ color: '#444' }}>líq. R$ {fmt(v.valor_liquido)}</p>
                        )}
                      </div>
                      <p className="text-sm text-right font-medium" style={{ color: margemCor }}>
                        {v.margem_bruta !== null ? `R$ ${fmt(v.margem_bruta)}` : '—'}
                      </p>
                      <p className="text-xs text-right" style={{ color: '#555' }}>{formatData(v.data_confirmacao)}</p>
                    </div>
                  )
                })
              )}

              {/* Totais do rodapé */}
              {!carregando && vendasFiltradas.length > 0 && (
                <div className="grid px-4 py-3 border-t"
                  style={{ borderColor: '#2a2a2a', backgroundColor: '#161616', gridTemplateColumns: '1fr 90px 110px 90px 80px' }}>
                  <span className="text-xs font-bold" style={{ color: '#888' }}>
                    Total ({vendasFiltradas.length} venda{vendasFiltradas.length !== 1 ? 's' : ''})
                  </span>
                  <span />
                  <span className="text-sm font-bold text-right" style={{ color: '#4ade80' }}>
                    R$ {fmt(vendasFiltradas.reduce((s, v) => s + (v.valor_venda ?? 0), 0))}
                  </span>
                  <span className="text-sm font-bold text-right" style={{ color: '#a78bfa' }}>
                    {vendasFiltradas.some(v => v.margem_bruta !== null)
                      ? `R$ ${fmt(vendasFiltradas.reduce((s, v) => s + (v.margem_bruta ?? 0), 0))}`
                      : '—'}
                  </span>
                  <span />
                </div>
              )}
            </div>
          </>
        )}

      </main>
    </div>
  )
}
