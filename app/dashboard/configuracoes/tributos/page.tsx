'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '../../../lib/supabase/client'
import { SpinnerPage } from '../../../components/ui/Spinner'
import { ToastContainer, useToast } from '../../../components/ui/Toast'

const TAXA_INICIAL = '8'

export default function ConfiguracaoTributariaPage() {
  const router = useRouter()
  const supabase = useMemo(() => createClient(), [])
  const { toasts, remover, erro, sucesso } = useToast()

  const [carregando, setCarregando] = useState(true)
  const [salvando, setSalvando] = useState(false)
  const [storeId, setStoreId] = useState('')
  const [userId, setUserId] = useState('')
  const [taxa, setTaxa] = useState(TAXA_INICIAL)

  useEffect(() => {
    async function carregar() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/login'); return }

      const { data: profile } = await supabase
        .from('profiles')
        .select('cargo, store_id')
        .eq('id', user.id)
        .single()

      if (!profile || profile.cargo !== 'gestor') {
        router.push('/dashboard')
        return
      }

      setUserId(user.id)
      setStoreId(profile.store_id)

      const { data: config, error } = await supabase
        .from('store_payment_config')
        .select('taxa_tributaria_estimada')
        .eq('store_id', profile.store_id)
        .maybeSingle()

      if (error) {
        erro('Não foi possível carregar a configuração tributária.')
      } else if (config?.taxa_tributaria_estimada !== null && config?.taxa_tributaria_estimada !== undefined) {
        setTaxa(String(config.taxa_tributaria_estimada))
      }

      setCarregando(false)
    }

    carregar()
  }, [erro, router, supabase])

  async function salvar() {
    const percentual = Number(taxa.replace(',', '.'))

    if (!Number.isFinite(percentual) || percentual < 0 || percentual >= 100) {
      erro('Informe um percentual igual ou maior que 0% e menor que 100%.')
      return
    }

    setSalvando(true)
    const { error } = await supabase
      .from('store_payment_config')
      .upsert({
        store_id: storeId,
        taxa_tributaria_estimada: percentual,
        updated_by: userId,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'store_id' })

    setSalvando(false)

    if (error) {
      erro('Não foi possível salvar a taxa estimada.')
      return
    }

    sucesso('Taxa tributária estimada atualizada.')
  }

  if (carregando) return <SpinnerPage />

  return (
    <div className="min-h-screen" style={{ backgroundColor: '#0a0a0a' }}>
      <ToastContainer toasts={toasts} onRemover={remover} />

      <header className="border-b px-6 py-4 flex items-center gap-4"
        style={{ backgroundColor: '#111', borderColor: '#1f1f1f' }}>
        <button onClick={() => router.push('/dashboard/configuracoes')}
          className="text-sm px-3 py-1.5 rounded-lg border"
          style={{ borderColor: '#2a2a2a', color: '#888' }}>
          ← Voltar
        </button>
        <div>
          <h1 className="font-bold text-white">Margem e Tributos</h1>
          <p className="text-xs" style={{ color: '#666' }}>Configuração exclusiva desta filial</p>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-6 py-8">
        <section className="rounded-2xl border p-6"
          style={{ backgroundColor: '#111', borderColor: '#1f1f1f' }}>
          <h2 className="text-lg font-bold text-white">Taxa tributária estimada</h2>
          <p className="text-sm mt-2 leading-relaxed" style={{ color: '#888' }}>
            Percentual usado para estimar o impacto dos tributos na margem e ajudar o gestor
            a definir preços. Este cálculo não substitui a apuração fiscal da contabilidade.
          </p>

          <label className="text-sm mt-6 mb-2 block" style={{ color: '#aaa' }}>
            Percentual estimado (%)
          </label>
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <input
                type="text"
                inputMode="decimal"
                value={taxa}
                onChange={event => setTaxa(event.target.value)}
                className="w-full rounded-xl px-4 py-3 pr-10 text-white border outline-none"
                style={{ backgroundColor: '#1a1a1a', borderColor: '#2a2a2a' }}
                placeholder="Ex.: 8"
              />
              <span className="absolute right-4 top-1/2 -translate-y-1/2" style={{ color: '#666' }}>%</span>
            </div>
            <button
              onClick={salvar}
              disabled={salvando}
              className="rounded-xl px-6 py-3 font-bold disabled:opacity-50"
              style={{ backgroundColor: '#c8960c', color: '#000' }}>
              {salvando ? 'Salvando...' : 'Salvar taxa'}
            </button>
          </div>

          <div className="rounded-xl border p-4 mt-6"
            style={{ backgroundColor: '#0d0d0d', borderColor: '#2a2a2a' }}>
            <p className="text-sm font-medium text-white">Como o sistema utilizará este valor</p>
            <p className="text-sm mt-2" style={{ color: '#777' }}>
              A margem bruta será exibida antes da estimativa tributária. A margem líquida estimada
              considerará este percentual, além das taxas de pagamento aplicáveis à negociação.
            </p>
          </div>
        </section>
      </main>
    </div>
  )
}
