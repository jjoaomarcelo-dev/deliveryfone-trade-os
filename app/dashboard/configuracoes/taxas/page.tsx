'use client'

import { useEffect, useState, useMemo } from 'react'
import { createClient } from '../../../lib/supabase'
import { useRouter } from 'next/navigation'
import { SpinnerPage } from '../../../components/Spinner'
import { useToast, ToastContainer } from '../../../components/Toast'
import { invalidateTaxas } from '../../../lib/taxas'
import type { Operadora } from '../../../lib/taxas'
import { calcParceladoOperadora } from '../../../lib/financeiro'

const PARCELAS = Array.from({ length: 21 }, (_, i) => i + 1)
const PREVIEW_BASE = 5000

interface AuditRow {
  id: string
  operadora_nome: string | null
  parcelas: number | null
  valor_anterior: number | null
  valor_novo: number | null
  usuario_nome: string | null
  created_at: string
}

function fmt(n: number) {
  return n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

export default function TaxasParcelamento() {
  const router = useRouter()
  const supabase = useMemo(() => createClient(), [])
  const toast = useToast()

  const [carregando, setCarregando] = useState(true)
  const [salvando, setSalvando] = useState(false)
  const [storeId, setStoreId] = useState('')
  const [userId, setUserId] = useState('')

  const [operadoras, setOperadoras] = useState<Operadora[]>([])
  const [operadoraAtiva, setOperadoraAtiva] = useState('')   // operadora ativa salva da filial
  const [operadoraSel, setOperadoraSel] = useState('')        // operadora sendo editada na tela

  // taxas[operadora_id][parcelas] = string (input controlado)
  const [taxas, setTaxas] = useState<Record<string, Record<number, string>>>({})
  const [audit, setAudit] = useState<AuditRow[]>([])
  const [mostrarAudit, setMostrarAudit] = useState(false)

  useEffect(() => {
    async function carregar() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/login'); return }
      setUserId(user.id)

      const { data: profile } = await supabase
        .from('profiles')
        .select('cargo, store_id')
        .eq('id', user.id)
        .single()

      if (!profile || profile.cargo !== 'gestor') { router.push('/dashboard'); return }
      setStoreId(profile.store_id)

      const [opsRes, taxasRes, configRes, auditRes] = await Promise.all([
        supabase.from('operadoras').select('id, nome, ativo').eq('ativo', true).order('nome'),
        supabase.from('store_operadora_taxas')
          .select('operadora_id, parcelas, taxa')
          .eq('store_id', profile.store_id),
        supabase.from('store_payment_config')
          .select('operadora_ativa_id')
          .eq('store_id', profile.store_id)
          .maybeSingle(),
        supabase.from('taxa_audit')
          .select('id, operadora_nome, parcelas, valor_anterior, valor_novo, usuario_nome, created_at')
          .eq('store_id', profile.store_id)
          .order('created_at', { ascending: false })
          .limit(50),
      ])

      const ops = (opsRes.data ?? []) as Operadora[]
      setOperadoras(ops)

      // Monta grid de taxas
      const grid: Record<string, Record<number, string>> = {}
      ops.forEach(op => {
        grid[op.id] = {}
        PARCELAS.forEach(p => { grid[op.id][p] = '' })
      })
      ;(taxasRes.data ?? []).forEach(t => {
        if (!grid[t.operadora_id]) grid[t.operadora_id] = {}
        grid[t.operadora_id][t.parcelas] = String(t.taxa)
      })
      setTaxas(grid)

      const ativa = configRes.data?.operadora_ativa_id ?? (ops[0]?.id ?? '')
      setOperadoraAtiva(ativa)
      setOperadoraSel(ativa)

      if (auditRes.data) setAudit(auditRes.data as AuditRow[])

      setCarregando(false)
    }
    carregar()
  }, [])

  function setTaxa(opId: string, parcela: number, valor: string) {
    setTaxas(prev => ({
      ...prev,
      [opId]: { ...prev[opId], [parcela]: valor },
    }))
  }

  /**
   * Valida o grid da operadora selecionada. Retorna mensagem de erro ou null.
   * Campo vazio é permitido = parcela não oferecida (salva como 0).
   */
  function validar(opId: string): string | null {
    for (const p of PARCELAS) {
      const raw = taxas[opId]?.[p] ?? ''
      if (raw.trim() === '') continue // não oferecida
      const v = Number(raw.replace(',', '.'))
      if (Number.isNaN(v)) return `Taxa inválida em ${p}x`
      if (v < 0) return `Taxa de ${p}x não pode ser negativa`
      if (v >= 100) return `Taxa de ${p}x deve ser menor que 100%`
    }
    return null
  }

  async function salvar() {
    const erro = validar(operadoraSel)
    if (erro) { toast.erro(erro); return }

    setSalvando(true)
    try {
      const rows = PARCELAS.map(p => {
        const raw = (taxas[operadoraSel]?.[p] ?? '').trim()
        // vazio = parcela não oferecida = 0
        const taxa = raw === '' ? 0 : Number(raw.replace(',', '.'))
        return {
          store_id: storeId,
          operadora_id: operadoraSel,
          parcelas: p,
          taxa,
          updated_by: userId,
          updated_at: new Date().toISOString(),
        }
      })

      const { error: errTaxas } = await supabase
        .from('store_operadora_taxas')
        .upsert(rows, { onConflict: 'store_id,operadora_id,parcelas' })

      if (errTaxas) throw errTaxas

      // Operadora ativa (se mudou)
      if (operadoraSel !== operadoraAtiva) {
        const { error: errCfg } = await supabase
          .from('store_payment_config')
          .upsert(
            { store_id: storeId, operadora_ativa_id: operadoraSel, updated_by: userId, updated_at: new Date().toISOString() },
            { onConflict: 'store_id' }
          )
        if (errCfg) throw errCfg
        setOperadoraAtiva(operadoraSel)
      }

      invalidateTaxas(storeId)
      toast.sucesso('Taxas salvas. A filial já está usando a nova tabela.')

      // Recarrega histórico
      const { data: auditData } = await supabase.from('taxa_audit')
        .select('id, operadora_nome, parcelas, valor_anterior, valor_novo, usuario_nome, created_at')
        .eq('store_id', storeId)
        .order('created_at', { ascending: false })
        .limit(50)
      if (auditData) setAudit(auditData as AuditRow[])
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Erro ao salvar'
      toast.erro(msg)
    } finally {
      setSalvando(false)
    }
  }

  if (carregando) return <SpinnerPage />

  const nomeSel = operadoras.find(o => o.id === operadoraSel)?.nome ?? ''
  const editandoAtiva = operadoraSel === operadoraAtiva

  return (
    <div className="min-h-screen pb-24" style={{ backgroundColor: '#0a0a0a' }}>
      <ToastContainer toasts={toast.toasts} onRemover={toast.remover} />

      <header className="border-b px-6 py-4 flex items-center gap-4 sticky top-0 z-10"
        style={{ backgroundColor: '#111', borderColor: '#1f1f1f' }}>
        <button onClick={() => router.push('/dashboard/configuracoes')}
          className="text-sm px-3 py-1.5 rounded-lg border transition-all"
          style={{ borderColor: '#2a2a2a', color: '#888' }}
          onMouseEnter={e => { e.currentTarget.style.borderColor = '#c8960c'; e.currentTarget.style.color = '#c8960c' }}
          onMouseLeave={e => { e.currentTarget.style.borderColor = '#2a2a2a'; e.currentTarget.style.color = '#888' }}>
          ← Voltar
        </button>
        <div>
          <h1 className="font-bold text-white">Taxas de Parcelamento</h1>
          <p className="text-xs" style={{ color: '#666' }}>Configuração exclusiva desta filial</p>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-6 py-8 flex flex-col gap-6">

        {/* OPERADORA ATIVA */}
        <div className="rounded-2xl border p-6" style={{ backgroundColor: '#111', borderColor: '#1f1f1f' }}>
          <h2 className="font-semibold text-white mb-1">Operadora da maquininha</h2>
          <p className="text-xs mb-4" style={{ color: '#666' }}>
            Selecione a operadora para visualizar/editar. Ao salvar, ela passa a ser usada por toda a filial.
          </p>
          <div className="flex flex-wrap gap-2">
            {operadoras.map(op => {
              const sel = operadoraSel === op.id
              const ativa = operadoraAtiva === op.id
              return (
                <button key={op.id} onClick={() => setOperadoraSel(op.id)}
                  className="py-2.5 px-5 rounded-xl text-sm font-bold border transition-all flex items-center gap-2"
                  style={{
                    backgroundColor: sel ? '#c8960c' : '#1a1a1a',
                    borderColor: sel ? '#c8960c' : '#2a2a2a',
                    color: sel ? '#000' : '#888',
                  }}>
                  {op.nome}
                  {ativa && (
                    <span className="text-[10px] font-bold px-1.5 py-0.5 rounded"
                      style={{ backgroundColor: sel ? '#00000022' : '#4ade8022', color: sel ? '#000' : '#4ade80' }}>
                      ATIVA
                    </span>
                  )}
                </button>
              )
            })}
          </div>
          {!editandoAtiva && (
            <p className="text-xs mt-3" style={{ color: '#fcd34d' }}>
              ⚠️ {nomeSel} não é a operadora ativa. Ao salvar, ela passará a ser usada por toda a filial.
            </p>
          )}
        </div>

        {/* GRID DE TAXAS */}
        <div className="rounded-2xl border p-6" style={{ backgroundColor: '#111', borderColor: '#1f1f1f' }}>
          <h2 className="font-semibold text-white mb-1">Taxas de {nomeSel}</h2>
          <p className="text-xs mb-4" style={{ color: '#666' }}>
            Taxa por parcela (até 21x). Deixe <span style={{ color: '#888' }}>vazio ou 0</span> nas parcelas que a maquininha não oferece —
            elas não aparecem no parcelamento. Preview com base de R$ {fmt(PREVIEW_BASE)} (valorVista ÷ (1 − taxa)).
          </p>

          <div className="rounded-xl overflow-hidden border" style={{ borderColor: '#2a2a2a' }}>
            <table className="w-full text-sm">
              <thead>
                <tr style={{ backgroundColor: '#1a1a1a' }}>
                  <th className="px-4 py-3 text-left font-medium" style={{ color: '#666' }}>Parcelas</th>
                  <th className="px-4 py-3 text-left font-medium" style={{ color: '#666' }}>Taxa (%)</th>
                  <th className="px-4 py-3 text-left font-medium" style={{ color: '#666' }}>Total cliente</th>
                  <th className="px-4 py-3 text-left font-medium" style={{ color: '#666' }}>Por parcela</th>
                </tr>
              </thead>
              <tbody>
                {PARCELAS.map((p, i) => {
                  const raw = taxas[operadoraSel]?.[p] ?? ''
                  const vazio = raw.trim() === ''
                  const v = Number(raw.replace(',', '.'))
                  const formatoOk = vazio || (!Number.isNaN(v) && v >= 0 && v < 100)
                  // oferece a parcela apenas quando há taxa > 0
                  const oferece = !vazio && !Number.isNaN(v) && v > 0 && v < 100
                  const total = oferece ? calcParceladoOperadora(PREVIEW_BASE, v) : null
                  return (
                    <tr key={p} style={{ backgroundColor: i % 2 === 0 ? '#111' : '#141414' }}>
                      <td className="px-4 py-2 font-medium text-white">{p}x</td>
                      <td className="px-4 py-2">
                        <input
                          type="text" inputMode="decimal" value={raw}
                          onChange={e => setTaxa(operadoraSel, p, e.target.value)}
                          className="w-24 rounded-lg px-3 py-1.5 text-white border outline-none"
                          style={{ backgroundColor: '#1a1a1a', borderColor: formatoOk ? '#2a2a2a' : '#7f1d1d' }}
                          placeholder="não oferece" />
                      </td>
                      <td className="px-4 py-2" style={{ color: total !== null ? '#888' : '#555' }}>
                        {total !== null ? `R$ ${fmt(total)}` : 'não oferece'}
                      </td>
                      <td className="px-4 py-2 font-semibold" style={{ color: '#c8960c' }}>
                        {total !== null ? `R$ ${fmt(total / p)}` : '—'}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* HISTÓRICO / AUDITORIA */}
        <div className="rounded-2xl border p-6" style={{ backgroundColor: '#111', borderColor: '#1f1f1f' }}>
          <button onClick={() => setMostrarAudit(v => !v)}
            className="w-full flex items-center justify-between">
            <h2 className="font-semibold text-white">Histórico de alterações</h2>
            <span style={{ color: '#666' }}>{mostrarAudit ? '▲' : '▼'}</span>
          </button>
          {mostrarAudit && (
            audit.length === 0 ? (
              <p className="text-xs mt-4" style={{ color: '#666' }}>Nenhuma alteração registrada ainda.</p>
            ) : (
              <div className="mt-4 flex flex-col gap-2">
                {audit.map(a => (
                  <div key={a.id} className="rounded-xl p-3 text-xs flex flex-wrap items-center gap-x-3 gap-y-1"
                    style={{ backgroundColor: '#1a1a1a' }}>
                    <span style={{ color: '#888' }}>
                      {new Date(a.created_at).toLocaleString('pt-BR')}
                    </span>
                    <span className="font-medium text-white">{a.usuario_nome ?? '—'}</span>
                    <span style={{ color: '#c8960c' }}>{a.operadora_nome ?? '—'} · {a.parcelas}x</span>
                    <span style={{ color: '#666' }}>
                      {a.valor_anterior !== null ? `${a.valor_anterior}%` : '(novo)'} → <span style={{ color: '#4ade80' }}>{a.valor_novo}%</span>
                    </span>
                  </div>
                ))}
              </div>
            )
          )}
        </div>

        <button onClick={salvar} disabled={salvando}
          className="w-full py-4 rounded-2xl font-bold text-black text-lg transition-all disabled:opacity-50"
          style={{ backgroundColor: '#c8960c' }}
          onMouseEnter={e => e.currentTarget.style.backgroundColor = '#e0a80e'}
          onMouseLeave={e => e.currentTarget.style.backgroundColor = '#c8960c'}>
          {salvando ? 'Salvando...' : editandoAtiva ? '✓ Salvar Taxas' : `✓ Salvar e ativar ${nomeSel}`}
        </button>

      </main>
    </div>
  )
}
