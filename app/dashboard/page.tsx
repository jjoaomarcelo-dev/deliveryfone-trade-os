'use client'

import { useEffect, useState, useMemo } from 'react'
import { createClient } from '../lib/supabase'
import { useRouter } from 'next/navigation'
import { SpinnerPage } from '../components/Spinner'

interface Profile {
  nome: string
  cargo: string
  store_id: string
  stores: { nome: string } | null
}

interface Stats {
  disponivel: number
  manutencao: number
  emprestado: number
  garantia: number
  devolucao: number
  vendido: number
}

export default function Dashboard() {
  const [profile, setProfile] = useState<Profile | null>(null)
  const [stats, setStats] = useState<Stats>({ disponivel: 0, manutencao: 0, emprestado: 0, garantia: 0, devolucao: 0, vendido: 0 })
  const [carregando, setCarregando] = useState(true)
  const router = useRouter()
  const supabase = useMemo(() => createClient(), [])

  useEffect(() => {
    async function carregarPerfil() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/login'); return }

      const { data } = await supabase
        .from('profiles')
        .select('nome, cargo, store_id, stores(nome)')
        .eq('id', user.id)
        .single()

      if (data) {
        // Supabase retorna stores como array no join — normalizar para objeto
        const storesRaw = data.stores
        const storesNorm = Array.isArray(storesRaw) ? (storesRaw[0] ?? null) : storesRaw
        setProfile({ ...data, stores: storesNorm } as Profile)

        // Carregar contagens de produtos
        const { data: produtos } = await supabase
          .from('products')
          .select('status')
          .eq('store_id', data.store_id)

        if (produtos) {
          const s: Stats = { disponivel: 0, manutencao: 0, emprestado: 0, garantia: 0, devolucao: 0, vendido: 0 }
          produtos.forEach(p => {
            if (p.status in s) s[p.status as keyof Stats]++
          })
          setStats(s)
        }
      }

      setCarregando(false)
    }
    carregarPerfil()
  }, [])

  async function handleLogout() {
    await supabase.auth.signOut()
    router.push('/login')
  }

  if (carregando) return <SpinnerPage />

  const ehGestor = profile?.cargo === 'gestor'
  const totalAtivo = stats.disponivel + stats.manutencao + stats.emprestado + stats.garantia + stats.devolucao

  return (
    <div className="min-h-screen" style={{ backgroundColor: '#0a0a0a' }}>

      {/* Header */}
      <header className="border-b px-6 py-4 flex items-center justify-between"
        style={{ backgroundColor: '#111', borderColor: '#1f1f1f' }}>
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg flex items-center justify-center font-black text-black text-sm"
            style={{ backgroundColor: '#c8960c' }}>
            D
          </div>
          <div>
            <span className="font-bold text-white">Delivery</span>
            <span className="font-bold" style={{ color: '#c8960c' }}>Fone</span>
          </div>
          <div className="w-px h-5 mx-2" style={{ backgroundColor: '#2a2a2a' }} />
          <span className="text-sm" style={{ color: '#666' }}>{profile?.stores?.nome}</span>
        </div>

        <div className="flex items-center gap-4">
          <div className="text-right">
            <p className="text-sm font-medium text-white">{profile?.nome}</p>
            <p className="text-xs capitalize" style={{ color: '#c8960c' }}>{profile?.cargo}</p>
          </div>
          <button onClick={handleLogout}
            className="px-4 py-2 rounded-lg text-sm font-medium transition-all border"
            style={{ borderColor: '#2a2a2a', color: '#888' }}
            onMouseEnter={e => { e.currentTarget.style.borderColor = '#c8960c'; e.currentTarget.style.color = '#c8960c' }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = '#2a2a2a'; e.currentTarget.style.color = '#888' }}>
            Sair
          </button>
        </div>
      </header>

      <main className="px-6 py-8 max-w-7xl mx-auto">

        {/* Boas-vindas */}
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-white">
            Olá, {profile?.nome.split(' ')[0]} 👋
          </h1>
          <p className="mt-1" style={{ color: '#666' }}>
            Bem-vindo ao painel de estoque da {profile?.stores?.nome}
          </p>
        </div>

        {/* Cards de resumo */}
        {ehGestor ? (
          // Gestor vê todos os status
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-8">
            {[
              { label: 'Disponíveis',  valor: stats.disponivel,  cor: '#4ade80', bg: '#4ade8015', emoji: '🟢' },
              { label: 'Manutenção',   valor: stats.manutencao,  cor: '#fb923c', bg: '#fb923c15', emoji: '🔧' },
              { label: 'Emprestados',  valor: stats.emprestado,  cor: '#60a5fa', bg: '#60a5fa15', emoji: '🔵' },
              { label: 'Garantia',     valor: stats.garantia,    cor: '#a78bfa', bg: '#a78bfa15', emoji: '🛡️' },
              { label: 'Devolução',    valor: stats.devolucao,   cor: '#f87171', bg: '#f8717115', emoji: '🔄' },
              { label: 'Vendidos',     valor: stats.vendido,     cor: '#888',    bg: '#88888815', emoji: '✅' },
            ].map(card => (
              <button key={card.label}
                onClick={() => router.push('/dashboard/estoque')}
                className="rounded-2xl p-5 border text-left transition-all"
                style={{ backgroundColor: card.bg, borderColor: card.cor + '44' }}
                onMouseEnter={e => e.currentTarget.style.borderColor = card.cor}
                onMouseLeave={e => e.currentTarget.style.borderColor = card.cor + '44'}>
                <div className="text-2xl mb-3">{card.emoji}</div>
                <p className="text-2xl font-bold text-white">{card.valor}</p>
                <p className="text-xs mt-1" style={{ color: card.cor }}>{card.label}</p>
              </button>
            ))}
          </div>
        ) : (
          // Vendedor vê resumo simplificado
          <div className="grid grid-cols-2 gap-4 mb-8">
            <div className="rounded-2xl p-5 border" style={{ backgroundColor: '#4ade8015', borderColor: '#4ade8044' }}>
              <div className="text-2xl mb-3">📦</div>
              <p className="text-2xl font-bold text-white">{stats.disponivel}</p>
              <p className="text-xs mt-1" style={{ color: '#4ade80' }}>Disponíveis para venda</p>
            </div>
            <div className="rounded-2xl p-5 border" style={{ backgroundColor: '#88888815', borderColor: '#88888844' }}>
              <div className="text-2xl mb-3">✅</div>
              <p className="text-2xl font-bold text-white">{stats.vendido}</p>
              <p className="text-xs mt-1" style={{ color: '#888' }}>Vendidos</p>
            </div>
          </div>
        )}

        {/* Ações principais */}
        <div className="flex flex-col sm:flex-row gap-4">
          <button
            onClick={() => router.push('/dashboard/estoque')}
            className="flex-1 rounded-2xl border p-6 flex items-center gap-4 text-left transition-all group"
            style={{ backgroundColor: '#111', borderColor: '#1f1f1f' }}
            onMouseEnter={e => e.currentTarget.style.borderColor = '#c8960c44'}
            onMouseLeave={e => e.currentTarget.style.borderColor = '#1f1f1f'}>
            <div className="w-14 h-14 rounded-2xl flex items-center justify-center text-2xl flex-shrink-0"
              style={{ backgroundColor: '#1a1a1a' }}>
              📋
            </div>
            <div>
              <h2 className="font-bold text-white text-lg">Ver Estoque</h2>
              <p className="text-sm mt-0.5" style={{ color: '#666' }}>
                {ehGestor
                  ? `${totalAtivo} produto${totalAtivo !== 1 ? 's' : ''} em estoque · filtrar por status`
                  : `${stats.disponivel} produto${stats.disponivel !== 1 ? 's' : ''} disponíve${stats.disponivel !== 1 ? 'is' : 'l'}`}
              </p>
            </div>
            <div className="ml-auto text-xl" style={{ color: '#c8960c' }}>→</div>
          </button>

          {ehGestor && (
            <button
              onClick={() => router.push('/dashboard/novo-produto')}
              className="flex-1 rounded-2xl p-6 flex items-center gap-4 text-left transition-all"
              style={{ backgroundColor: '#c8960c' }}
              onMouseEnter={e => e.currentTarget.style.backgroundColor = '#e0a80e'}
              onMouseLeave={e => e.currentTarget.style.backgroundColor = '#c8960c'}>
              <div className="w-14 h-14 rounded-2xl flex items-center justify-center text-2xl flex-shrink-0"
                style={{ backgroundColor: '#00000022' }}>
                ➕
              </div>
              <div>
                <h2 className="font-bold text-black text-lg">Novo Produto</h2>
                <p className="text-sm mt-0.5" style={{ color: '#00000066' }}>
                  Cadastrar iPhone ou outro aparelho
                </p>
              </div>
            </button>
          )}
        </div>

        {/* Avaliação de compra de celular */}
        <div className="mt-4">
          <button
            onClick={() => router.push('/dashboard/avaliacao')}
            className="w-full rounded-2xl border p-6 flex items-center gap-4 text-left transition-all group"
            style={{ backgroundColor: '#111', borderColor: '#1f1f1f' }}
            onMouseEnter={e => e.currentTarget.style.borderColor = '#4ade8044'}
            onMouseLeave={e => e.currentTarget.style.borderColor = '#1f1f1f'}>
            <div className="w-14 h-14 rounded-2xl flex items-center justify-center text-2xl flex-shrink-0"
              style={{ backgroundColor: '#1a1a1a' }}>
              📲
            </div>
            <div>
              <h2 className="font-bold text-white text-lg">Avaliação de Compra de Celular</h2>
              <p className="text-sm mt-0.5" style={{ color: '#666' }}>
                Calcule quanto pagar pelo aparelho usado do cliente
              </p>
            </div>
            <div className="ml-auto text-xl" style={{ color: '#4ade80' }}>→</div>
          </button>
        </div>

        {/* Relatórios */}
        <div className="mt-4">
          <button
            onClick={() => router.push('/dashboard/relatorios')}
            className="w-full rounded-2xl border p-6 flex items-center gap-4 text-left transition-all group"
            style={{ backgroundColor: '#111', borderColor: '#1f1f1f' }}
            onMouseEnter={e => e.currentTarget.style.borderColor = '#a78bfa44'}
            onMouseLeave={e => e.currentTarget.style.borderColor = '#1f1f1f'}>
            <div className="w-14 h-14 rounded-2xl flex items-center justify-center text-2xl flex-shrink-0"
              style={{ backgroundColor: '#1a1a1a' }}>
              📊
            </div>
            <div>
              <h2 className="font-bold text-white text-lg">Relatórios</h2>
              <p className="text-sm mt-0.5" style={{ color: '#666' }}>
                {ehGestor
                  ? 'Vendas por vendedor, lucro, ticket médio e descontos'
                  : 'Suas vendas confirmadas, lucro e desempenho'}
              </p>
            </div>
            <div className="ml-auto text-xl" style={{ color: '#a78bfa' }}>→</div>
          </button>
        </div>

        {/* Configurações — apenas gestor */}
        {ehGestor && (
          <div className="mt-4">
            <button
              onClick={() => router.push('/dashboard/configuracoes')}
              className="w-full rounded-2xl border p-6 flex items-center gap-4 text-left transition-all group"
              style={{ backgroundColor: '#111', borderColor: '#1f1f1f' }}
              onMouseEnter={e => e.currentTarget.style.borderColor = '#c8960c44'}
              onMouseLeave={e => e.currentTarget.style.borderColor = '#1f1f1f'}>
              <div className="w-14 h-14 rounded-2xl flex items-center justify-center text-2xl flex-shrink-0"
                style={{ backgroundColor: '#1a1a1a' }}>
                ⚙️
              </div>
              <div>
                <h2 className="font-bold text-white text-lg">Configurações</h2>
                <p className="text-sm mt-0.5" style={{ color: '#666' }}>
                  Taxas de parcelamento por operadora e outros ajustes da filial
                </p>
              </div>
              <div className="ml-auto text-xl" style={{ color: '#c8960c' }}>→</div>
            </button>
          </div>
        )}

      </main>
    </div>
  )
}
