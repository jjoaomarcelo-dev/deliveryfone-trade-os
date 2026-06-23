'use client'

import { useState } from 'react'
import { createClient } from '../lib/supabase'
import { useRouter } from 'next/navigation'
import Image from 'next/image'

type Tela = 'login' | 'recuperar' | 'recuperar_enviado'

export default function LoginPage() {
  const [tela, setTela] = useState<Tela>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [erro, setErro] = useState('')
  const [carregando, setCarregando] = useState(false)
  const router = useRouter()
  const supabase = createClient()

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault()
    setCarregando(true)
    setErro('')

    const { error } = await supabase.auth.signInWithPassword({ email, password })

    if (error) {
      setErro('Email ou senha incorretos')
      setCarregando(false)
      return
    }

    router.push('/dashboard')
  }

  async function handleRecuperar(e: React.FormEvent) {
    e.preventDefault()
    setCarregando(true)
    setErro('')

    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/login`,
    })

    setCarregando(false)
    if (error) {
      setErro('Erro ao enviar email: ' + error.message)
      return
    }
    setTela('recuperar_enviado')
  }

  return (
    <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: '#0a0a0a' }}>
      {/* Brilho decorativo */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-96 h-96 rounded-full opacity-20 blur-3xl" style={{ backgroundColor: '#c8960c' }} />

      <div className="relative w-full max-w-md mx-4">
        {/* Card */}
        <div className="rounded-2xl p-8 shadow-2xl border" style={{ backgroundColor: '#111111', borderColor: '#2a2a2a' }}>

          {/* Logo / Nome */}
          <div className="text-center mb-8">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl mb-4 overflow-hidden">
              <Image src="/logo.png" alt="DeliveryFone" width={64} height={64} className="object-contain" />
            </div>
            <h1 className="text-3xl font-black text-white tracking-tight">
              Delivery<span style={{ color: '#c8960c' }}>Fone</span>
            </h1>
            <p className="text-sm mt-1" style={{ color: '#666' }}>Sistema de Estoque</p>
          </div>

          {/* ── LOGIN ── */}
          {tela === 'login' && (
            <form onSubmit={handleLogin} className="flex flex-col gap-4">
              <div>
                <label className="text-sm font-medium mb-2 block" style={{ color: '#aaa' }}>Email</label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full rounded-xl px-4 py-3 text-white outline-none transition-all border"
                  style={{ backgroundColor: '#1a1a1a', borderColor: '#2a2a2a' }}
                  onFocus={(e) => e.target.style.borderColor = '#c8960c'}
                  onBlur={(e) => e.target.style.borderColor = '#2a2a2a'}
                  placeholder="seu@email.com"
                  required
                />
              </div>

              <div>
                <label className="text-sm font-medium mb-2 block" style={{ color: '#aaa' }}>Senha</label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full rounded-xl px-4 py-3 text-white outline-none transition-all border"
                  style={{ backgroundColor: '#1a1a1a', borderColor: '#2a2a2a' }}
                  onFocus={(e) => e.target.style.borderColor = '#c8960c'}
                  onBlur={(e) => e.target.style.borderColor = '#2a2a2a'}
                  placeholder="••••••••"
                  required
                />
              </div>

              {erro && (
                <div className="rounded-xl px-4 py-3 text-sm text-center" style={{ backgroundColor: '#2a0a0a', color: '#ff6b6b', border: '1px solid #4a1a1a' }}>
                  {erro}
                </div>
              )}

              <button
                type="submit"
                disabled={carregando}
                className="w-full font-bold py-3 rounded-xl transition-all mt-2 disabled:opacity-50"
                style={{ backgroundColor: '#c8960c', color: '#000' }}
                onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#e0a80e')}
                onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = '#c8960c')}
              >
                {carregando ? 'Entrando...' : 'Entrar'}
              </button>

              <button
                type="button"
                onClick={() => { setTela('recuperar'); setErro('') }}
                className="text-sm text-center mt-1 transition-all"
                style={{ color: '#666' }}
                onMouseEnter={(e) => (e.currentTarget.style.color = '#c8960c')}
                onMouseLeave={(e) => (e.currentTarget.style.color = '#666')}
              >
                Esqueci minha senha
              </button>
            </form>
          )}

          {/* ── RECUPERAR SENHA ── */}
          {tela === 'recuperar' && (
            <form onSubmit={handleRecuperar} className="flex flex-col gap-4">
              <div className="text-center mb-2">
                <p className="text-white font-semibold">Recuperar senha</p>
                <p className="text-sm mt-1" style={{ color: '#666' }}>Enviaremos um link para o seu email</p>
              </div>

              <div>
                <label className="text-sm font-medium mb-2 block" style={{ color: '#aaa' }}>Email</label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full rounded-xl px-4 py-3 text-white outline-none transition-all border"
                  style={{ backgroundColor: '#1a1a1a', borderColor: '#2a2a2a' }}
                  onFocus={(e) => e.target.style.borderColor = '#c8960c'}
                  onBlur={(e) => e.target.style.borderColor = '#2a2a2a'}
                  placeholder="seu@email.com"
                  required
                />
              </div>

              {erro && (
                <div className="rounded-xl px-4 py-3 text-sm text-center" style={{ backgroundColor: '#2a0a0a', color: '#ff6b6b', border: '1px solid #4a1a1a' }}>
                  {erro}
                </div>
              )}

              <button
                type="submit"
                disabled={carregando}
                className="w-full font-bold py-3 rounded-xl transition-all disabled:opacity-50"
                style={{ backgroundColor: '#c8960c', color: '#000' }}
                onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#e0a80e')}
                onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = '#c8960c')}
              >
                {carregando ? 'Enviando...' : 'Enviar link de recuperação'}
              </button>

              <button
                type="button"
                onClick={() => { setTela('login'); setErro('') }}
                className="text-sm text-center transition-all"
                style={{ color: '#666' }}
                onMouseEnter={(e) => (e.currentTarget.style.color = '#c8960c')}
                onMouseLeave={(e) => (e.currentTarget.style.color = '#666')}
              >
                ← Voltar ao login
              </button>
            </form>
          )}

          {/* ── EMAIL ENVIADO ── */}
          {tela === 'recuperar_enviado' && (
            <div className="flex flex-col items-center gap-4 text-center">
              <div className="text-5xl">📧</div>
              <p className="text-white font-semibold">Email enviado!</p>
              <p className="text-sm" style={{ color: '#888' }}>
                Verifique sua caixa de entrada em <span style={{ color: '#c8960c' }}>{email}</span> e clique no link para redefinir sua senha.
              </p>
              <button
                type="button"
                onClick={() => { setTela('login'); setErro('') }}
                className="text-sm mt-2 transition-all"
                style={{ color: '#666' }}
                onMouseEnter={(e) => (e.currentTarget.style.color = '#c8960c')}
                onMouseLeave={(e) => (e.currentTarget.style.color = '#666')}
              >
                ← Voltar ao login
              </button>
            </div>
          )}
        </div>

        {/* Rodapé */}
        <p className="text-center text-xs mt-6" style={{ color: '#444' }}>
          DeliveryFone © 2025 — Todos os direitos reservados
        </p>
      </div>
    </div>
  )
}
