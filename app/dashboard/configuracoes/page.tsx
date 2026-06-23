'use client'

import { useEffect, useState, useMemo } from 'react'
import { createClient } from '../../lib/supabase'
import { useRouter } from 'next/navigation'
import { SpinnerPage } from '../../components/Spinner'

export default function Configuracoes() {
  const router = useRouter()
  const supabase = useMemo(() => createClient(), [])
  const [carregando, setCarregando] = useState(true)

  useEffect(() => {
    async function checar() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/login'); return }

      const { data: profile } = await supabase
        .from('profiles')
        .select('cargo')
        .eq('id', user.id)
        .single()

      if (!profile || profile.cargo !== 'gestor') {
        router.push('/dashboard')
        return
      }
      setCarregando(false)
    }
    checar()
  }, [])

  if (carregando) return <SpinnerPage />

  return (
    <div className="min-h-screen" style={{ backgroundColor: '#0a0a0a' }}>
      <header className="border-b px-6 py-4 flex items-center gap-4 sticky top-0 z-10"
        style={{ backgroundColor: '#111', borderColor: '#1f1f1f' }}>
        <button onClick={() => router.push('/dashboard')}
          className="text-sm px-3 py-1.5 rounded-lg border transition-all"
          style={{ borderColor: '#2a2a2a', color: '#888' }}
          onMouseEnter={e => { e.currentTarget.style.borderColor = '#c8960c'; e.currentTarget.style.color = '#c8960c' }}
          onMouseLeave={e => { e.currentTarget.style.borderColor = '#2a2a2a'; e.currentTarget.style.color = '#888' }}>
          ← Voltar
        </button>
        <div>
          <h1 className="font-bold text-white">Configurações</h1>
          <p className="text-xs" style={{ color: '#666' }}>Ajustes da filial</p>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-6 py-8 flex flex-col gap-4">
        <button
          onClick={() => router.push('/dashboard/configuracoes/taxas')}
          className="w-full rounded-2xl border p-6 flex items-center gap-4 text-left transition-all"
          style={{ backgroundColor: '#111', borderColor: '#1f1f1f' }}
          onMouseEnter={e => e.currentTarget.style.borderColor = '#c8960c44'}
          onMouseLeave={e => e.currentTarget.style.borderColor = '#1f1f1f'}>
          <div className="w-14 h-14 rounded-2xl flex items-center justify-center text-2xl flex-shrink-0"
            style={{ backgroundColor: '#1a1a1a' }}>
            💳
          </div>
          <div>
            <h2 className="font-bold text-white text-lg">Taxas de Parcelamento</h2>
            <p className="text-sm mt-0.5" style={{ color: '#666' }}>
              Operadora ativa, taxas por parcela e histórico de alterações
            </p>
          </div>
          <div className="ml-auto text-xl" style={{ color: '#c8960c' }}>→</div>
        </button>

        <button
          onClick={() => router.push('/dashboard/configuracoes/avaliacao')}
          className="w-full rounded-2xl border p-6 flex items-center gap-4 text-left transition-all"
          style={{ backgroundColor: '#111', borderColor: '#1f1f1f' }}
          onMouseEnter={e => e.currentTarget.style.borderColor = '#c8960c44'}
          onMouseLeave={e => e.currentTarget.style.borderColor = '#1f1f1f'}>
          <div className="w-14 h-14 rounded-2xl flex items-center justify-center text-2xl flex-shrink-0"
            style={{ backgroundColor: '#1a1a1a' }}>
            📲
          </div>
          <div>
            <h2 className="font-bold text-white text-lg">Taxas de Avaliação</h2>
            <p className="text-sm mt-0.5" style={{ color: '#666' }}>
              Valor-base por modelo, desconto por peça, condição e problemas graves
            </p>
          </div>
          <div className="ml-auto text-xl" style={{ color: '#c8960c' }}>→</div>
        </button>
      </main>
    </div>
  )
}
