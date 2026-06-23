'use client'

import { useEffect, useState, useMemo } from 'react'
import { createClient } from '../../../lib/supabase'
import { useRouter } from 'next/navigation'
import { SpinnerPage } from '../../../components/Spinner'
import { useToast, ToastContainer } from '../../../components/Toast'
import { invalidateAvaliacao, PECAS, modelos, capacidadesDe } from '../../../lib/avaliacao'
import type { CondicaoAvaliacao } from '../../../lib/avaliacao'

// campos percentuais por modelo (valor é por capacidade — ver `valores`)
type CampoPct =
  | 'depreciacao_pct' | 'pct_tela' | 'pct_tampa' | 'pct_bateria'
  | 'pct_camera_traseira' | 'pct_camera_frontal' | 'pct_carcaca'

// valores como string para inputs controlados
interface LinhaModelo {
  valores: Record<string, string> // capacidade → valor (R$)
  depreciacao_pct: string
  pct_tela: string
  pct_tampa: string
  pct_bateria: string
  pct_camera_traseira: string
  pct_camera_frontal: string
  pct_carcaca: string
}

const COLUNAS_PCT = PECAS // ordem das colunas de % = peças

function vazia(): LinhaModelo {
  return {
    valores: {}, depreciacao_pct: '', pct_tela: '', pct_tampa: '', pct_bateria: '',
    pct_camera_traseira: '', pct_camera_frontal: '', pct_carcaca: '',
  }
}

function num(s: string): number {
  return Number((s ?? '').toString().replace(',', '.')) || 0
}

export default function ConfigAvaliacaoPage() {
  const router = useRouter()
  const supabase = useMemo(() => createClient(), [])
  const toast = useToast()

  const [carregando, setCarregando] = useState(true)
  const [salvando, setSalvando] = useState(false)
  const [storeId, setStoreId] = useState('')
  const [userId, setUserId] = useState('')

  const [grid, setGrid] = useState<Record<string, LinhaModelo>>({})
  const [condicoes, setCondicoes] = useState<CondicaoAvaliacao[]>([])
  const [problemas, setProblemas] = useState<string[]>([])

  useEffect(() => {
    async function carregar() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/login'); return }
      setUserId(user.id)

      const { data: profile } = await supabase
        .from('profiles').select('cargo, store_id').eq('id', user.id).single()
      if (!profile || profile.cargo !== 'gestor') { router.push('/dashboard'); return }
      setStoreId(profile.store_id)

      const [modelosRes, valoresRes, configRes] = await Promise.all([
        supabase.from('store_avaliacao_modelos')
          .select('modelo, depreciacao_pct, pct_tela, pct_tampa, pct_bateria, pct_camera_traseira, pct_camera_frontal, pct_carcaca')
          .eq('store_id', profile.store_id),
        supabase.from('store_avaliacao_valores')
          .select('modelo, capacidade, valor_base')
          .eq('store_id', profile.store_id),
        supabase.from('store_avaliacao_config')
          .select('condicoes, problemas_graves')
          .eq('store_id', profile.store_id)
          .maybeSingle(),
      ])

      // valores por modelo+capacidade
      const valoresPorModelo: Record<string, Record<string, string>> = {}
      ;(valoresRes.data ?? []).forEach(r => {
        if (!valoresPorModelo[r.modelo]) valoresPorModelo[r.modelo] = {}
        valoresPorModelo[r.modelo][r.capacidade] = String(r.valor_base ?? '')
      })

      const g: Record<string, LinhaModelo> = {}
      modelos.forEach(m => { g[m] = vazia() })
      ;(modelosRes.data ?? []).forEach(r => {
        g[r.modelo] = {
          valores: valoresPorModelo[r.modelo] ?? {},
          depreciacao_pct: String(r.depreciacao_pct ?? ''),
          pct_tela: String(r.pct_tela ?? ''),
          pct_tampa: String(r.pct_tampa ?? ''),
          pct_bateria: String(r.pct_bateria ?? ''),
          pct_camera_traseira: String(r.pct_camera_traseira ?? ''),
          pct_camera_frontal: String(r.pct_camera_frontal ?? ''),
          pct_carcaca: String(r.pct_carcaca ?? ''),
        }
      })
      // garante o objeto valores em todos os modelos
      modelos.forEach(m => {
        if (!valoresPorModelo[m] && g[m]) g[m].valores = {}
        else if (valoresPorModelo[m]) g[m].valores = valoresPorModelo[m]
      })
      setGrid(g)

      setCondicoes((configRes.data?.condicoes as CondicaoAvaliacao[]) ?? [])
      setProblemas((configRes.data?.problemas_graves as string[]) ?? [])

      setCarregando(false)
    }
    carregar()
  }, [])

  function setCelula(modelo: string, campo: CampoPct, valor: string) {
    setGrid(prev => ({ ...prev, [modelo]: { ...prev[modelo], [campo]: valor } }))
  }

  function setValorCap(modelo: string, capacidade: string, valor: string) {
    setGrid(prev => ({
      ...prev,
      [modelo]: { ...prev[modelo], valores: { ...prev[modelo].valores, [capacidade]: valor } },
    }))
  }

  // ── Condições ──
  function setCondicao(i: number, campo: 'nome' | 'pct', valor: string) {
    setCondicoes(prev => prev.map((c, idx) =>
      idx === i ? { ...c, [campo]: campo === 'pct' ? num(valor) : valor } : c))
  }
  function addCondicao() { setCondicoes(prev => [...prev, { nome: '', pct: 0 }]) }
  function removeCondicao(i: number) { setCondicoes(prev => prev.filter((_, idx) => idx !== i)) }

  // ── Problemas graves ──
  function setProblema(i: number, valor: string) {
    setProblemas(prev => prev.map((p, idx) => idx === i ? valor : p))
  }
  function addProblema() { setProblemas(prev => [...prev, '']) }
  function removeProblema(i: number) { setProblemas(prev => prev.filter((_, idx) => idx !== i)) }

  async function salvar() {
    setSalvando(true)
    try {
      const rows = modelos.map(m => {
        const l = grid[m] ?? vazia()
        return {
          store_id: storeId,
          modelo: m,
          depreciacao_pct: num(l.depreciacao_pct),
          pct_tela: num(l.pct_tela),
          pct_tampa: num(l.pct_tampa),
          pct_bateria: num(l.pct_bateria),
          pct_camera_traseira: num(l.pct_camera_traseira),
          pct_camera_frontal: num(l.pct_camera_frontal),
          pct_carcaca: num(l.pct_carcaca),
          updated_by: userId,
          updated_at: new Date().toISOString(),
        }
      })

      const { error: errModelos } = await supabase
        .from('store_avaliacao_modelos')
        .upsert(rows, { onConflict: 'store_id,modelo' })
      if (errModelos) throw errModelos

      // valores por modelo+capacidade
      const valoresRows = modelos.flatMap(m => {
        const l = grid[m] ?? vazia()
        return capacidadesDe(m).map(cap => ({
          store_id: storeId,
          modelo: m,
          capacidade: cap,
          valor_base: num(l.valores[cap] ?? ''),
          updated_by: userId,
          updated_at: new Date().toISOString(),
        }))
      })

      const { error: errValores } = await supabase
        .from('store_avaliacao_valores')
        .upsert(valoresRows, { onConflict: 'store_id,modelo,capacidade' })
      if (errValores) throw errValores

      const condicoesLimpa = condicoes
        .map(c => ({ nome: c.nome.trim(), pct: c.pct }))
        .filter(c => c.nome !== '')
      const problemasLimpo = problemas.map(p => p.trim()).filter(p => p !== '')

      const { error: errCfg } = await supabase
        .from('store_avaliacao_config')
        .upsert(
          { store_id: storeId, condicoes: condicoesLimpa, problemas_graves: problemasLimpo, updated_by: userId, updated_at: new Date().toISOString() },
          { onConflict: 'store_id' }
        )
      if (errCfg) throw errCfg

      invalidateAvaliacao(storeId)
      toast.sucesso('Tabela de avaliação salva. A filial já está usando os novos valores.')
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Erro ao salvar'
      toast.erro(msg)
    } finally {
      setSalvando(false)
    }
  }

  if (carregando) return <SpinnerPage />

  const inputCls = 'w-full rounded-lg px-2 py-1.5 text-white border outline-none text-sm text-center'
  const inputStyle = { backgroundColor: '#1a1a1a', borderColor: '#2a2a2a' } as const

  return (
    <div className="min-h-screen pb-24" style={{ backgroundColor: '#0a0a0a' }}>
      <ToastContainer toasts={toast.toasts} onRemover={toast.remover} />

      <header className="border-b px-6 py-4 flex items-center gap-4 sticky top-0 z-20"
        style={{ backgroundColor: '#111', borderColor: '#1f1f1f' }}>
        <button onClick={() => router.push('/dashboard/configuracoes')}
          className="text-sm px-3 py-1.5 rounded-lg border transition-all"
          style={{ borderColor: '#2a2a2a', color: '#888' }}
          onMouseEnter={e => { e.currentTarget.style.borderColor = '#c8960c'; e.currentTarget.style.color = '#c8960c' }}
          onMouseLeave={e => { e.currentTarget.style.borderColor = '#2a2a2a'; e.currentTarget.style.color = '#888' }}>
          ← Voltar
        </button>
        <div>
          <h1 className="font-bold text-white">Taxas de Avaliação</h1>
          <p className="text-xs" style={{ color: '#666' }}>Configuração exclusiva desta filial</p>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-6 py-8 flex flex-col gap-6">

        {/* GRID DE MODELOS */}
        <div className="rounded-2xl border p-6" style={{ backgroundColor: '#111', borderColor: '#1f1f1f' }}>
          <h2 className="font-semibold text-white mb-1">Valor de venda, depreciação e desconto por peça</h2>
          <p className="text-xs mb-4 leading-relaxed" style={{ color: '#666' }}>
            <span style={{ color: '#888' }}>Valor de venda</span> = um por capacidade (memória) do modelo.
            <span style={{ color: '#888' }}> Depreciação %</span> = desconto base sempre aplicado.
            As colunas de peça somam % a esse desconto quando a peça precisa de troca.
            <br />Pago ao cliente = valor de venda (da capacidade) × (1 − (depreciação + peças + condição)%).
          </p>

          <div className="rounded-xl border overflow-x-auto" style={{ borderColor: '#2a2a2a' }}>
            <table className="w-full text-sm" style={{ minWidth: 920 }}>
              <thead>
                <tr style={{ backgroundColor: '#1a1a1a' }}>
                  <th className="px-3 py-3 text-left font-medium sticky left-0 z-10" style={{ color: '#888', backgroundColor: '#1a1a1a' }}>Modelo</th>
                  <th className="px-3 py-3 text-left font-medium whitespace-nowrap" style={{ color: '#888' }}>Valor de venda por memória (R$)</th>
                  <th className="px-2 py-3 font-medium whitespace-nowrap" style={{ color: '#888' }}>Depreciação %</th>
                  {COLUNAS_PCT.map(p => (
                    <th key={p.chave} className="px-2 py-3 font-medium whitespace-nowrap" style={{ color: '#888' }}>{p.label} %</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {modelos.map((m, i) => {
                  const l = grid[m] ?? vazia()
                  return (
                    <tr key={m} style={{ backgroundColor: i % 2 === 0 ? '#111' : '#141414' }}>
                      <td className="px-3 py-2 font-medium text-white whitespace-nowrap sticky left-0 z-10 align-top"
                        style={{ backgroundColor: i % 2 === 0 ? '#111' : '#141414' }}>{m}</td>
                      <td className="px-2 py-1.5 align-top" style={{ minWidth: 190 }}>
                        <div className="flex flex-col gap-1">
                          {capacidadesDe(m).map(cap => (
                            <div key={cap} className="flex items-center gap-1.5">
                              <span className="text-xs text-right" style={{ color: '#666', width: 46 }}>{cap}</span>
                              <input type="text" inputMode="decimal" value={l.valores[cap] ?? ''}
                                onChange={e => setValorCap(m, cap, e.target.value)}
                                className={inputCls} style={inputStyle} placeholder="0" />
                            </div>
                          ))}
                        </div>
                      </td>
                      <td className="px-2 py-1.5 align-top" style={{ minWidth: 90 }}>
                        <input type="text" inputMode="decimal" value={l.depreciacao_pct}
                          onChange={e => setCelula(m, 'depreciacao_pct', e.target.value)}
                          className={inputCls} style={inputStyle} placeholder="0" />
                      </td>
                      {COLUNAS_PCT.map(p => (
                        <td key={p.chave} className="px-2 py-1.5 align-top" style={{ minWidth: 78 }}>
                          <input type="text" inputMode="decimal" value={l[p.chave]}
                            onChange={e => setCelula(m, p.chave, e.target.value)}
                            className={inputCls} style={inputStyle} placeholder="0" />
                        </td>
                      ))}
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* CONDIÇÕES */}
        <div className="rounded-2xl border p-6" style={{ backgroundColor: '#111', borderColor: '#1f1f1f' }}>
          <h2 className="font-semibold text-white mb-1">Condição do aparelho</h2>
          <p className="text-xs mb-4" style={{ color: '#666' }}>
            Desconto adicional conforme o estado geral. Ex.: “Com avarias” aplica um % a mais sobre o valor-base.
          </p>
          <div className="flex flex-col gap-2">
            {condicoes.map((c, i) => (
              <div key={i} className="flex items-center gap-2">
                <input value={c.nome} onChange={e => setCondicao(i, 'nome', e.target.value)}
                  className="flex-1 rounded-lg px-3 py-2 text-white border outline-none text-sm"
                  style={inputStyle} placeholder="Nome da condição" />
                <div className="flex items-center gap-1">
                  <input type="text" inputMode="decimal" value={String(c.pct)}
                    onChange={e => setCondicao(i, 'pct', e.target.value)}
                    className="w-20 rounded-lg px-3 py-2 text-white border outline-none text-sm text-center"
                    style={inputStyle} placeholder="0" />
                  <span className="text-sm" style={{ color: '#666' }}>%</span>
                </div>
                <button onClick={() => removeCondicao(i)}
                  className="px-2.5 py-2 rounded-lg border text-sm transition-all"
                  style={{ borderColor: '#2a2a2a', color: '#f87171' }}>✕</button>
              </div>
            ))}
          </div>
          <button onClick={addCondicao}
            className="mt-3 text-sm px-3 py-1.5 rounded-lg border transition-all"
            style={{ borderColor: '#2a2a2a', color: '#c8960c' }}>+ Adicionar condição</button>
        </div>

        {/* PROBLEMAS GRAVES */}
        <div className="rounded-2xl border p-6" style={{ backgroundColor: '#111', borderColor: '#7f1d1d44' }}>
          <h2 className="font-semibold text-white mb-1">Problemas graves → técnico</h2>
          <p className="text-xs mb-4" style={{ color: '#666' }}>
            Quando algum destes é marcado na avaliação, o sistema avisa que é necessária avaliação
            presencial por um técnico para confirmar o valor.
          </p>
          <div className="flex flex-col gap-2">
            {problemas.map((p, i) => (
              <div key={i} className="flex items-center gap-2">
                <input value={p} onChange={e => setProblema(i, e.target.value)}
                  className="flex-1 rounded-lg px-3 py-2 text-white border outline-none text-sm"
                  style={inputStyle} placeholder="Ex.: Celular não liga" />
                <button onClick={() => removeProblema(i)}
                  className="px-2.5 py-2 rounded-lg border text-sm transition-all"
                  style={{ borderColor: '#2a2a2a', color: '#f87171' }}>✕</button>
              </div>
            ))}
          </div>
          <button onClick={addProblema}
            className="mt-3 text-sm px-3 py-1.5 rounded-lg border transition-all"
            style={{ borderColor: '#2a2a2a', color: '#c8960c' }}>+ Adicionar problema</button>
        </div>

        <button onClick={salvar} disabled={salvando}
          className="w-full py-4 rounded-2xl font-bold text-black text-lg transition-all disabled:opacity-50"
          style={{ backgroundColor: '#c8960c' }}
          onMouseEnter={e => e.currentTarget.style.backgroundColor = '#e0a80e'}
          onMouseLeave={e => e.currentTarget.style.backgroundColor = '#c8960c'}>
          {salvando ? 'Salvando...' : '✓ Salvar tabela de avaliação'}
        </button>

      </main>
    </div>
  )
}
