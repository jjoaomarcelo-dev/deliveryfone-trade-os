'use client'

import { useState, useCallback, useEffect } from 'react'

// ─── Tipos ────────────────────────────────────────────────────────────────────

export type ToastTipo = 'erro' | 'sucesso' | 'aviso'

export interface ToastItem {
  id: string
  tipo: ToastTipo
  mensagem: string
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useToast() {
  const [toasts, setToasts] = useState<ToastItem[]>([])

  const remover = useCallback((id: string) => {
    setToasts(prev => prev.filter(t => t.id !== id))
  }, [])

  const mostrar = useCallback((tipo: ToastTipo, mensagem: string) => {
    const id = Math.random().toString(36).slice(2)
    setToasts(prev => [...prev, { id, tipo, mensagem }])
    setTimeout(() => remover(id), 4500)
  }, [remover])

  const erro    = useCallback((msg: string) => mostrar('erro', msg),    [mostrar])
  const sucesso = useCallback((msg: string) => mostrar('sucesso', msg), [mostrar])
  const aviso   = useCallback((msg: string) => mostrar('aviso', msg),   [mostrar])

  return { toasts, remover, erro, sucesso, aviso }
}

// ─── Componente ───────────────────────────────────────────────────────────────

const CORES: Record<ToastTipo, { bg: string; border: string; icon: string }> = {
  erro:    { bg: '#1a0a0a', border: '#7f1d1d', icon: '✕' },
  sucesso: { bg: '#0a1a0a', border: '#14532d', icon: '✓' },
  aviso:   { bg: '#1a140a', border: '#78350f', icon: '!' },
}

const TEXTO: Record<ToastTipo, string> = {
  erro:    '#fca5a5',
  sucesso: '#86efac',
  aviso:   '#fcd34d',
}

function ToastSingle({ item, onRemover }: { item: ToastItem; onRemover: (id: string) => void }) {
  const [visivel, setVisivel] = useState(false)

  useEffect(() => {
    // entrada com pequeno delay para trigger da animação
    const t = setTimeout(() => setVisivel(true), 10)
    return () => clearTimeout(t)
  }, [])

  const cor = CORES[item.tipo]

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'flex-start',
        gap: '10px',
        padding: '12px 16px',
        borderRadius: '12px',
        border: `1px solid ${cor.border}`,
        backgroundColor: cor.bg,
        boxShadow: '0 4px 20px rgba(0,0,0,0.5)',
        maxWidth: '380px',
        width: '100%',
        transform: visivel ? 'translateX(0)' : 'translateX(100%)',
        opacity: visivel ? 1 : 0,
        transition: 'transform 0.25s ease, opacity 0.25s ease',
        cursor: 'default',
      }}
    >
      {/* Ícone */}
      <div style={{
        width: 20, height: 20, borderRadius: '50%',
        border: `1.5px solid ${TEXTO[item.tipo]}`,
        color: TEXTO[item.tipo],
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 11, fontWeight: 700, flexShrink: 0, marginTop: 1,
      }}>
        {cor.icon}
      </div>

      {/* Mensagem */}
      <span style={{ color: '#e5e5e5', fontSize: 13, lineHeight: '1.4', flex: 1 }}>
        {item.mensagem}
      </span>

      {/* Fechar */}
      <button
        onClick={() => onRemover(item.id)}
        style={{
          background: 'none', border: 'none', cursor: 'pointer',
          color: '#555', fontSize: 14, padding: 0, flexShrink: 0,
          lineHeight: 1, marginTop: 1,
        }}
        onMouseEnter={e => (e.currentTarget.style.color = '#aaa')}
        onMouseLeave={e => (e.currentTarget.style.color = '#555')}
      >
        ✕
      </button>
    </div>
  )
}

export function ToastContainer({ toasts, onRemover }: { toasts: ToastItem[]; onRemover: (id: string) => void }) {
  if (toasts.length === 0) return null

  return (
    <div style={{
      position: 'fixed',
      bottom: 24,
      right: 24,
      zIndex: 9999,
      display: 'flex',
      flexDirection: 'column',
      gap: 8,
      pointerEvents: 'none',
    }}>
      {toasts.map(t => (
        <div key={t.id} style={{ pointerEvents: 'auto' }}>
          <ToastSingle item={t} onRemover={onRemover} />
        </div>
      ))}
    </div>
  )
}
