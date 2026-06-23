'use client'

import { useEffect, useState, useMemo } from 'react'
import { createClient } from '../lib/supabase'
import { useRouter } from 'next/navigation'
import { MODELOS_IPHONE, GB_IPHONE, CORES_IPHONE } from '../lib/iphone-data'
import { dataHoje, diasNoEstoque } from '../lib/utils'
import { type Juros, TAXA_REAL_FALLBACK, calcParcelado } from '../lib/financeiro'
import { getTaxasAtivas } from '../lib/taxas'
import { SpinnerPage } from './Spinner'
import SeletorPilulas from './SeletorPilulas'

interface Props {
  produtoId?: string
}

export default function ProdutoForm({ produtoId }: Props) {
  const modoEditar = !!produtoId
  const router = useRouter()
  const supabase = useMemo(() => createClient(), [])

  const [cargo, setCargo] = useState('')
  const [storeId, setStoreId] = useState('')
  const [userId, setUserId] = useState('')
  const [carregando, setCarregando] = useState(true)
  const [salvando, setSalvando] = useState(false)
  const [sucesso, setSucesso] = useState(false)
  const [juros, setJuros] = useState<Juros[]>([])

  const [modelo, setModelo] = useState('')
  const [tipo, setTipo] = useState('')
  const [condicao, setCondicao] = useState('')
  const [gb, setGb] = useState('')
  const [cor, setCor] = useState('')
  const [bateria, setBateria] = useState('')
  const [imei, setImei] = useState('')
  const [observacoes, setObservacoes] = useState('')
  const [videoUrl, setVideoUrl] = useState('')
  const [dataEntrada, setDataEntrada] = useState(dataHoje())
  const [status, setStatus] = useState('disponivel')

  const [custoEntrada, setCustoEntrada] = useState('')
  const [custoManutencao, setCustoManutencao] = useState('')
  const [origem, setOrigem] = useState('Compra')
  const [fornecedor, setFornecedor] = useState('')
  const [codigoTroca, setCodigoTroca] = useState('')
  const [valor, setValor] = useState('')
  const [valorMinimo, setValorMinimo] = useState('')
  const [valorPromocional, setValorPromocional] = useState('')
  const [temPromoSemJuros, setTemPromoSemJuros] = useState(false)
  const [valorSemJuros, setValorSemJuros] = useState('')
  const [parcelasSemJuros, setParcelasSemJuros] = useState(0)

  const ehSeminovo = tipo === 'Seminovo'
  const custoTotal = (parseFloat(custoEntrada) || 0) + (parseFloat(custoManutencao) || 0)
  const gbsDisponiveis = modelo && tipo ? (GB_IPHONE[modelo] || []) : []
  const coresDisponiveis = gb ? (CORES_IPHONE[modelo] || []) : []
  const camposVisiveis = ehSeminovo ? (cor && condicao) : cor

  function calcLucro(preco: number) {
    if (!custoTotal || !preco) return null
    return preco - custoTotal
  }

  function calcLucroComNF(preco: number) {
    if (!custoTotal || !preco) return null
    return (preco * 0.92) - custoTotal
  }

  function calcRecebidoLiquido(valorParcelado: number, taxaReal: number | null, parcelas?: number) {
    const taxa = taxaReal ?? (parcelas !== undefined ? (TAXA_REAL_FALLBACK[parcelas] ?? 14) : 14)
    return valorParcelado * (1 - taxa / 100)
  }

  function calcLucroLiquidoParcelado(preco: number, j: Juros) {
    if (!custoTotal) return null
    const valorParcelado = calcParcelado(preco, j.taxa_comercial)
    const recebidoLiquido = calcRecebidoLiquido(valorParcelado, j.taxa_operadora, j.parcelas)
    return recebidoLiquido - custoTotal
  }

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

      if (!profile) { router.push('/login'); return }

      // Edição: apenas gestores podem editar
      if (modoEditar && profile.cargo !== 'gestor') {
        router.push('/dashboard')
        return
      }

      setCargo(profile.cargo)
      setStoreId(profile.store_id)

      // Modo editar: carregar dados do produto
      if (modoEditar) {
        const { data: produto } = await supabase
          .from('products')
          .select('*')
          .eq('id', produtoId)
          .single()

        if (produto) {
          const attr = produto.atributos || {}
          setModelo(produto.modelo || '')
          setTipo(attr.tipo || '')
          setCondicao(attr.condicao || '')
          setGb(attr.gb || '')
          setCor(attr.cor || '')
          setBateria(attr.bateria || '')
          setImei(attr.imei || '')
          setObservacoes(produto.observacoes || '')
          setVideoUrl(produto.video_url || '')
          setDataEntrada(produto.data_entrada || dataHoje())
          setStatus(produto.status || 'disponivel')
          setOrigem(attr.origem || 'Compra')
          setFornecedor(attr.fornecedor || '')
          setCodigoTroca(attr.codigo_troca || '')
          setCustoEntrada(attr.custo_entrada?.toString() || '')
          setCustoManutencao(attr.custo_manutencao?.toString() || '')
          setValor(produto.valor?.toString() || '')
          setValorMinimo(produto.valor_avista?.toString() || '')
          setValorPromocional(produto.promocao?.toString() || '')
          if (produto.promocao_sem_juros) {
            setTemPromoSemJuros(true)
            setValorSemJuros(produto.promocao_sem_juros.valor?.toString() || '')
            setParcelasSemJuros(produto.promocao_sem_juros.parcelas || 0)
          }
        }
      }

      const taxasAtivas = await getTaxasAtivas(supabase, profile.store_id)
      if (taxasAtivas) setJuros(taxasAtivas)

      setCarregando(false)
    }
    carregar()
  }, [produtoId])

  async function handleSalvar() {
    if (!modelo) { alert('Selecione o modelo'); return }
    if (!tipo) { alert('Selecione Novo ou Seminovo'); return }
    if (!gb) { alert('Selecione o armazenamento'); return }
    if (!cor) { alert('Selecione a cor'); return }
    if (ehSeminovo && !condicao) { alert('Selecione a condição'); return }
    if (status === 'disponivel' && !valor) { alert('Informe o valor de venda'); return }
    setSalvando(true)

    const atributos: Record<string, unknown> = {
      tipo, gb, cor, imei,
      ...(ehSeminovo && { condicao, bateria }),
      ...(cargo === 'gestor' && {
        custo_entrada: parseFloat(custoEntrada) || 0,
        custo_manutencao: parseFloat(custoManutencao) || 0,
        custo_total: custoTotal,
        origem,
        fornecedor,
        ...(origem === 'Troca' && { codigo_troca: codigoTroca }),
      }),
    }

    const promocaoSemJuros = temPromoSemJuros ? {
      valor: parseFloat(valorSemJuros),
      parcelas: parcelasSemJuros,
    } : null

    if (modoEditar) {
      const { error } = await supabase
        .from('products')
        .update({
          modelo,
          valor: parseFloat(valor) || 0,
          valor_avista: parseFloat(valorMinimo) || parseFloat(valor) || 0,
          promocao: valorPromocional ? parseFloat(valorPromocional) : null,
          promocao_sem_juros: promocaoSemJuros,
          observacoes,
          video_url: videoUrl.trim() || null,
          atributos,
          status,
          data_entrada: dataEntrada,
          updated_by: userId,
        })
        .eq('id', produtoId)

      if (error) { alert('Erro: ' + error.message); setSalvando(false); return }
    } else {
      const { error } = await supabase.from('products').insert({
        store_id: storeId,
        categoria: 'iphone',
        modelo,
        valor: parseFloat(valor),
        valor_avista: parseFloat(valorMinimo) || parseFloat(valor),
        promocao: valorPromocional || null,
        promocao_sem_juros: promocaoSemJuros,
        observacoes,
        video_url: videoUrl.trim() || null,
        atributos,
        status,
        data_entrada: dataEntrada,
        created_by: userId,
        updated_by: userId,
      })

      if (error) { alert('Erro: ' + error.message); setSalvando(false); return }
    }

    setSucesso(true)
    setTimeout(() => router.push('/dashboard/estoque'), 1500)
  }

  // ─── Loading / Sucesso ───────────────────────────────────────────────────────

  if (carregando) return <SpinnerPage />

  if (sucesso) return (
    <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: '#0a0a0a' }}>
      <div className="text-center">
        <div className="text-5xl mb-4">✅</div>
        <h2 className="text-xl font-bold text-white">
          {modoEditar ? 'Produto atualizado!' : 'Produto cadastrado!'}
        </h2>
        <p className="mt-2" style={{ color: '#666' }}>Redirecionando para o estoque...</p>
      </div>
    </div>
  )

  // ─── Render ──────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen pb-24" style={{ backgroundColor: '#0a0a0a' }}>

      <header className="border-b px-6 py-4 flex items-center gap-4 sticky top-0 z-10"
        style={{ backgroundColor: '#111', borderColor: '#1f1f1f' }}>
        <button onClick={() => router.push('/dashboard/estoque')}
          className="text-sm px-3 py-1.5 rounded-lg border transition-all"
          style={{ borderColor: '#2a2a2a', color: '#888' }}
          onMouseEnter={e => { e.currentTarget.style.borderColor = '#c8960c'; e.currentTarget.style.color = '#c8960c' }}
          onMouseLeave={e => { e.currentTarget.style.borderColor = '#2a2a2a'; e.currentTarget.style.color = '#888' }}>
          ← Voltar
        </button>
        <div>
          <h1 className="font-bold text-white">
            {modoEditar ? 'Editar Produto' : 'Novo Produto'}
          </h1>
          <p className="text-xs" style={{ color: '#666' }}>
            {modoEditar ? (modelo || 'Carregando...') : 'Cadastro rápido de estoque'}
          </p>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-6 py-8 flex flex-col gap-6">

        {/* DADOS DO IPHONE */}
        <div className="rounded-2xl border p-6" style={{ backgroundColor: '#111', borderColor: '#1f1f1f' }}>
          <h2 className="font-semibold text-white mb-4">Dados do iPhone</h2>

          <div>
            <label className="text-sm mb-2 block" style={{ color: '#aaa' }}>Modelo</label>
            <SeletorPilulas
              opcoes={MODELOS_IPHONE}
              valor={modelo}
              layout="grid"
              onSelecionar={m => { setModelo(m); setTipo(''); setCondicao(''); setGb(''); setCor('') }}
            />
          </div>

          {modelo && (
            <div className="mt-5">
              <p className="text-sm mb-2" style={{ color: '#aaa' }}>É novo ou seminovo?</p>
              <div className="flex gap-3">
                {['Novo', 'Seminovo'].map(t => (
                  <button key={t}
                    onClick={() => { setTipo(t); setCondicao(''); setGb(''); setCor('') }}
                    className="flex-1 py-3 rounded-xl text-sm font-bold border transition-all"
                    style={{
                      backgroundColor: tipo === t ? '#c8960c' : '#1a1a1a',
                      borderColor: tipo === t ? '#c8960c' : '#2a2a2a',
                      color: tipo === t ? '#000' : '#888',
                    }}>
                    {t}
                  </button>
                ))}
              </div>
            </div>
          )}

          {modelo && ehSeminovo && (
            <div className="mt-5">
              <p className="text-sm mb-2" style={{ color: '#aaa' }}>Condição</p>
              <div className="flex gap-2">
                {['Premium', 'Bom', 'Intermediário'].map(c => (
                  <button key={c} onClick={() => setCondicao(c)}
                    className="flex-1 py-2.5 rounded-xl text-sm font-medium border transition-all"
                    style={{
                      backgroundColor: condicao === c ? '#c8960c' : '#1a1a1a',
                      borderColor: condicao === c ? '#c8960c' : '#2a2a2a',
                      color: condicao === c ? '#000' : '#888',
                    }}>
                    {c}
                  </button>
                ))}
              </div>
            </div>
          )}

          {gbsDisponiveis.length > 0 && (
            <div className="mt-5">
              <p className="text-sm mb-2" style={{ color: '#aaa' }}>Armazenamento</p>
              <SeletorPilulas
                opcoes={gbsDisponiveis}
                valor={gb}
                onSelecionar={g => { setGb(g); setCor('') }}
              />
            </div>
          )}

          {gb && coresDisponiveis.length > 0 && (
            <div className="mt-5">
              <p className="text-sm mb-2" style={{ color: '#aaa' }}>Cor</p>
              <SeletorPilulas
                opcoes={coresDisponiveis}
                valor={cor}
                onSelecionar={setCor}
              />
            </div>
          )}

          {camposVisiveis && (
            <div className="mt-5 grid grid-cols-1 md:grid-cols-2 gap-4">
              {ehSeminovo && (
                <div>
                  <label className="text-sm mb-1 block" style={{ color: '#aaa' }}>Bateria %</label>
                  <input value={bateria} onChange={e => setBateria(e.target.value)}
                    className="w-full rounded-xl px-4 py-3 text-white border outline-none"
                    style={{ backgroundColor: '#1a1a1a', borderColor: '#2a2a2a' }}
                    placeholder="Ex: 92" />
                </div>
              )}
              <div className={ehSeminovo ? '' : 'md:col-span-2'}>
                <label className="text-sm mb-1 block" style={{ color: '#aaa' }}>IMEI</label>
                <input value={imei} onChange={e => setImei(e.target.value)}
                  className="w-full rounded-xl px-4 py-3 text-white border outline-none"
                  style={{ backgroundColor: '#1a1a1a', borderColor: '#2a2a2a' }}
                  placeholder="Ex: 359057869856861" />
              </div>
              <div className="md:col-span-2">
                <label className="text-sm mb-1 block" style={{ color: '#aaa' }}>Observações</label>
                <textarea value={observacoes} onChange={e => setObservacoes(e.target.value)}
                  className="w-full rounded-xl px-4 py-3 text-white border outline-none resize-none"
                  style={{ backgroundColor: '#1a1a1a', borderColor: '#2a2a2a' }}
                  rows={2} placeholder="Detalhes extras sobre o aparelho..." />
                <p className="text-xs mt-1" style={{ color: '#555' }}>Esta observação também aparece no catálogo.</p>
              </div>
              <div className="md:col-span-2">
                <label className="text-sm mb-1 block" style={{ color: '#aaa' }}>Vídeo do produto (link)</label>
                <input value={videoUrl} onChange={e => setVideoUrl(e.target.value)}
                  className="w-full rounded-xl px-4 py-3 text-white border outline-none"
                  style={{ backgroundColor: '#1a1a1a', borderColor: '#2a2a2a' }}
                  placeholder="Cole o link do vídeo (YouTube, Instagram, Drive...)" />
                <p className="text-xs mt-1" style={{ color: '#555' }}>
                  Vídeo real e único deste aparelho — aparece no catálogo enquanto estiver disponível.
                </p>
              </div>
            </div>
          )}
        </div>

        {/* ENTRADA — gestor */}
        {camposVisiveis && cargo === 'gestor' && (
          <div className="rounded-2xl border p-6" style={{ backgroundColor: '#111', borderColor: '#c8960c44' }}>
            <div className="flex items-center gap-2 mb-5">
              <span className="text-xs font-bold px-2 py-1 rounded-md"
                style={{ backgroundColor: '#c8960c22', color: '#c8960c' }}>GESTOR</span>
              <h2 className="font-semibold text-white">Entrada do Produto</h2>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="md:col-span-2">
                <label className="text-sm mb-1 block" style={{ color: '#aaa' }}>Data de Entrada</label>
                <input type="date" value={dataEntrada} onChange={e => setDataEntrada(e.target.value)}
                  className="w-full rounded-xl px-4 py-3 text-white border outline-none"
                  style={{ backgroundColor: '#1a1a1a', borderColor: '#2a2a2a', colorScheme: 'dark' }} />
                {diasNoEstoque(dataEntrada) > 0 && (
                  <p className="text-xs mt-1.5" style={{ color: '#888' }}>
                    {diasNoEstoque(dataEntrada)} dia(s) no estoque
                    {diasNoEstoque(dataEntrada) >= 30 && (
                      <span className="ml-2 font-bold" style={{ color: '#f87171' }}>⚠ Mais de 30 dias!</span>
                    )}
                  </p>
                )}
              </div>

              <div className="md:col-span-2">
                <p className="text-sm mb-2" style={{ color: '#aaa' }}>Status do Produto</p>
                <div className="flex flex-wrap gap-2">
                  {[
                    { value: 'disponivel', label: '🟢 Disponível', desc: 'Aparece para vendedores' },
                    { value: 'manutencao', label: '🔧 Manutenção', desc: 'Oculto para vendedores' },
                    { value: 'emprestado', label: '🔵 Emprestado', desc: 'Oculto para vendedores' },
                    { value: 'garantia', label: '🛡️ Garantia', desc: 'Oculto para vendedores' },
                    { value: 'devolucao', label: '🔄 Devolução', desc: 'Oculto para vendedores' },
                  ].map(s => (
                    <button key={s.value} onClick={() => setStatus(s.value)}
                      className="py-2 px-4 rounded-xl text-sm font-medium border transition-all text-left"
                      style={{
                        backgroundColor: status === s.value ? '#c8960c22' : '#1a1a1a',
                        borderColor: status === s.value ? '#c8960c' : '#2a2a2a',
                        color: status === s.value ? '#c8960c' : '#888',
                      }}>
                      {s.label}
                    </button>
                  ))}
                </div>
                {status !== 'disponivel' && (
                  <p className="text-xs mt-2" style={{ color: '#f87171' }}>
                    ⚠️ Este produto não aparecerá para os vendedores até o status ser alterado para Disponível.
                  </p>
                )}
              </div>

              <div className="md:col-span-2">
                <p className="text-sm mb-2" style={{ color: '#aaa' }}>Origem</p>
                <div className="flex gap-2">
                  {['Compra', 'Troca'].map(o => (
                    <button key={o} onClick={() => setOrigem(o)}
                      className="flex-1 py-2.5 rounded-xl text-sm font-medium border transition-all"
                      style={{
                        backgroundColor: origem === o ? '#c8960c' : '#1a1a1a',
                        borderColor: origem === o ? '#c8960c' : '#2a2a2a',
                        color: origem === o ? '#000' : '#888',
                      }}>
                      {o}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="text-sm mb-1 block" style={{ color: '#aaa' }}>
                  {origem === 'Troca' ? 'Cliente' : 'Fornecedor'}
                </label>
                <input value={fornecedor} onChange={e => setFornecedor(e.target.value)}
                  className="w-full rounded-xl px-4 py-3 text-white border outline-none"
                  style={{ backgroundColor: '#1a1a1a', borderColor: '#2a2a2a' }}
                  placeholder={origem === 'Troca' ? 'Nome do cliente' : 'Nome do fornecedor'} />
              </div>

              {origem === 'Troca' && (
                <div>
                  <label className="text-sm mb-1 block" style={{ color: '#aaa' }}>Código da Venda</label>
                  <input value={codigoTroca} onChange={e => setCodigoTroca(e.target.value)}
                    className="w-full rounded-xl px-4 py-3 text-white border outline-none"
                    style={{ backgroundColor: '#1a1a1a', borderColor: '#2a2a2a' }}
                    placeholder="Ex: VND-2025-001" />
                </div>
              )}

              <div>
                <label className="text-sm mb-1 block" style={{ color: '#aaa' }}>Custo de Entrada (R$)</label>
                <input type="number" value={custoEntrada} onChange={e => setCustoEntrada(e.target.value)}
                  className="w-full rounded-xl px-4 py-3 text-white border outline-none"
                  style={{ backgroundColor: '#1a1a1a', borderColor: '#2a2a2a' }}
                  placeholder="0,00" />
              </div>

              <div>
                <label className="text-sm mb-1 block" style={{ color: '#aaa' }}>Custo Manutenção (R$)</label>
                <input type="number" value={custoManutencao} onChange={e => setCustoManutencao(e.target.value)}
                  className="w-full rounded-xl px-4 py-3 text-white border outline-none"
                  style={{ backgroundColor: '#1a1a1a', borderColor: '#2a2a2a' }}
                  placeholder="0,00" />
              </div>

              {custoTotal > 0 && (
                <div className="md:col-span-2 rounded-xl p-4 flex items-center justify-between"
                  style={{ backgroundColor: '#1a1a1a' }}>
                  <p className="text-sm" style={{ color: '#888' }}>Custo Total</p>
                  <p className="text-2xl font-bold" style={{ color: '#c8960c' }}>
                    R$ {custoTotal.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                  </p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* PRECIFICAÇÃO — gestor, só quando disponível */}
        {camposVisiveis && cargo === 'gestor' && status === 'disponivel' && (
          <div className="rounded-2xl border p-6" style={{ backgroundColor: '#111', borderColor: '#c8960c44' }}>
            <div className="flex items-center gap-2 mb-5">
              <span className="text-xs font-bold px-2 py-1 rounded-md"
                style={{ backgroundColor: '#c8960c22', color: '#c8960c' }}>GESTOR</span>
              <h2 className="font-semibold text-white">Precificação</h2>
            </div>

            {custoTotal > 0 && (
              <div className="rounded-xl p-4 mb-5 flex items-center justify-between"
                style={{ backgroundColor: '#1a1a1a', border: '1px solid #2a2a2a' }}>
                <div>
                  <p className="text-sm text-white font-medium">Preço mínimo com Nota Fiscal</p>
                  <p className="text-xs mt-0.5" style={{ color: '#888' }}>
                    Para não perder dinheiro vendendo com NF (custo ÷ 0,92)
                  </p>
                </div>
                <p className="text-xl font-bold" style={{ color: '#f87171' }}>
                  R$ {(custoTotal / 0.92).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                </p>
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="text-sm mb-1 block" style={{ color: '#aaa' }}>Valor de Venda (R$)</label>
                <input type="number" value={valor} onChange={e => setValor(e.target.value)}
                  className="w-full rounded-xl px-4 py-3 text-white border outline-none"
                  style={{ backgroundColor: '#1a1a1a', borderColor: '#2a2a2a' }}
                  placeholder="Ex: 2300" />
                {valor && custoTotal > 0 && (
                  <div className="mt-1.5 flex flex-col gap-0.5">
                    <p className="text-xs" style={{ color: '#4ade80' }}>
                      Lucro s/ NF: R$ {calcLucro(parseFloat(valor))!.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                    </p>
                    <p className="text-xs" style={{ color: '#fb923c' }}>
                      Lucro c/ NF: R$ {calcLucroComNF(parseFloat(valor))!.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                    </p>
                  </div>
                )}
              </div>

              <div>
                <label className="text-sm mb-1 block" style={{ color: '#aaa' }}>Máx. Desconto à Vista (R$)</label>
                <input type="number" value={valorMinimo} onChange={e => setValorMinimo(e.target.value)}
                  className="w-full rounded-xl px-4 py-3 text-white border outline-none"
                  style={{ backgroundColor: '#1a1a1a', borderColor: '#2a2a2a' }}
                  placeholder="Ex: 2100" />
                {valorMinimo && custoTotal > 0 && (
                  <div className="mt-1.5 flex flex-col gap-0.5">
                    <p className="text-xs" style={{ color: '#4ade80' }}>
                      Lucro s/ NF: R$ {calcLucro(parseFloat(valorMinimo))!.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                    </p>
                    <p className="text-xs" style={{ color: '#fb923c' }}>
                      Lucro c/ NF: R$ {calcLucroComNF(parseFloat(valorMinimo))!.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                    </p>
                  </div>
                )}
              </div>

              <div>
                <label className="text-sm mb-1 block" style={{ color: '#aaa' }}>Valor Promocional (R$)</label>
                <input type="number" value={valorPromocional} onChange={e => setValorPromocional(e.target.value)}
                  className="w-full rounded-xl px-4 py-3 text-white border outline-none"
                  style={{ backgroundColor: '#1a1a1a', borderColor: '#2a2a2a' }}
                  placeholder="Opcional" />
                {valorPromocional && custoTotal > 0 && (
                  <div className="mt-1.5 flex flex-col gap-0.5">
                    <p className="text-xs" style={{ color: '#4ade80' }}>
                      Lucro s/ NF: R$ {calcLucro(parseFloat(valorPromocional))!.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                    </p>
                    <p className="text-xs" style={{ color: '#fb923c' }}>
                      Lucro c/ NF: R$ {calcLucroComNF(parseFloat(valorPromocional))!.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                    </p>
                  </div>
                )}
              </div>
            </div>

            {/* Promoção sem juros */}
            <div className="mt-5 rounded-xl p-4 border" style={{ backgroundColor: '#141414', borderColor: '#2a2a2a' }}>
              <div className="flex items-center justify-between mb-2">
                <div>
                  <p className="text-sm font-medium text-white">Promoção Sem Juros</p>
                  <p className="text-xs mt-0.5" style={{ color: '#666' }}>A empresa absorve a taxa real da maquininha</p>
                </div>
                <button onClick={() => setTemPromoSemJuros(!temPromoSemJuros)}
                  className="w-12 h-6 rounded-full transition-all relative flex-shrink-0"
                  style={{ backgroundColor: temPromoSemJuros ? '#c8960c' : '#2a2a2a' }}>
                  <div className="w-5 h-5 bg-white rounded-full absolute top-0.5 transition-all"
                    style={{ left: temPromoSemJuros ? '26px' : '2px' }} />
                </button>
              </div>

              {temPromoSemJuros && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
                  <div>
                    <label className="text-sm mb-1 block" style={{ color: '#aaa' }}>Valor Total (R$)</label>
                    <input type="number" value={valorSemJuros} onChange={e => setValorSemJuros(e.target.value)}
                      className="w-full rounded-xl px-4 py-3 text-white border outline-none"
                      style={{ backgroundColor: '#1a1a1a', borderColor: '#2a2a2a' }}
                      placeholder="Ex: 2160" />
                  </div>
                  <div>
                    <label className="text-sm mb-1 block" style={{ color: '#aaa' }}>Número de Parcelas</label>
                    <div className="flex flex-wrap gap-2">
                      {[8, 10, 12, 18].map(p => (
                        <button key={p} onClick={() => setParcelasSemJuros(p)}
                          className="py-2 px-4 rounded-xl text-sm font-medium border transition-all"
                          style={{
                            backgroundColor: parcelasSemJuros === p ? '#c8960c' : '#1a1a1a',
                            borderColor: parcelasSemJuros === p ? '#c8960c' : '#2a2a2a',
                            color: parcelasSemJuros === p ? '#000' : '#888',
                          }}>
                          {p}x
                        </button>
                      ))}
                    </div>
                  </div>

                  {valorSemJuros && parcelasSemJuros > 0 && (
                    <div className="md:col-span-2 flex flex-col gap-3">
                      <div className="rounded-xl p-4 flex items-center justify-between" style={{ backgroundColor: '#1a1a1a' }}>
                        <div>
                          <p className="text-xs mb-1" style={{ color: '#666' }}>Como vai aparecer para o vendedor</p>
                          <p className="text-lg font-bold text-white">
                            {parcelasSemJuros}x de R$ {(parseFloat(valorSemJuros) / parcelasSemJuros).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                          </p>
                        </div>
                        <span className="text-xs font-bold px-3 py-1.5 rounded-lg"
                          style={{ backgroundColor: '#4ade8022', color: '#4ade80', border: '1px solid #4ade8044' }}>
                          SEM JUROS
                        </span>
                      </div>
                      {custoTotal > 0 && (() => {
                        const jurosDaParcela = juros.find(j => j.parcelas === parcelasSemJuros)
                        const taxaReal = jurosDaParcela?.taxa_operadora ?? null
                        const taxa = taxaReal ?? (TAXA_REAL_FALLBACK[parcelasSemJuros] ?? 14)
                        const recebido = parseFloat(valorSemJuros) * (1 - taxa / 100)
                        const lucroSemNF = recebido - custoTotal
                        const lucroComNF = recebido * 0.92 - custoTotal
                        return (
                          <div className="rounded-xl p-4" style={{ backgroundColor: '#1a1a1a' }}>
                            <p className="text-sm mb-3" style={{ color: '#888' }}>Lucro líquido (empresa absorve a taxa)</p>
                            <div className="flex items-center justify-between">
                              <span className="text-xs" style={{ color: '#555' }}>s/ NF</span>
                              <span className="text-lg font-bold"
                                style={{ color: lucroSemNF < 0 ? '#f87171' : '#4ade80' }}>
                                R$ {lucroSemNF.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                              </span>
                            </div>
                            <div className="flex items-center justify-between mt-1.5">
                              <span className="text-xs" style={{ color: '#555' }}>c/ NF</span>
                              <span className="text-sm font-bold"
                                style={{ color: lucroComNF < 0 ? '#f87171' : '#fb923c' }}>
                                R$ {lucroComNF.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                              </span>
                            </div>
                          </div>
                        )
                      })()}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Tabela de parcelamento com lucro líquido */}
            {parseFloat(valor) > 0 && juros.length > 0 && (
              <div className="mt-6">
                <p className="text-sm font-medium text-white mb-3">Tabela de Parcelamento</p>
                <div className="rounded-xl overflow-hidden border" style={{ borderColor: '#2a2a2a' }}>
                  <table className="w-full text-sm">
                    <thead>
                      <tr style={{ backgroundColor: '#1a1a1a' }}>
                        <th className="px-4 py-3 text-left font-medium" style={{ color: '#666' }}>Parcelas</th>
                        <th className="px-4 py-3 text-left font-medium" style={{ color: '#666' }}>Juros</th>
                        <th className="px-4 py-3 text-left font-medium" style={{ color: '#666' }}>Valor/Parcela</th>
                        <th className="px-4 py-3 text-left font-medium" style={{ color: '#666' }}>Total</th>
                        <th className="px-4 py-3 text-left font-medium" style={{ color: '#666' }}>Lucro Líquido</th>
                      </tr>
                    </thead>
                    <tbody>
                      {juros.map((j, i) => {
                        const total = calcParcelado(parseFloat(valor), j.taxa_comercial)
                        const parcela = total / j.parcelas
                        const lucroLiquido = calcLucroLiquidoParcelado(parseFloat(valor), j)
                        return (
                          <tr key={j.parcelas} style={{ backgroundColor: i % 2 === 0 ? '#111' : '#141414' }}>
                            <td className="px-4 py-2.5 font-medium text-white">{j.parcelas}x</td>
                            <td className="px-4 py-2.5" style={{ color: '#888' }}>{j.taxa_comercial}%</td>
                            <td className="px-4 py-2.5 font-semibold" style={{ color: '#c8960c' }}>
                              R$ {parcela.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                            </td>
                            <td className="px-4 py-2.5" style={{ color: '#666' }}>
                              R$ {total.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                            </td>
                            <td className="px-4 py-2.5 font-semibold"
                              style={{ color: lucroLiquido !== null && lucroLiquido < 0 ? '#f87171' : '#4ade80' }}>
                              {lucroLiquido !== null ? `R$ ${lucroLiquido.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}` : '—'}
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}

        {/* BOTÃO SALVAR */}
        {camposVisiveis && (status !== 'disponivel' || valor) && (
          <button onClick={handleSalvar} disabled={salvando}
            className="w-full py-4 rounded-2xl font-bold text-black text-lg transition-all disabled:opacity-50"
            style={{ backgroundColor: '#c8960c' }}
            onMouseEnter={e => e.currentTarget.style.backgroundColor = '#e0a80e'}
            onMouseLeave={e => e.currentTarget.style.backgroundColor = '#c8960c'}>
            {salvando ? 'Salvando...' : modoEditar ? '✓ Salvar Alterações' : '✓ Cadastrar Produto'}
          </button>
        )}

      </main>
    </div>
  )
}
