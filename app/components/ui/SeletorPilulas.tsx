'use client'

interface SeletorPilulasProps {
  opcoes: readonly string[]
  valor: string
  onSelecionar: (valor: string) => void
  /**
   * 'wrap' = flex que quebra linha (poucos itens: GB, cor)
   * 'grid' = grade responsiva de largura uniforme (muitos itens: modelos)
   */
  layout?: 'wrap' | 'grid'
}

/**
 * Seletor padrão do app em formato de "pílulas" (tema DeliveryFone).
 * Usado no cadastro de produto e na avaliação de compra para manter
 * a mesma identidade visual.
 */
export default function SeletorPilulas({
  opcoes,
  valor,
  onSelecionar,
  layout = 'wrap',
}: SeletorPilulasProps) {
  const containerClass =
    layout === 'grid'
      ? 'grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2'
      : 'flex flex-wrap gap-2'

  return (
    <div className={containerClass}>
      {opcoes.map(opt => {
        const ativo = valor === opt
        return (
          <button
            key={opt}
            type="button"
            onClick={() => onSelecionar(opt)}
            className="rounded-xl text-sm font-medium border px-4 py-2.5 text-center transition-all"
            style={{
              backgroundColor: ativo ? '#c8960c' : '#1a1a1a',
              borderColor: ativo ? '#c8960c' : '#2a2a2a',
              color: ativo ? '#000' : '#aaa',
              boxShadow: ativo ? '0 2px 12px #c8960c33' : 'none',
            }}
            onMouseEnter={e => {
              if (ativo) return
              e.currentTarget.style.borderColor = '#c8960c66'
              e.currentTarget.style.color = '#fff'
              e.currentTarget.style.backgroundColor = '#1f1f1f'
            }}
            onMouseLeave={e => {
              if (ativo) return
              e.currentTarget.style.borderColor = '#2a2a2a'
              e.currentTarget.style.color = '#aaa'
              e.currentTarget.style.backgroundColor = '#1a1a1a'
            }}
          >
            {opt}
          </button>
        )
      })}
    </div>
  )
}
