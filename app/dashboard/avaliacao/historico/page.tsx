'use client'

import { useEffect, useState, useMemo } from 'react'
import { createClient } from '../../../lib/supabase'
import { useRouter } from 'next/navigation'
import { SpinnerPage } from '../../../components/Spinner'
import { fmt } from '../../../lib/utils'

interface DetalheCondicoes {
  condicao?: string
  pecas?: string[]
  problemas_graves?: string[]
  desconto_pct?: number
}

interface Avaliacao {
  id: string
  cliente_nome: string | null
  avaliador_nome: string | null
  marca: string
  modelo: string
  capacidade: string | null
  cor: string | null
  condicoes: DetalheCondicoes | null
  valor_base: number | null
  valor_avaliado: number
  precisa_tecnico: boolean
  observacoes: string | null
  created_at: string
}

function dataFmt(iso: string) {
  return new Date(iso).toLocaleString('pt-BR', {
    day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
  })
}

export default function HistoricoAvaliacoes() {
  const router = useRouter()
  const supabase = useMemo(() => createClient(), [])

  const [carregando, setCarregando] = useState(true)
  const [avaliacoes, setAvaliacoes] = useState<Avaliacao[]>([])
  const [busca, setBusca] = useState('')
  const [cargo, setCargo] = useState('')
  const [removendo, setRemovendo] = useState<string | null>(null)

  useEffect(() => {
    async function carregar() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/login'); return }

      const { data: profile } = await supabase
        .from('profiles').select('store_id, cargo').eq('id', user.id).single()
      if (!profile) { router.push('/dashboard'); return }
      setCargo(profile.cargo)

      const { data } = await supabase
        .from('avaliacoes')
        .select('id, cliente_nome, avaliador_nome, marca, modelo, capacidade, cor, condicoes, valor_base, valor_avaliado, precisa_tecnico, observacoes, created_at')
        .eq('store_id', profile.store_id)
        .order('created_at', { ascending: false })
        .limit(200)

      if (data) setAvaliacoes(data as Avaliacao[])
      setCarregando(false)
    }
    carregar()
  }, [])

  async function removerAvaliacao(id: string) {
    if (!confirm('Remover esta avaliação do histórico? Esta ação não pode ser desfeita.')) return
    setRemovendo(id)
    const { error } = await supabase.from('avaliacoes').delete().eq('id', id)
    setRemovendo(null)
    if (error) { alert('Erro ao remover: ' + error.message); return }
    setAvaliacoes(prev => prev.filter(a => a.id !== id))
  }

  const filtradas = useMemo(() => {
    const q = busca.trim().toLowerCase()
    if (!q) return avaliacoes
    return avaliacoes.filter(a =>
      a.modelo.toLowerCase().includes(q) ||
      (a.cliente_nome ?? '').toLowerCase().includes(q) ||
      (a.avaliador_nome ?? '').toLowerCase().includes(q)
    )
  }, [avaliacoes, busca])

  if (carregando) return <SpinnerPage />

  return (
    <div className="min-h-screen pb-24" style={{ backgroundColor: '#0a0a0a' }}>
      <header className="border-b px-6 py-4 flex items-center gap-4 sticky top-0 z-10"
        style={{ backgroundColor: '#111', borderColor: '#1f1f1f' }}>
        <button onClick={() => router.push('/dashboard/avaliacao')}
          className="text-sm px-3 py-1.5 rounded-lg border transition-all"
          style={{ borderColor: '#2a2a2a', color: '#888' }}
          onMouseEnter={e => { e.currentTarget.style.borderColor = '#c8960c'; e.currentTarget.style.color = '#c8960c' }}
          onMouseLeave={e => { e.currentTarget.style.borderColor = '#2a2a2a'; e.currentTarget.style.color = '#888' }}>
          ← Voltar
        </button>
        <div>
          <h1 className="font-bold text-white">Histórico de Avaliações</h1>
          <p className="text-xs" style={{ color: '#666' }}>
            {avaliacoes.length} avaliaç{avaliacoes.length === 1 ? 'ão' : 'ões'} registrada{avaliacoes.length === 1 ? '' : 's'} nesta filial
          </p>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-6 py-8 flex flex-col gap-4">

        {avaliacoes.length > 0 && (
          <input value={busca} onChange={e => setBusca(e.target.value)}
            placeholder="Buscar por modelo, cliente ou avaliador..."
            className="w-full rounded-xl px-4 py-3 text-white border outline-none text-sm"
            style={{ backgroundColor: '#111', borderColor: '#2a2a2a' }} />
        )}

        {filtradas.length === 0 ? (
          <div className="rounded-2xl border p-10 text-center" style={{ backgroundColor: '#111', borderColor: '#1f1f1f' }}>
            <div className="text-4xl mb-3">📋</div>
            <p className="text-white font-semibold">
              {avaliacoes.length === 0 ? 'Nenhuma avaliação ainda' : 'Nada encontrado'}
            </p>
            <p className="text-sm mt-1" style={{ color: '#666' }}>
              {avaliacoes.length === 0
                ? 'As avaliações de compra que você registrar aparecem aqui.'
                : 'Tente outro termo de busca.'}
            </p>
            {avaliacoes.length === 0 && (
              <button onClick={() => router.push('/dashboard/avaliacao')}
                className="mt-5 px-5 py-2.5 rounded-xl font-bold text-black transition-all"
                style={{ backgroundColor: '#c8960c' }}>
                Nova avaliação
              </button>
            )}
          </div>
        ) : (
          filtradas.map(a => {
            const det = a.condicoes ?? {}
            return (
              <div key={a.id} className="rounded-2xl border p-5" style={{ backgroundColor: '#111', borderColor: '#1f1f1f' }}>
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="font-bold text-white">{a.marca} {a.modelo}</p>
                    <p className="text-xs" style={{ color: '#666' }}>
                      {[a.capacidade, a.cor, det.condicao].filter(Boolean).join(' • ')}
                    </p>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <p className="text-2xl font-black" style={{ color: '#c8960c' }}>R$ {fmt(a.valor_avaliado)}</p>
                    {a.valor_base ? (
                      <p className="text-[11px]" style={{ color: '#555' }}>venda R$ {fmt(a.valor_base)}</p>
                    ) : null}
                  </div>
                </div>

                {(det.pecas?.length || det.problemas_graves?.length) ? (
                  <div className="flex flex-wrap gap-1.5 mt-3">
                    {det.pecas?.map(p => (
                      <span key={p} className="text-[10px] border rounded-full px-2 py-0.5" style={{ borderColor: '#c8960c44', color: '#c8960c' }}>
                        Troca: {p}
                      </span>
                    ))}
                    {det.problemas_graves?.map(p => (
                      <span key={p} className="text-[10px] border rounded-full px-2 py-0.5" style={{ borderColor: '#7f1d1d', color: '#fca5a5' }}>
                        {p}
                      </span>
                    ))}
                  </div>
                ) : null}

                {a.precisa_tecnico && (
                  <div className="mt-3 text-xs flex items-center gap-2 rounded-lg px-3 py-2"
                    style={{ backgroundColor: '#1a0a0a', border: '1px solid #7f1d1d', color: '#fca5a5' }}>
                    🛠️ Requer avaliação presencial por técnico
                  </div>
                )}

                {a.observacoes && (
                  <p className="text-xs mt-3 leading-relaxed" style={{ color: '#999' }}>{a.observacoes}</p>
                )}

                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-3 pt-3 border-t text-xs"
                  style={{ borderColor: '#1a1a1a', color: '#666' }}>
                  <span>🗓️ {dataFmt(a.created_at)}</span>
                  {a.cliente_nome && <span>👤 Cliente: <span style={{ color: '#aaa' }}>{a.cliente_nome}</span></span>}
                  {a.avaliador_nome && <span>🧑‍💼 Avaliador: <span style={{ color: '#aaa' }}>{a.avaliador_nome}</span></span>}
                  {cargo === 'gestor' && (
                    <button onClick={() => removerAvaliacao(a.id)} disabled={removendo === a.id}
                      className="ml-auto px-2.5 py-1 rounded-lg border transition-all disabled:opacity-50"
                      style={{ borderColor: '#7f1d1d', color: '#f87171', backgroundColor: '#f8717110' }}>
                      {removendo === a.id ? 'Removendo...' : '🗑️ Remover'}
                    </button>
                  )}
                </div>
              </div>
            )
          })
        )}

      </main>
    </div>
  )
}
