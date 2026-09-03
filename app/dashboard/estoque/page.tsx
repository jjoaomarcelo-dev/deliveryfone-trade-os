'use client'

import { useEffect, useState, useRef, useMemo } from 'react'
import { createPortal } from 'react-dom'
import { createClient } from '../../lib/supabase'
import { useRouter } from 'next/navigation'
import { dataHoje, fmt, parseBRL, diasNoEstoque } from '../../lib/utils'
import { type Juros, TAXA_REAL_FALLBACK } from '../../lib/financeiro'
import { getTaxasAtivas } from '../../lib/taxas'
import { useToast, ToastContainer } from '../../components/Toast'
import { SpinnerPage } from '../../components/Spinner'

const STATUS_CONFIG: Record<string, { label: string; cor: string; bg: string; emoji: string }> = {
  disponivel: { label: 'Disponível',  cor: '#4ade80', bg: '#4ade8018', emoji: '🟢' },
  reservado:  { label: 'Reservado',   cor: '#f59e0b', bg: '#f59e0b18', emoji: '🔒' },
  manutencao: { label: 'Manutenção',  cor: '#fb923c', bg: '#fb923c18', emoji: '🔧' },
  emprestado: { label: 'Emprestado',  cor: '#60a5fa', bg: '#60a5fa18', emoji: '🔵' },
  garantia:   { label: 'Garantia',    cor: '#a78bfa', bg: '#a78bfa18', emoji: '🛡️' },
  devolucao:  { label: 'Devolução',   cor: '#f87171', bg: '#f8717118', emoji: '🔄' },
  vendido:    { label: 'Aguard. confirmação', cor: '#fb923c', bg: '#fb923c18', emoji: '⏳' },
  confirmado: { label: 'Confirmado',  cor: '#888',    bg: '#88888812', emoji: '📦' },
}

const CATEGORIA_LABELS: Record<string, string> = {
  iphone:     '📱 iPhone',
  samsung:    '📱 Samsung',
  motorola:   '📱 Motorola',
  xiaomi:     '📱 Xiaomi',
  ipad:       '📟 iPad',
  tablet:     '📟 Tablet',
  smartwatch: '⌚ Smartwatch',
  acessorio:  '🎧 Acessório',
}


interface Produto {
  id: string
  categoria: string
  modelo: string
  valor: number
  valor_avista: number | null
  promocao: number | null
  promocao_sem_juros: { valor: number; parcelas: number } | null
  atributos: {
    tipo?: string
    gb?: string
    cor?: string
    imei?: string
    condicao?: string
    bateria?: string
    custo_total?: number
    origem?: string
    fornecedor?: string
    codigo_troca?: string
  }
  status: string
  data_entrada: string | null
  data_venda: string | null
  vendido_por: string | null
  vendido_por_nome: string | null
  vendido_por_id: string | null
  reservado_por: string | null
  reserva_observacao: string | null
  reserva_cliente: string | null
  data_reserva: string | null
  valor_venda: number | null
  forma_pagamento: string | null
  parcelas_venda: number | null
  taxa_aplicada: number | null
  valor_liquido: number | null
  valor_entrada: number | null
  cliente_nome: string | null
  custo_snapshot: number | null
  margem_bruta: number | null
  desconto_aplicado: number | null
  valor_normal_snapshot: number | null
  taxa_comercial_snap: number | null
  taxa_operadora_snap: number | null
  confirmado_por: string | null
  data_confirmacao: string | null
  motivo_devolucao: string | null
  observacoes: string | null
}

interface ProductMessage {
  id: string
  produto_id: string
  store_id: string
  autor_id: string | null
  autor_nome: string
  autor_cargo: string
  mensagem: string
  tipo: string
  metadata: Record<string, unknown> | null
  created_at: string
}

interface DiscountRequest {
  id: string
  produto_id: string
  vendedor_id: string | null
  vendedor_nome: string
  valor_solicitado: number
  valor_original: number
  motivo: string | null
  status: string // pendente | aprovado | negado | contra_proposta
  valor_aprovado: number | null
  resposta_gestor: string | null
  gestor_nome: string | null
  created_at: string
  resolved_at: string | null
}

interface Notificacao {
  id: string
  produto_id: string
  tipo: 'reserva' | 'venda_pendente' | 'venda_confirmada' | 'venda_devolvida' | 'desconto_solicitado' | 'desconto_respondido' | 'mensagem_chat'
  titulo: string
  mensagem: string | null
  lida: boolean
  destinatario_id: string | null
  autor_id?: string | null
  created_at: string
}

interface Vendedor {
  id: string
  nome: string
}

interface Simulacao {
  id: string
  produto_id: string
  cliente_nome: string
  valor_a_pagar: number | null
  forma_pagamento: string | null
  parcelas: number | null
  troca_valor: number | null
}


export default function Estoque() {
  const {toasts, remover: removerToast, erro: toastErro, aviso: toastAviso } = useToast()
  const [cargo, setCargo] = useState('')
  const [userId, setUserId] = useState('')
  const [nomeUsuario, setNomeUsuario] = useState('')
  const [storeId, setStoreId] = useState('')
  const [notificacoes, setNotificacoes] = useState<Notificacao[]>([])
  const [painelNotif, setPainelNotif] = useState(false)
  const sinoRef = useRef<HTMLDivElement>(null)
  const [carregando, setCarregando] = useState(true)
  const [erroLoad, setErroLoad] = useState<string | null>(null)
  const [produtos, setProdutos] = useState<Produto[]>([])
  const [juros, setJuros] = useState<Juros[]>([])
  const [vendedores, setVendedores] = useState<Vendedor[]>([])

  // Filtros
  const [filtroStatus,    setFiltroStatus]    = useState('todos')
  const [filtroCategoria, setFiltroCategoria] = useState('todos')
  const [filtroTipo,      setFiltroTipo]      = useState('todos')
  const [busca,           setBusca]           = useState('')

  // UI
  const [dropdownStatus,    setDropdownStatus]    = useState<string | null>(null)
  const [cardExpandido,     setCardExpandido]     = useState<string | null>(null)
  // simulações do vendedor logado, indexadas por produto_id
  const [simulacoes, setSimulacoes] = useState<Record<string, Simulacao>>({})


  // Modal: marcar vendido (gestor direto → confirmado)
  const [modalVenda,          setModalVenda]          = useState<string | null>(null)
  const [vendedorSelecionado, setVendedorSelecionado] = useState('')
  const [dataVenda,           setDataVenda]           = useState(dataHoje())
  const [salvandoVenda,       setSalvandoVenda]       = useState(false)

  // Modal: reserva (vendedor)
  const [modalReserva,    setModalReserva]    = useState<string | null>(null)
  const [reservaObs,      setReservaObs]      = useState('')
  const [reservaSinal,    setReservaSinal]    = useState('')
  const [salvandoReserva, setSalvandoReserva] = useState(false)

  // Modal: confirmar venda (vendedor)
  type FormaPagamento = 'a_vista' | 'parcelado' | 'boleto' | 'misto'
  const [modalVendaVendedor,    setModalVendaVendedor]    = useState<string | null>(null)
  const [valorVendaVendedor,    setValorVendaVendedor]    = useState('')   // gross na maquininha (ou valor à vista)
  const [valorEntradaVendedor,  setValorEntradaVendedor]  = useState('')   // entrada à vista (misto)
  const [valorBaseVendedor,     setValorBaseVendedor]     = useState('')   // preço base (antes de juros) — salvo ao tocar chip
  const [descontoVendedor,      setDescontoVendedor]      = useState('')   // desconto em R$
  const [formaPagamento,        setFormaPagamento]        = useState<FormaPagamento>('a_vista')
  const [parcelasVenda,         setParcelasVenda]         = useState<number>(2)
  const [salvandoVendaVendedor, setSalvandoVendaVendedor] = useState(false)

  function calcGrossFromBase(base: number, desconto: number, forma: FormaPagamento, parcelas: number) {
    const baseEfetiva = Math.max(0, base - desconto)
    if (forma === 'parcelado' || forma === 'misto') {
      const jP2 = juros.find(j => j.parcelas === parcelas)
      // usa taxa_comercial (markup cobrado do cliente) — igual ao que a tabela de parcelas exibe
      const markup = jP2 ? jP2.taxa_comercial : 0
      if (markup > 0) return parseFloat((baseEfetiva * (1 + markup / 100)).toFixed(2))
    }
    return baseEfetiva
  }

  function resetModalVenda() {
    setModalVendaVendedor(null)
    setValorVendaVendedor('')
    setValorEntradaVendedor('')
    setValorBaseVendedor('')
    setDescontoVendedor('')
    setFormaPagamento('a_vista')
    setParcelasVenda(2)
  }

  // Modal: confirmar saída (gestor confirma vendido pendente → confirmado)
  const [modalConfirmar,       setModalConfirmar]       = useState<string | null>(null)
  const [valorVendaConfirm,    setValorVendaConfirm]    = useState('')
  const [formaConfirm,         setFormaConfirm]         = useState<FormaPagamento>('a_vista')
  const [parcelasConfirm,      setParcelasConfirm]      = useState<number>(2)
  const [entradaConfirm,       setEntradaConfirm]       = useState('')
  const [salvandoConfirmar,    setSalvandoConfirmar]    = useState(false)
  const [showDevolucao,        setShowDevolucao]        = useState(false)
  const [motivoDevolucao,      setMotivoDevolucao]      = useState('')
  const [devolvendo,           setDevolvendo]           = useState(false)

  // Chat por produto
  const [modalChat,          setModalChat]          = useState<string | null>(null) // produto_id
  const [mensagensChat,      setMensagensChat]      = useState<ProductMessage[]>([])
  const [novaMensagem,       setNovaMensagem]       = useState('')
  const [enviandoMensagem,   setEnviandoMensagem]   = useState(false)
  const [carregandoChat,     setCarregandoChat]     = useState(false)
  const [contadoresChat,     setContadoresChat]     = useState<Record<string, number>>({})

  // Aprovação de desconto
  const [pedidosPendentes,    setPedidosPendentes]    = useState<DiscountRequest[]>([])
  const [modalSolicitarDesc,  setModalSolicitarDesc]  = useState(false)
  const [valorSolicitado,     setValorSolicitado]     = useState('')
  const [motivoDesconto,      setMotivoDesconto]      = useState('')
  const [solicitandoDesc,     setSolicitandoDesc]     = useState(false)
  const [respondendoId,       setRespondendoId]       = useState<string | null>(null)
  const [acaoResposta,        setAcaoResposta]        = useState<'aprovado'|'negado'|'contra_proposta'|null>(null)
  const [contraPropostaValor, setContraPropostaValor] = useState('')
  const [respostaTexto,       setRespostaTexto]       = useState('')
  const [salvandoResposta,    setSalvandoResposta]    = useState(false)

  // Modal: editar preços (legado — mantido para compatibilidade)
  const [modalPrecos,    setModalPrecos]    = useState<Produto | null>(null)
  const [editValor,      setEditValor]      = useState('')
  const [editValorAvista, setEditValorAvista] = useState('')
  const [editPromocao,   setEditPromocao]   = useState('')
  const [salvandoPrecos, setSalvandoPrecos] = useState(false)

  // Edição inline de preços
  type CampoPreco = 'valor' | 'valor_avista' | 'promocao'
  const [inlineEdit, setInlineEdit] = useState<{ produtoId: string; campo: CampoPreco; valor: string } | null>(null)
  const [salvandoInline, setSalvandoInline] = useState(false)

  function iniciarInline(produtoId: string, campo: CampoPreco, valorAtual: string) {
    setInlineEdit({ produtoId, campo, valor: valorAtual })
  }

  async function salvarInline() {
    if (!inlineEdit || salvandoInline) return
    const { produtoId, campo, valor } = inlineEdit
    const num = parseBRL(valor)
    if (isNaN(num)) { setInlineEdit(null); return }

    setSalvandoInline(true)
    const produto = produtos.find(p => p.id === produtoId)
    if (!produto) { setSalvandoInline(false); return }

    const updateData: Record<string, unknown> = { [campo]: num }

    const { error } = await supabase.from('products').update(updateData).eq('id', produtoId)
    if (error) { toastErro('Erro ao salvar preço: ' + error.message); setSalvandoInline(false); return }
    setProdutos(prev => prev.map(p => p.id === produtoId ? { ...p, ...updateData } : p))
    setSalvandoInline(false)
    setInlineEdit(null)
  }

  function cancelarInline() { setInlineEdit(null) }

  async function removerCampo(produtoId: string, campo: 'promocao' | 'promocao_sem_juros') {
    const { error } = await supabase.from('products').update({ [campo]: null }).eq('id', produtoId)
    if (error) { toastErro('Erro ao remover campo: ' + error.message); return }
    setProdutos(prev => prev.map(p => p.id === produtoId ? { ...p, [campo]: null } : p))
  }

  async function cancelarSimulacao(produtoId: string) {
    const sim = simulacoes[produtoId]
    if (!sim) return
    const { error } = await supabase.from('simulacoes').delete().eq('id', sim.id)
    if (error) { toastErro('Erro ao cancelar simulação: ' + error.message); return }
    setSimulacoes(prev => {
      const novo = { ...prev }
      delete novo[produtoId]
      return novo
    })
  }

  function valorInlineAtual(produtoId: string, campo: CampoPreco, fallback: number) {
    if (inlineEdit?.produtoId === produtoId && inlineEdit.campo === campo) {
      const n = parseBRL(inlineEdit.valor)
      return isNaN(n) ? fallback : n
    }
    return fallback
  }

  // Modal: excluir
  const [modalExcluir, setModalExcluir] = useState<Produto | null>(null)
  const [excluindo,    setExcluindo]    = useState(false)

  const router = useRouter()
  const [supabase] = useState(createClient)

  useEffect(() => {
    let cancelado = false
    let chNotif: ReturnType<typeof supabase.channel> | null = null
    let chChat: ReturnType<typeof supabase.channel> | null = null
    let chProdutos: ReturnType<typeof supabase.channel> | null = null

    async function carregar() {
      setErroLoad(null)
      try {
      // 1. Auth + perfil em paralelo
      const [{ data: { user } }, ] = await Promise.all([
        supabase.auth.getUser(),
      ])
      if (!user || cancelado) { if (!user) router.push('/login'); return }
      setUserId(user.id)

      const { data: profile } = await supabase
        .from('profiles')
        .select('cargo, store_id, nome')
        .eq('id', user.id)
        .single()

      if (!profile || cancelado) { if (!profile) router.push('/login'); return }
      setCargo(profile.cargo)
      setNomeUsuario(profile.nome ?? '')
      setStoreId(profile.store_id ?? '')

      // 2. Todas as queries de dados em paralelo
      let produtosQuery = supabase
        .from('products')
        .select('*')
        .eq('store_id', profile.store_id)
        .order('data_entrada', { ascending: false })
      if (profile.cargo === 'vendedor') {
        produtosQuery = produtosQuery.neq('status', 'confirmado')
      }

      if (profile.cargo === 'gestor') {
        const [prodRes, taxasRes, vendRes, notifRes] = await Promise.all([
          produtosQuery,
          getTaxasAtivas(supabase, profile.store_id),
          supabase.from('profiles').select('id, nome').eq('store_id', profile.store_id).eq('cargo', 'vendedor'),
          supabase.from('notifications').select('*').eq('store_id', profile.store_id).order('created_at', { ascending: false }).limit(50),
        ])
        if (cancelado) return
        if (prodRes.data)  setProdutos(prodRes.data as Produto[])
        if (taxasRes)      setJuros(taxasRes)
        if (vendRes.data)  setVendedores(vendRes.data)
        if (notifRes.data) setNotificacoes(notifRes.data as Notificacao[])
      } else {
        const [prodRes, taxasRes, notifRes] = await Promise.all([
          produtosQuery,
          getTaxasAtivas(supabase, profile.store_id),
          supabase.from('notifications').select('*').eq('store_id', profile.store_id).order('created_at', { ascending: false }).limit(50),
        ])
        if (cancelado) return
        if (prodRes.data)   setProdutos(prodRes.data as Produto[])
        if (taxasRes)       setJuros(taxasRes)
        if (notifRes.data)  setNotificacoes(notifRes.data as Notificacao[])
      }

      if (cancelado) return

      // Simulações do usuário logado (RLS já filtra por vendedor)
      const { data: simData } = await supabase
        .from('simulacoes')
        .select('id, produto_id, cliente_nome, valor_a_pagar, forma_pagamento, parcelas, troca_valor')
        .eq('store_id', profile.store_id)
      if (simData && !cancelado) {
        const map: Record<string, Simulacao> = {}
        ;(simData as Simulacao[]).forEach(s => { map[s.produto_id] = s })
        setSimulacoes(map)
      }

      // Realtime: notificações (todos — gestor e vendedor)
      chNotif = supabase.channel('notif-rt')
        .on('postgres_changes', {
          event: 'INSERT', schema: 'public', table: 'notifications',
          filter: `store_id=eq.${profile.store_id}`,
        }, (payload) => {
          setNotificacoes(prev => [payload.new as Notificacao, ...prev])
        })
        .subscribe()

      // Realtime: chat + discount_requests (todos)
      chChat = supabase.channel('chat-rt')
        .on('postgres_changes', {
          event: 'INSERT', schema: 'public', table: 'product_messages',
          filter: `store_id=eq.${profile.store_id}`,
        }, (payload) => {
          const nova = payload.new as ProductMessage
          setMensagensChat(prev => {
            // Mensagem não é do produto aberto → só atualiza contador
            if (prev.length === 0 || (prev[0] && prev[0].produto_id !== nova.produto_id)) {
              setContadoresChat(c => ({ ...c, [nova.produto_id]: (c[nova.produto_id] ?? 0) + 1 }))
              return prev
            }
            // Deduplicar: ignora se já existe pelo id
            if (prev.some(m => m.id === nova.id)) return prev
            return [...prev, nova]
          })
        })
        .on('postgres_changes', {
          event: 'INSERT', schema: 'public', table: 'discount_requests',
          filter: `store_id=eq.${profile.store_id}`,
        }, (payload) => {
          const req = payload.new as DiscountRequest
          setPedidosPendentes(prev => {
            if (prev.some(p => p.id === req.id)) return prev
            return [...prev, req]
          })
        })
        .on('postgres_changes', {
          event: 'UPDATE', schema: 'public', table: 'discount_requests',
          filter: `store_id=eq.${profile.store_id}`,
        }, (payload) => {
          const req = payload.new as DiscountRequest
          setPedidosPendentes(prev => prev.filter(p => p.id !== req.id))
        })
        .subscribe()

      // Realtime: produtos (todos)
      chProdutos = supabase.channel('produtos-rt')
        .on('postgres_changes', {
          event: 'UPDATE', schema: 'public', table: 'products',
          filter: `store_id=eq.${profile.store_id}`,
        }, (payload) => {
          const updated = payload.new as Produto
          setProdutos(prev => {
            if (profile.cargo === 'vendedor' && updated.status === 'confirmado') {
              return prev.filter(p => p.id !== updated.id)
            }
            const existe = prev.some(p => p.id === updated.id)
            return existe ? prev.map(p => p.id === updated.id ? { ...p, ...updated } : p) : prev
          })
        })
        .on('postgres_changes', {
          event: 'INSERT', schema: 'public', table: 'products',
          filter: `store_id=eq.${profile.store_id}`,
        }, (payload) => {
          const novo = payload.new as Produto
          if (profile.cargo === 'vendedor' && novo.status === 'confirmado') return
          setProdutos(prev => prev.some(p => p.id === novo.id) ? prev : [novo, ...prev])
        })
        .subscribe()

      if (!cancelado) setCarregando(false)
      } catch (err: unknown) {
        if (!cancelado) {
          setCarregando(false)
          setErroLoad(err instanceof Error ? err.message : 'Erro inesperado ao carregar dados.')
        }
      }
    }

    carregar()

    return () => {
      cancelado = true
      if (chNotif)   supabase.removeChannel(chNotif)
      if (chChat)    supabase.removeChannel(chChat)
      if (chProdutos) supabase.removeChannel(chProdutos)
    }
  }, [])

  async function alterarStatus(produtoId: string, novoStatus: string) {
    const { error } = await supabase
      .from('products')
      .update({ status: novoStatus, updated_by: userId })
      .eq('id', produtoId)
    if (error) {
      toastErro('Erro ao alterar status: ' + error.message)
    } else {
      setProdutos(prev => prev.map(p => p.id === produtoId ? { ...p, status: novoStatus } : p))
    }
    setDropdownStatus(null)
  }

  // Gestor registra venda direta → confirmado imediatamente
  async function confirmarVenda() {
    if (!modalVenda) return
    setSalvandoVenda(true)
    const { error } = await supabase
      .from('products')
      .update({
        status: 'confirmado',
        data_venda: dataVenda,
        vendido_por: vendedorSelecionado || userId,
        vendido_por_nome: vendedores.find(v => v.id === vendedorSelecionado)?.nome || nomeUsuario,
        vendido_por_id: vendedorSelecionado || userId,
        updated_by: userId,
      })
      .eq('id', modalVenda)
    if (error) { toastErro('Erro ao confirmar venda: ' + error.message); setSalvandoVenda(false); return }
    setProdutos(prev => prev.map(p =>
      p.id === modalVenda
        ? { ...p, status: 'confirmado', data_venda: dataVenda, vendido_por: vendedorSelecionado || userId,
            vendido_por_nome: vendedores.find(v => v.id === vendedorSelecionado)?.nome || nomeUsuario }
        : p
    ))
    setSalvandoVenda(false)
    setModalVenda(null)
    setVendedorSelecionado('')
    setDataVenda(dataHoje())
  }

  // Vendedor reserva produto
  async function salvarReserva() {
    if (!modalReserva || !nomeUsuario) return
    setSalvandoReserva(true)
    const produto = produtos.find(p => p.id === modalReserva)
    const { error, data: reservaData } = await supabase
      .from('products')
      .update({
        status: 'reservado',
        reservado_por: nomeUsuario,
        reserva_observacao: reservaObs || null,
        reserva_sinal: parseBRL(reservaSinal) || null,
        data_reserva: dataHoje(),
        updated_by: userId,
      })
      .eq('id', modalReserva)
      .eq('status', 'disponivel')  // lock otimista: só reserva se ainda disponível
      .select('id')
    if (error) {
      toastErro('Erro ao reservar: ' + error.message)
      setSalvandoReserva(false)
      return
    }
    if (!reservaData || reservaData.length === 0) {
      toastAviso('Produto não está mais disponível. Atualize a página.')
      setSalvandoReserva(false)
      setModalReserva(null)
      return
    }
    setProdutos(prev => prev.map(p =>
      p.id === modalReserva
        ? { ...p, status: 'reservado', reservado_por: nomeUsuario, reserva_observacao: reservaObs || null, data_reserva: dataHoje() }
        : p
    ))
    const sinalInfo = reservaSinal ? ` · Sinal: R$ ${reservaSinal}` : ''
    await supabase.from('notifications').insert({
      store_id: storeId,
      produto_id: modalReserva,
      tipo: 'reserva',
      titulo: `🔒 Produto reservado por ${nomeUsuario}`,
      mensagem: produto ? `${produto.modelo} · ${produto.atributos?.gb ?? ''} · ${produto.atributos?.cor ?? ''}${sinalInfo}${reservaObs ? ` — ${reservaObs}` : ''}` : null,
      autor_id: userId,
    })
    setModalReserva(null)
    setReservaObs('')
    setReservaSinal('')
    setSalvandoReserva(false)
  }

  // Vendedor cancela reserva → volta pra disponível
  async function cancelarReserva(produtoId: string) {
    const produto = produtos.find(p => p.id === produtoId)
    const { error } = await supabase.from('products').update({
      status: 'disponivel', reservado_por: null,
      reserva_observacao: null, reserva_sinal: null, data_reserva: null, updated_by: userId,
    }).eq('id', produtoId)
    if (error) { toastErro('Erro ao cancelar reserva: ' + error.message); return }
    setProdutos(prev => prev.map(p =>
      p.id === produtoId
        ? { ...p, status: 'disponivel', reservado_por: null, reserva_observacao: null, data_reserva: null }
        : p
    ))
    await supabase.from('notifications').insert({
      store_id: storeId,
      produto_id: produtoId,
      tipo: 'reserva',
      titulo: `🔓 Reserva cancelada por ${nomeUsuario}`,
      mensagem: produto ? `${produto.modelo} · ${produto.atributos?.gb ?? ''} · ${produto.atributos?.cor ?? ''}` : null,
      autor_id: userId,
    })
  }

  // ── Chat por produto ──────────────────────────────────────
  async function abrirChat(produtoId: string) {
    setModalChat(produtoId)
    setCarregandoChat(true)
    setMensagensChat([])
    setPedidosPendentes([])
    setModalSolicitarDesc(false)
    setRespondendoId(null)
    setAcaoResposta(null)
    setContadoresChat(c => ({ ...c, [produtoId]: 0 }))

    const [{ data: msgs }, { data: reqs }] = await Promise.all([
      supabase.from('product_messages').select('*').eq('store_id', storeId).eq('produto_id', produtoId).order('created_at', { ascending: true }),
      supabase.from('discount_requests').select('*').eq('store_id', storeId).eq('produto_id', produtoId).eq('status', 'pendente').order('created_at', { ascending: true }),
    ])
    if (msgs) setMensagensChat(msgs as ProductMessage[])
    if (reqs) setPedidosPendentes(reqs as DiscountRequest[])
    setCarregandoChat(false)
  }

  async function enviarMensagem() {
    if (!modalChat || !novaMensagem.trim() || enviandoMensagem) return
    setEnviandoMensagem(true)
    const texto = novaMensagem.trim()
    const msg = {
      produto_id: modalChat,
      store_id: storeId,
      autor_id: userId,
      autor_nome: nomeUsuario,
      autor_cargo: cargo,
      mensagem: texto,
      tipo: 'mensagem',
    }
    const { data } = await supabase.from('product_messages').insert(msg).select().single()
    if (data) setMensagensChat(prev => [...prev, data as ProductMessage])
    setNovaMensagem('')

    // Notificação direcionada
    const produto = produtos.find(p => p.id === modalChat)
    const preview = texto.length > 60 ? texto.slice(0, 60) + '…' : texto

    let destinatarioId: string | null = null
    if (cargo === 'gestor') {
      // Gestor responde → notifica o último vendedor que falou neste chat
      const ultimoVendedor = [...mensagensChat].reverse().find(m => m.autor_cargo === 'vendedor')
      destinatarioId = ultimoVendedor?.autor_id ?? null
    }
    // Vendedor envia → destinatario_id null (gestor vê todas notificações da loja)

    const { error: notifError } = await supabase.from('notifications').insert({
      store_id: storeId,
      produto_id: modalChat,
      tipo: 'mensagem_chat',
      titulo: `💬 ${nomeUsuario} — ${produto?.modelo ?? 'produto'}`,
      mensagem: preview,
      destinatario_id: destinatarioId,
      autor_id: userId,
    })
    if (notifError) console.error('[enviarMensagem] notif erro:', notifError.message)

    setEnviandoMensagem(false)
  }

  async function insertMensagemSistema(produtoId: string, mensagem: string, tipo = 'sistema') {
    const { error } = await supabase.from('product_messages').insert({
      produto_id: produtoId,
      store_id: storeId,
      autor_id: userId,
      autor_nome: 'Sistema',
      autor_cargo: 'sistema',
      mensagem,
      tipo,
    })
    // Não incrementa contador aqui — o realtime já faz isso quando recebe o INSERT
    // Se falhar, loga para diagnóstico
    if (error) console.error('[insertMensagemSistema] erro:', error.message, { produtoId, mensagem })
  }
  async function solicitarDesconto() {
    if (!modalChat || !valorSolicitado.trim() || solicitandoDesc) return
    setSolicitandoDesc(true)
    const produto = produtos.find(p => p.id === modalChat)
    const valSol = parseBRL(valorSolicitado)
    if (isNaN(valSol) || valSol <= 0) { setSolicitandoDesc(false); return }

    const { data, error: descErr } = await supabase.from('discount_requests').insert({
      produto_id: modalChat,
      store_id: storeId,
      vendedor_id: userId,
      vendedor_nome: nomeUsuario,
      valor_solicitado: valSol,
      valor_original: produto?.valor ?? 0,
      motivo: motivoDesconto.trim() || null,
      status: 'pendente',
    }).select().single()

    if (descErr) { toastErro('Erro ao solicitar desconto: ' + descErr.message); setSolicitandoDesc(false); return }
    if (data) {
      setPedidosPendentes(prev => [...prev, data as DiscountRequest])
      const msgSistema = `🔖 ${nomeUsuario} solicitou aprovação: R$ ${fmt(valSol)}${motivoDesconto.trim() ? ` — "${motivoDesconto.trim()}"` : ''}`
      await insertMensagemSistema(modalChat, msgSistema, 'solicitacao_desconto')
      await supabase.from('notifications').insert({
        store_id: storeId,
        produto_id: modalChat,
        tipo: 'desconto_solicitado',
        titulo: `🔖 Desconto solicitado — ${nomeUsuario}`,
        mensagem: produto
          ? `${produto.modelo} · ${produto.atributos?.gb ?? ''} — R$ ${fmt(valSol)}${motivoDesconto.trim() ? ` · ${motivoDesconto.trim()}` : ''}`
          : null,
        autor_id: userId,
      })
    }
    setValorSolicitado('')
    setMotivoDesconto('')
    setModalSolicitarDesc(false)
    setSolicitandoDesc(false)
  }

  async function responderDesconto() {
    if (!respondendoId || !acaoResposta || salvandoResposta || !modalChat) return
    setSalvandoResposta(true)
    const req = pedidosPendentes.find(r => r.id === respondendoId)
    const cpValor = acaoResposta === 'contra_proposta' ? parseBRL(contraPropostaValor) : null

    const updates = {
      status: acaoResposta,
      valor_aprovado: acaoResposta === 'aprovado' ? req?.valor_solicitado : cpValor,
      resposta_gestor: respostaTexto.trim() || null,
      gestor_id: userId,
      gestor_nome: nomeUsuario,
      resolved_at: new Date().toISOString(),
    }
    const { error } = await supabase.from('discount_requests').update(updates).eq('id', respondendoId)

    if (!error) {
      let msgSistema = ''
      if (acaoResposta === 'aprovado') {
        msgSistema = `✅ Desconto aprovado por ${nomeUsuario}: R$ ${fmt(req?.valor_solicitado ?? 0)}${respostaTexto.trim() ? ` — "${respostaTexto.trim()}"` : ''}`
      } else if (acaoResposta === 'negado') {
        msgSistema = `❌ Desconto negado por ${nomeUsuario}${respostaTexto.trim() ? ` — "${respostaTexto.trim()}"` : ''}`
      } else {
        msgSistema = `💡 Contra-proposta de ${nomeUsuario}: R$ ${fmt(cpValor ?? 0)}${respostaTexto.trim() ? ` — "${respostaTexto.trim()}"` : ''}`
      }
      await insertMensagemSistema(modalChat, msgSistema, acaoResposta)
      await supabase.from('notifications').insert({
        store_id: storeId,
        produto_id: modalChat,
        tipo: 'desconto_respondido',
        titulo: acaoResposta === 'aprovado' ? `✅ Desconto aprovado — ${nomeUsuario}` :
                acaoResposta === 'negado'   ? `❌ Desconto negado — ${nomeUsuario}` :
                                              `💡 Contra-proposta — ${nomeUsuario}`,
        mensagem: msgSistema,
        destinatario_id: req?.vendedor_id ?? null,
        autor_id: userId,
      })
      setPedidosPendentes(prev => prev.filter(r => r.id !== respondendoId))
    }
    setRespondendoId(null)
    setAcaoResposta(null)
    setContraPropostaValor('')
    setRespostaTexto('')
    setSalvandoResposta(false)
  }
  // ──────────────────────────────────────────────────────────

  // Vendedor confirma venda via modal
  async function confirmarVendaVendedor() {
    if (!modalVendaVendedor) return
    setSalvandoVendaVendedor(true)
    const hoje = dataHoje()
    const produto = produtos.find(p => p.id === modalVendaVendedor)
    const valorNum = parseBRL(valorVendaVendedor)
    const entradaNum = parseBRL(valorEntradaVendedor)
    const entradaOk  = formaPagamento === 'misto' && !isNaN(entradaNum) && entradaNum > 0
    const parceladoNum = valorNum  // no misto, valorNum = parte parcelada
    const valorOk = !isNaN(valorNum) && valorNum > 0

    // Taxa sobre a parte parcelada (parcelado ou misto)
    // taxa_aplicada = SEMPRE taxa_operadora (custo real da maquininha), nunca taxa_comercial
    const usaParcelado = formaPagamento === 'parcelado' || formaPagamento === 'misto'
    const jurosParcela = usaParcelado ? juros.find(j => j.parcelas === parcelasVenda) : null
    const taxaAplicada = jurosParcela
      ? (jurosParcela.taxa_operadora ?? TAXA_REAL_FALLBACK[parcelasVenda] ?? 14)
      : 0
    // Total bruto e líquido
    const totalBruto =
      formaPagamento === 'misto' && entradaOk && valorOk
        ? entradaNum + parceladoNum
        : valorOk ? valorNum : 0
    const liquidoParcelado = valorOk && usaParcelado
      ? parceladoNum * (1 - taxaAplicada / 100)
      : parceladoNum
    const valorLiquido =
      formaPagamento === 'misto' && entradaOk
        ? entradaNum + liquidoParcelado
        : formaPagamento === 'parcelado' ? liquidoParcelado
        : valorOk ? valorNum : null

    const formaLabel =
      formaPagamento === 'a_vista'  ? 'À vista' :
      formaPagamento === 'boleto'   ? 'Boleto'  :
      formaPagamento === 'misto'    ? `Misto: R$ ${fmt(entradaNum)} entrada + ${parcelasVenda}x` :
      `${parcelasVenda}x parcelado`

    const updates: Record<string, unknown> = {
      status: 'vendido',
      data_venda: hoje,
      vendido_por: userId,
      vendido_por_nome: nomeUsuario,
      vendido_por_id: userId,
      forma_pagamento: formaPagamento,
      updated_by: userId,
    }
    if (totalBruto > 0)   { updates.valor_venda  = totalBruto; updates.valor_liquido = valorLiquido }
    if (usaParcelado)     { updates.parcelas_venda = parcelasVenda; updates.taxa_aplicada = taxaAplicada }
    if (entradaOk)          updates.valor_entrada = entradaNum

    const { error: vendaError, data: vendaData } = await supabase
      .from('products')
      .update(updates)
      .eq('id', modalVendaVendedor)
      .in('status', ['disponivel', 'reservado'])  // lock otimista: só vende se disponível ou reservado
      .select('id')

    if (vendaError) {
      toastErro('Erro ao registrar venda: ' + vendaError.message)
      setSalvandoVendaVendedor(false)
      return
    }
    if (!vendaData || vendaData.length === 0) {
      toastAviso('Produto não está mais disponível para venda. Atualize a página.')
      setSalvandoVendaVendedor(false)
      resetModalVenda()
      return
    }

    setProdutos(prev => prev.map(p =>
      p.id === modalVendaVendedor
        ? {
            ...p, status: 'vendido', data_venda: hoje, vendido_por: userId, vendido_por_nome: nomeUsuario,
            forma_pagamento: formaPagamento,
            parcelas_venda: usaParcelado ? parcelasVenda : null,
            taxa_aplicada:  usaParcelado ? taxaAplicada  : null,
            valor_venda:    totalBruto > 0 ? totalBruto : p.valor_venda,
            valor_liquido:  valorLiquido,
            valor_entrada:  entradaOk ? entradaNum : null,
          }
        : p
    ))
    await supabase.from('notifications').insert({
      store_id: storeId,
      produto_id: modalVendaVendedor,
      tipo: 'venda_pendente',
      titulo: `✅ Venda aguardando confirmação — ${nomeUsuario}`,
      mensagem: produto
        ? `${produto.modelo} · ${produto.atributos?.gb ?? ''} · ${produto.atributos?.cor ?? ''}` +
          `${!isNaN(valorNum) && valorNum > 0 ? ` · R$ ${fmt(valorNum)}` : ''} · ${formaLabel}`
        : null,
      autor_id: userId,
    })
    setSalvandoVendaVendedor(false)
    resetModalVenda()
  }

  function resetModalConfirmar() {
    setModalConfirmar(null)
    setValorVendaConfirm('')
    setEntradaConfirm('')
    setShowDevolucao(false)
    setMotivoDevolucao('')
  }

  // Gestor confirma saída — grava snapshots financeiros imutáveis
  async function confirmarSaidaGestor() {
    if (!modalConfirmar) return
    setSalvandoConfirmar(true)
    const produto = produtos.find(p => p.id === modalConfirmar)

    const valorNum    = parseBRL(valorVendaConfirm)
    const entradaNum  = parseBRL(entradaConfirm)
    const usaParc     = formaConfirm === 'parcelado' || formaConfirm === 'misto'
    const jP          = usaParc ? juros.find(j => j.parcelas === parcelasConfirm) : null
    const taxaOp      = jP ? (jP.taxa_operadora ?? 0) : 0
    const taxaCom     = jP ? jP.taxa_comercial : 0
    const parcelado   = !isNaN(valorNum) && valorNum > 0 ? valorNum : 0
    const entrada     = !isNaN(entradaNum) && entradaNum > 0 ? entradaNum : 0
    const totalBruto  = formaConfirm === 'misto' ? entrada + parcelado : parcelado
    const liquido     = formaConfirm === 'parcelado' ? parcelado * (1 - taxaOp / 100)
      : formaConfirm === 'misto' ? entrada + parcelado * (1 - taxaOp / 100)
      : parcelado

    const custo           = produto?.atributos?.custo_total ?? 0
    const valorNormal     = produto?.valor ?? 0
    const margemBruta     = liquido > 0 ? liquido - custo : null
    const descontoAplic   = valorNormal > 0 && totalBruto > 0 && totalBruto < valorNormal
      ? valorNormal - totalBruto : null

    const updates: Record<string, unknown> = {
      status:           'confirmado',
      updated_by:       userId,
      data_venda:       produto?.data_venda || dataHoje(),
      vendido_por:      produto?.vendido_por_id || produto?.vendido_por || null,
      vendido_por_nome: produto?.vendido_por_nome || produto?.reservado_por || null,
      vendido_por_id:   produto?.vendido_por_id || null,
      forma_pagamento:  formaConfirm,
      confirmado_por:   nomeUsuario,
      data_confirmacao: dataHoje(),
      // Snapshots financeiros imutáveis
      custo_snapshot:        custo > 0 ? custo : null,
      valor_normal_snapshot: valorNormal > 0 ? valorNormal : null,
      taxa_operadora_snap:   taxaOp > 0 ? taxaOp : null,
      taxa_comercial_snap:   taxaCom > 0 ? taxaCom : null,
    }
    if (totalBruto > 0)     { updates.valor_venda = totalBruto; updates.valor_liquido = liquido }
    if (usaParc)             { updates.parcelas_venda = parcelasConfirm; updates.taxa_aplicada = taxaOp }
    if (entrada > 0)           updates.valor_entrada = entrada
    if (margemBruta !== null)  updates.margem_bruta = parseFloat(margemBruta.toFixed(2))
    if (descontoAplic !== null) updates.desconto_aplicado = parseFloat(descontoAplic.toFixed(2))

    const { error } = await supabase.from('products').update(updates).eq('id', modalConfirmar)
    if (error) { toastErro('Erro ao confirmar venda: ' + error.message); setSalvandoConfirmar(false); return }
    setProdutos(prev => prev.map(p =>
      p.id === modalConfirmar ? { ...p, ...updates, status: 'confirmado' } : p
    ))
    await supabase.from('notifications').insert({
      store_id: storeId,
      produto_id: modalConfirmar,
      tipo: 'venda_confirmada',
      titulo: `✅ Venda confirmada — ${produto?.modelo ?? ''}`,
      mensagem: `Confirmado por ${nomeUsuario}${totalBruto > 0 ? ` · R$ ${fmt(totalBruto)}` : ''}`,
      destinatario_id: produto?.vendido_por_id ?? null,
      autor_id: userId,
    })
    resetModalConfirmar()
    setSalvandoConfirmar(false)
  }

  // Gestor devolve venda — volta produto para disponível/reservado
  async function devolverVenda() {
    if (!modalConfirmar || devolvendo) return
    setDevolvendo(true)
    const produto = produtos.find(p => p.id === modalConfirmar)
    const statusAnterior = produto?.reserva_cliente ? 'reservado' : 'disponivel'
    const motivo = motivoDevolucao.trim()

    const updates: Record<string, unknown> = {
      status:             statusAnterior,
      updated_by:         userId,
      // Limpa dados da venda
      vendido_por:        null,
      vendido_por_nome:   null,
      vendido_por_id:     null,
      forma_pagamento:    null,
      valor_venda:        null,
      valor_liquido:      null,
      valor_entrada:      null,
      parcelas_venda:     null,
      taxa_aplicada:      null,
      data_venda:         null,
      motivo_devolucao:   motivo || null,
      // Limpa snapshots financeiros da venda anterior
      custo_snapshot:     null,
      margem_bruta:       null,
      desconto_aplicado:  null,
      confirmado_por:     null,
      data_confirmacao:   null,
    }

    const { error } = await supabase.from('products').update(updates).eq('id', modalConfirmar)
    if (!error) {
      setProdutos(prev => prev.map(p =>
        p.id === modalConfirmar ? { ...p, ...updates } : p
      ))
      await supabase.from('notifications').insert({
        store_id: storeId,
        produto_id: modalConfirmar,
        tipo: 'venda_devolvida',
        titulo: `↩️ Venda devolvida — ${produto?.modelo ?? ''}`,
        mensagem: motivo || `Devolvido por ${nomeUsuario}`,
        destinatario_id: produto?.vendido_por_id ?? null,
        autor_id: userId,
      })
      resetModalConfirmar()
    }
    setDevolvendo(false)
  }

  async function confirmarPrecos() {
    if (!modalPrecos) return
    setSalvandoPrecos(true)
    const updates: Record<string, unknown> = { updated_by: userId }
    if (editValor) updates.valor = parseFloat(editValor)
    if (editValorAvista) updates.valor_avista = parseFloat(editValorAvista)
    updates.promocao = editPromocao ? parseFloat(editPromocao) : null

    const { error } = await supabase
      .from('products')
      .update(updates)
      .eq('id', modalPrecos.id)
    if (!error) {
      setProdutos(prev => prev.map(p =>
        p.id === modalPrecos.id ? { ...p, ...updates } : p
      ))
    }
    setSalvandoPrecos(false)
    setModalPrecos(null)
  }

  async function confirmarExclusao() {
    if (!modalExcluir) return
    if (modalExcluir.status === 'vendido' || modalExcluir.status === 'confirmado') {
      toastAviso('Não é possível excluir um produto com venda registrada.')
      setModalExcluir(null)
      return
    }
    setExcluindo(true)
    const { error } = await supabase
      .from('products')
      .delete()
      .eq('id', modalExcluir.id)
    if (!error) {
      setProdutos(prev => prev.filter(p => p.id !== modalExcluir.id))
    } else {
      toastErro('Erro ao excluir: ' + error.message)
    }
    setExcluindo(false)
    setModalExcluir(null)
  }

  async function marcarNotifLidas() {
    const ids = notificacoes.filter(n => !n.lida).map(n => n.id)
    if (ids.length === 0) return
    await supabase.from('notifications').update({ lida: true }).in('id', ids)
    setNotificacoes(prev => prev.map(n => ({ ...n, lida: true })))
  }

  async function excluirNotif(id: string) {
    await supabase.from('notifications').delete().eq('id', id)
    setNotificacoes(prev => prev.filter(n => n.id !== id))
  }

  async function limparTodasNotifs() {
    const ids = notificacoes
      .filter(n => n.destinatario_id === null || n.destinatario_id === userId)
      .map(n => n.id)
    if (ids.length === 0) return
    await supabase.from('notifications').delete().in('id', ids)
    setNotificacoes(prev => prev.filter(n => !ids.includes(n.id)))
  }

  // Categorias presentes no estoque (dinâmico)
  const categoriasPresentes = useMemo(
    () => ['todos', ...Array.from(new Set(produtos.map(p => p.categoria).filter(Boolean)))],
    [produtos]
  )

  const contagens = useMemo(() => ({
    todos:      produtos.filter(p => p.status !== 'confirmado').length,
    disponivel: produtos.filter(p => p.status === 'disponivel').length,
    reservado:  produtos.filter(p => p.status === 'reservado').length,
    manutencao: produtos.filter(p => p.status === 'manutencao').length,
    emprestado: produtos.filter(p => p.status === 'emprestado').length,
    garantia:   produtos.filter(p => p.status === 'garantia').length,
    devolucao:  produtos.filter(p => p.status === 'devolucao').length,
    vendido:    produtos.filter(p => p.status === 'vendido').length,
    confirmado: produtos.filter(p => p.status === 'confirmado').length,
  }), [produtos])

  function modeloNumero(modelo: string): number {
    const match = modelo.match(/(\d+)/)
    return match ? parseInt(match[1]) : 0
  }
  function modeloVariante(modelo: string): number {
    const m = modelo.toLowerCase()
    if (m.includes('pro max')) return 3
    if (m.includes('pro'))     return 2
    if (m.includes('plus'))    return 1
    return 0
  }

  // Notificações visíveis para este usuário
  const notificacoesVisiveis = useMemo(
    () => notificacoes.filter(n =>
      n.autor_id !== userId && (n.destinatario_id === null || n.destinatario_id === userId)
    ),
    [notificacoes, userId]
  )

  const produtosFiltrados = useMemo(() => produtos
    .filter(p => {
      if (cargo === 'vendedor') {
        // Vendedor vê tudo exceto confirmado (histórico é só do gestor)
        // Reservas e vendas de TODOS os vendedores aparecem — para comunicação entre a equipe
        return p.status === 'disponivel' || p.status === 'reservado' || p.status === 'vendido'
      }
      // Gestor: todos exceto confirmado (que vai em tab própria)
      if (filtroStatus === 'todos') return p.status !== 'confirmado'
      return p.status === filtroStatus
    })
    .filter(p => filtroCategoria === 'todos' || p.categoria === filtroCategoria)
    .filter(p => filtroTipo === 'todos' || p.atributos?.tipo === filtroTipo)
    .filter(p => {
      if (!busca) return true
      const b = busca.toLowerCase()
      const attr = p.atributos || {}
      return (
        p.modelo.toLowerCase().includes(b) ||
        (attr.cor  ?? '').toLowerCase().includes(b) ||
        (attr.gb   ?? '').toLowerCase().includes(b) ||
        (attr.imei ?? '').toLowerCase().includes(b)
      )
    })
    .sort((a, b) => {
      const numDiff = modeloNumero(b.modelo) - modeloNumero(a.modelo)
      if (numDiff !== 0) return numDiff
      return modeloVariante(b.modelo) - modeloVariante(a.modelo)
    }),
    [produtos, cargo, filtroStatus, filtroCategoria, filtroTipo, busca]
  )

  if (carregando) return <SpinnerPage />

  if (erroLoad) return (
    <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: '#0a0a0a' }}>
      <div className="flex flex-col items-center gap-4 text-center max-w-sm mx-4">
        <div className="text-4xl">⚠️</div>
        <p className="text-white font-semibold">Erro ao carregar</p>
        <p className="text-sm" style={{ color: '#888' }}>{erroLoad}</p>
        <button
          onClick={() => { setCarregando(true); setErroLoad(null); window.location.reload() }}
          className="px-5 py-2.5 rounded-xl font-semibold text-sm transition-all"
          style={{ backgroundColor: '#c8960c', color: '#000' }}
          onMouseEnter={e => (e.currentTarget.style.backgroundColor = '#e0a80e')}
          onMouseLeave={e => (e.currentTarget.style.backgroundColor = '#c8960c')}
        >
          Tentar novamente
        </button>
      </div>
    </div>
  )

  return (
    <div className="min-h-screen pb-24" style={{ backgroundColor: '#0a0a0a' }}>

      {/* ══ Header ══ */}
      <header className="border-b px-6 py-4 flex items-center gap-4 sticky top-0 z-10"
        style={{ backgroundColor: '#111', borderColor: '#1f1f1f' }}>
        <button onClick={() => router.push('/dashboard')}
          className="text-sm px-3 py-1.5 rounded-lg border transition-all"
          style={{ borderColor: '#2a2a2a', color: '#888' }}
          onMouseEnter={e => { e.currentTarget.style.borderColor = '#c8960c'; e.currentTarget.style.color = '#c8960c' }}
          onMouseLeave={e => { e.currentTarget.style.borderColor = '#2a2a2a'; e.currentTarget.style.color = '#888' }}>
          ← Voltar
        </button>
        <div className="flex-1">
          <h1 className="font-bold text-white">Estoque</h1>
          <p className="text-xs" style={{ color: '#666' }}>
            {cargo === 'gestor' ? `${produtosFiltrados.length} produto(s) · visão completa` : 'Produtos disponíveis'}
          </p>
        </div>
        <div className="flex items-center gap-2">
            {/* Sino de notificações — gestor e vendedor */}
            <div className="relative" ref={sinoRef}>
              <button
                onClick={() => { setPainelNotif(v => !v); if (!painelNotif) marcarNotifLidas() }}
                className="relative w-9 h-9 rounded-xl border flex items-center justify-center transition-all"
                style={{ borderColor: notificacoesVisiveis.some(n => !n.lida) ? '#fb923c55' : '#2a2a2a', backgroundColor: notificacoesVisiveis.some(n => !n.lida) ? '#fb923c11' : 'transparent' }}>
                <span className="text-base">🔔</span>
                {notificacoesVisiveis.some(n => !n.lida) && (
                  <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full text-xs font-bold flex items-center justify-center"
                    style={{ backgroundColor: '#fb923c', color: '#000' }}>
                    {notificacoesVisiveis.filter(n => !n.lida).length}
                  </span>
                )}
              </button>

              {/* Painel renderizado via portal no body — escapa qualquer stacking context */}
              {painelNotif && typeof document !== 'undefined' && createPortal(
                <>
                  <div className="fixed inset-0 z-[998]" onClick={() => setPainelNotif(false)} />
                  <div className="fixed right-4 top-16 z-[999] rounded-2xl border shadow-2xl overflow-hidden"
                    style={{ backgroundColor: '#111', borderColor: '#2a2a2a', width: '340px', maxHeight: '80vh' }}>

                    {/* Header do painel */}
                    <div className="px-4 py-3 border-b flex items-center justify-between" style={{ borderColor: '#1f1f1f' }}>
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-bold text-white">Notificações</span>
                        {notificacoesVisiveis.some(n => !n.lida) && (
                          <span className="text-xs px-1.5 py-0.5 rounded-full font-bold"
                            style={{ backgroundColor: '#fb923c', color: '#000' }}>
                            {notificacoesVisiveis.filter(n => !n.lida).length}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-3">
                        {notificacoesVisiveis.some(n => !n.lida) && (
                          <button onClick={marcarNotifLidas} className="text-xs transition-all" style={{ color: '#555' }}
                            onMouseEnter={e => e.currentTarget.style.color = '#aaa'}
                            onMouseLeave={e => e.currentTarget.style.color = '#555'}>
                            Marcar lidas
                          </button>
                        )}
                        {notificacoesVisiveis.length > 0 && (
                          <button onClick={limparTodasNotifs} className="text-xs transition-all" style={{ color: '#555' }}
                            onMouseEnter={e => e.currentTarget.style.color = '#f87171'}
                            onMouseLeave={e => e.currentTarget.style.color = '#555'}>
                            Limpar tudo
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Lista */}
                    {notificacoesVisiveis.length === 0 ? (
                      <div className="px-4 py-10 text-center">
                        <p className="text-2xl mb-2">🔔</p>
                        <p className="text-sm" style={{ color: '#555' }}>Nenhuma notificação</p>
                      </div>
                    ) : (
                      <div className="overflow-y-auto" style={{ maxHeight: 'calc(80vh - 56px)' }}>
                        {notificacoesVisiveis.map(n => (
                          <div key={n.id}
                            className="group relative border-b transition-all"
                            style={{
                              borderColor: '#1a1a1a',
                              backgroundColor: n.lida ? 'transparent' : '#ffffff08',
                              borderLeft: n.lida ? '3px solid transparent' : '3px solid #fb923c',
                            }}>
                            <div className="px-4 py-3 cursor-pointer pr-10"
                              onClick={() => {
                                setPainelNotif(false)
                                marcarNotifLidas()
                                if (n.tipo === 'mensagem_chat' || n.tipo === 'desconto_solicitado' || n.tipo === 'desconto_respondido') {
                                  abrirChat(n.produto_id)
                                } else {
                                  // Limpar filtros para garantir que o produto esteja visível
                                  setFiltroStatus('todos')
                                  setBusca('')
                                  // Aguarda re-render após limpeza dos filtros
                                  setTimeout(() => {
                                    const el = document.getElementById(`produto-${n.produto_id}`)
                                    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' })
                                  }, 100)
                                }
                              }}>
                              <p className="text-sm font-medium mb-0.5" style={{ color: n.lida ? '#aaa' : '#fff' }}>
                                {n.titulo}
                              </p>
                              {n.mensagem && (
                                <p className="text-xs" style={{ color: '#666' }}>{n.mensagem}</p>
                              )}
                              <p className="text-xs mt-1" style={{ color: '#444' }}>
                                {new Date(n.created_at).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                              </p>
                            </div>
                            {/* Botão excluir */}
                            <button
                              onClick={e => { e.stopPropagation(); excluirNotif(n.id) }}
                              className="absolute right-3 top-1/2 -translate-y-1/2 w-6 h-6 rounded-full items-center justify-center text-xs opacity-0 group-hover:opacity-100 transition-all flex"
                              style={{ backgroundColor: '#2a2a2a', color: '#666' }}
                              onMouseEnter={e => { e.currentTarget.style.backgroundColor = '#f87171'; e.currentTarget.style.color = '#000' }}
                              onMouseLeave={e => { e.currentTarget.style.backgroundColor = '#2a2a2a'; e.currentTarget.style.color = '#666' }}>
                              ×
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </>,
                document.body
              )}
            </div>

            {cargo === 'gestor' && (
              <button onClick={() => router.push('/dashboard/novo-produto')}
                className="px-4 py-2 rounded-xl font-semibold text-black text-sm transition-all"
                style={{ backgroundColor: '#c8960c' }}
                onMouseEnter={e => e.currentTarget.style.backgroundColor = '#e0a80e'}
                onMouseLeave={e => e.currentTarget.style.backgroundColor = '#c8960c'}>
                + Produto
              </button>
            )}
        </div>
      </header>

      {/* ══ Filtros (gestor) ══ */}
      {cargo === 'gestor' && (
        <div className="sticky top-[65px] z-20 border-b" style={{ backgroundColor: '#111', borderColor: '#1f1f1f' }}>

          {/* Linha 1: Status */}
          <div className="px-6 pt-3 pb-0">
            <p className="text-xs mb-2 font-medium" style={{ color: '#555' }}>STATUS</p>
            <div className="flex gap-2 overflow-x-auto pb-3" style={{ scrollbarWidth: 'none' }}>
              {([
                { key: 'todos',      label: 'Todos' },
                { key: 'disponivel', label: '🟢 Disponível' },
                { key: 'reservado',  label: '🔒 Reservado' },
                { key: 'vendido',    label: '⏳ Aguardando' },
                { key: 'manutencao', label: '🔧 Manutenção' },
                { key: 'emprestado', label: '🔵 Emprestado' },
                { key: 'garantia',   label: '🛡️ Garantia' },
                { key: 'devolucao',  label: '🔄 Devolução' },
                { key: 'confirmado', label: '📦 Histórico' },
              ] as { key: string; label: string }[]).map(tab => {
                const count = contagens[tab.key as keyof typeof contagens]
                const isActive = filtroStatus === tab.key
                const cfg = STATUS_CONFIG[tab.key]
                return (
                  <button key={tab.key}
                    onClick={() => setFiltroStatus(tab.key)}
                    className="flex-shrink-0 flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium border transition-all"
                    style={{
                      backgroundColor: isActive ? (cfg?.bg ?? '#c8960c18') : 'transparent',
                      borderColor:     isActive ? (cfg?.cor ?? '#c8960c')   : '#2a2a2a',
                      color:           isActive ? (cfg?.cor ?? '#c8960c')   : '#555',
                    }}>
                    {tab.label}
                    <span className="px-1.5 py-0.5 rounded-full text-xs font-bold"
                      style={{
                        backgroundColor: isActive ? (cfg?.cor ?? '#c8960c') + '33' : '#1a1a1a',
                        color: isActive ? (cfg?.cor ?? '#c8960c') : '#444',
                      }}>
                      {count}
                    </span>
                  </button>
                )
              })}
            </div>
          </div>

          {/* Linha 2: Categoria + Tipo */}
          <div className="px-6 pb-3 flex flex-wrap gap-x-6 gap-y-2 border-t" style={{ borderColor: '#1a1a1a' }}>

            {/* Categoria */}
            <div className="flex items-center gap-2 pt-3 flex-wrap">
              <p className="text-xs font-medium flex-shrink-0" style={{ color: '#555' }}>CATEGORIA</p>
              {categoriasPresentes.map(cat => {
                const isActive = filtroCategoria === cat
                const label = cat === 'todos' ? 'Todas' : (CATEGORIA_LABELS[cat] ?? cat)
                return (
                  <button key={cat}
                    onClick={() => setFiltroCategoria(cat)}
                    className="px-3 py-1 rounded-lg text-xs font-medium border transition-all"
                    style={{
                      backgroundColor: isActive ? '#c8960c22' : 'transparent',
                      borderColor:     isActive ? '#c8960c'   : '#2a2a2a',
                      color:           isActive ? '#c8960c'   : '#555',
                    }}>
                    {label}
                  </button>
                )
              })}
            </div>

            {/* Tipo: Novo / Seminovo */}
            <div className="flex items-center gap-2 pt-3 flex-wrap">
              <p className="text-xs font-medium flex-shrink-0" style={{ color: '#555' }}>TIPO</p>
              {[
                { key: 'todos',    label: 'Todos' },
                { key: 'Novo',     label: '✨ Novo' },
                { key: 'Seminovo', label: '♻️ Seminovo' },
              ].map(t => {
                const isActive = filtroTipo === t.key
                return (
                  <button key={t.key}
                    onClick={() => setFiltroTipo(t.key)}
                    className="px-3 py-1 rounded-lg text-xs font-medium border transition-all"
                    style={{
                      backgroundColor: isActive ? '#c8960c22' : 'transparent',
                      borderColor:     isActive ? '#c8960c'   : '#2a2a2a',
                      color:           isActive ? '#c8960c'   : '#555',
                    }}>
                    {t.label}
                  </button>
                )
              })}
            </div>
          </div>
        </div>
      )}

      {/* ══ Filtros (vendedor) ══ */}
      {cargo === 'vendedor' && (
        <div className="sticky top-[65px] z-10 border-b px-6 py-3" style={{ backgroundColor: '#111', borderColor: '#1f1f1f' }}>
          {/* Categoria */}
          {categoriasPresentes.length > 1 && (
            <div className="flex items-center gap-2 mb-3 flex-wrap">
              <p className="text-xs font-medium flex-shrink-0" style={{ color: '#555' }}>CATEGORIA</p>
              {categoriasPresentes.map(cat => {
                const isActive = filtroCategoria === cat
                const label = cat === 'todos' ? 'Todas' : (CATEGORIA_LABELS[cat] ?? cat)
                return (
                  <button key={cat}
                    onClick={() => setFiltroCategoria(cat)}
                    className="px-3 py-1 rounded-lg text-xs font-medium border transition-all"
                    style={{
                      backgroundColor: isActive ? '#c8960c22' : 'transparent',
                      borderColor:     isActive ? '#c8960c'   : '#2a2a2a',
                      color:           isActive ? '#c8960c'   : '#555',
                    }}>
                    {label}
                  </button>
                )
              })}
            </div>
          )}
          {/* Tipo + Busca na mesma linha */}
          <div className="flex gap-3 items-center flex-wrap">
            <div className="flex items-center gap-2">
              {[
                { key: 'todos',    label: 'Todos' },
                { key: 'Novo',     label: '✨ Novo' },
                { key: 'Seminovo', label: '♻️ Seminovo' },
              ].map(t => {
                const isActive = filtroTipo === t.key
                return (
                  <button key={t.key}
                    onClick={() => setFiltroTipo(t.key)}
                    className="px-3 py-1 rounded-lg text-xs font-medium border transition-all"
                    style={{
                      backgroundColor: isActive ? '#c8960c22' : 'transparent',
                      borderColor:     isActive ? '#c8960c'   : '#2a2a2a',
                      color:           isActive ? '#c8960c'   : '#555',
                    }}>
                    {t.label}
                  </button>
                )
              })}
            </div>
            <input
              value={busca}
              onChange={e => setBusca(e.target.value)}
              placeholder="Buscar modelo, cor, GB, IMEI..."
              className="flex-1 min-w-0 rounded-xl px-4 py-2 text-white border outline-none text-sm"
              style={{ backgroundColor: '#1a1a1a', borderColor: '#2a2a2a' }}
            />
          </div>
        </div>
      )}

      {/* ══ Busca (gestor) ══ */}
      {cargo === 'gestor' && (
      <div className="px-6 py-4">
        <input
          value={busca}
          onChange={e => setBusca(e.target.value)}
          placeholder="Buscar por modelo, cor, GB ou IMEI..."
          className="w-full rounded-xl px-4 py-3 text-white border outline-none text-sm"
          style={{ backgroundColor: '#111', borderColor: '#2a2a2a' }}
        />
      </div>
      )}

      {/* ══ Grid de produtos ══ */}
      <main className="max-w-7xl mx-auto px-6 pb-6">
        {produtosFiltrados.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 text-center">
            <div className="text-5xl mb-4">📦</div>
            <h2 className="text-lg font-semibold text-white mb-2">Nenhum produto encontrado</h2>
            <p className="text-sm" style={{ color: '#666' }}>
              {cargo === 'gestor'
                ? 'Tente mudar os filtros ou adicione produtos.'
                : 'Nenhum produto disponível no momento.'}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {produtosFiltrados.map(produto => {
              const attr     = produto.atributos || {}
              const ehSeminovo = attr.tipo === 'Seminovo'
              const dias     = diasNoEstoque(produto.data_entrada)
              const cfg      = STATUS_CONFIG[produto.status] ?? STATUS_CONFIG.disponivel

              return (
                <div key={produto.id} id={`produto-${produto.id}`}
                  className="rounded-2xl border flex flex-col"
                  style={{
                    backgroundColor: '#111',
                    borderColor: cardExpandido === produto.id
                      ? cfg.cor + '66'
                      : produto.status !== 'disponivel' && cargo === 'gestor'
                      ? cfg.cor + '33'
                      : '#1f1f1f',
                    transition: 'border-color.2s',
                  }}>

                  {/* ── Topo (clicável para expandir) ── */}
                  <div className="px-5 pt-5 pb-4 cursor-pointer select-none"
                    style={{ borderBottom: cardExpandido === produto.id ? `1px solid #1f1f1f` : 'none' }}
                    onClick={() => setCardExpandido(cardExpandido === produto.id ? null : produto.id)}>
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        {/* Categoria pill */}
                        {produto.categoria && CATEGORIA_LABELS[produto.categoria] && (
                          <span className="text-xs px-2 py-0.5 rounded-md mb-1.5 inline-block"
                            style={{ backgroundColor: '#c8960c18', color: '#c8960c' }}>
                            {CATEGORIA_LABELS[produto.categoria]}
                          </span>
                        )}
                        <h3 className="font-bold text-white text-base leading-tight">{produto.modelo}</h3>
                        <p className="text-sm mt-0.5 truncate" style={{ color: '#888' }}>
                          {[attr.gb, attr.cor, attr.tipo].filter(Boolean).join(' · ')}
                        </p>
                        {ehSeminovo && (
                          <div className="flex gap-3 mt-1.5 flex-wrap">
                            {attr.condicao && (
                              <span className="text-xs font-medium" style={{ color: '#c8960c' }}>
                                ⭐ {attr.condicao}
                              </span>
                            )}
                            {attr.bateria && (
                              <span className="text-xs font-medium"
                                style={{ color: parseInt(attr.bateria) < 80 ? '#f87171' : '#4ade80' }}>
                                🔋 {attr.bateria}%
                              </span>
                            )}
                          </div>
                        )}
                      </div>

                      {/* Badge status */}
                      {cargo === 'gestor' ? (
                        <div className="relative flex-shrink-0">
                          <button
                            onClick={() => setDropdownStatus(dropdownStatus === produto.id ? null : produto.id)}
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold border transition-all"
                            style={{ backgroundColor: cfg.bg, borderColor: cfg.cor + '66', color: cfg.cor }}>
                            {cfg.emoji} {cfg.label} ▾
                          </button>

                          {dropdownStatus === produto.id && (
                            <>
                              <div className="fixed inset-0 z-10" onClick={() => setDropdownStatus(null)} />
                              <div className="absolute right-0 top-full mt-1 z-20 rounded-xl border overflow-hidden shadow-2xl"
                                style={{ backgroundColor: '#1a1a1a', borderColor: '#333', minWidth: '168px' }}>
                                {Object.entries(STATUS_CONFIG)
                                  .filter(([key]) => key !== produto.status && key !== 'confirmado' && key !== 'vendido')
                                  .map(([key, s]) => (
                                    <button key={key}
                                      onClick={() => alterarStatus(produto.id, key)}
                                      className="w-full flex items-center gap-2 px-4 py-2.5 text-sm text-left transition-all"
                                      style={{ color: s.cor }}
                                      onMouseEnter={e => e.currentTarget.style.backgroundColor = '#ffffff0a'}
                                      onMouseLeave={e => e.currentTarget.style.backgroundColor = 'transparent'}>
                                      {s.emoji} {s.label}
                                    </button>
                                  ))}
                              </div>
                            </>
                          )}
                        </div>
                      ) : (
                        <span className="flex-shrink-0 flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-bold"
                          style={{ backgroundColor: cfg.bg, color: cfg.cor }}>
                          {cfg.emoji} {cfg.label}
                        </span>
                      )}
                    </div>

                    {/* Dias no estoque */}
                    {cargo === 'gestor' && produto.status !== 'vendido' && produto.data_entrada && (
                      <div className="mt-2.5">
                        <span className="text-xs" style={{ color: dias >= 30 ? '#f87171' : '#555' }}>
                          📅 {produto.data_entrada} · {dias} dia{dias !== 1 ? 's' : ''} no estoque
                          {dias >= 30 && <span className="ml-1 font-bold"> ⚠️</span>}
                        </span>
                      </div>
                    )}
                    {produto.status === 'vendido' && produto.data_venda && (
                      <p className="text-xs mt-2" style={{ color: '#555' }}>✅ Vendido em {produto.data_venda}</p>
                    )}

                    {/* Indicador expand */}
                    <div className="flex items-center justify-between mt-3">
                      <span className="text-xs" style={{ color: '#333' }}>
                        {cardExpandido === produto.id ? '▲ fechar' : '▼ ver detalhes'}
                      </span>
                      <div className="flex items-center gap-2">
                        {(contadoresChat[produto.id] ?? 0) > 0 && (
                          <div className="relative flex items-center">
                            <span className="w-6 h-6 rounded-full text-xs flex items-center justify-center"
                              style={{ backgroundColor: '#60a5fa22', color: '#60a5fa', border: '1px solid #60a5fa44' }}>💬</span>
                            <span className="absolute -top-1 -right-1 w-3.5 h-3.5 rounded-full text-xs font-bold flex items-center justify-center"
                              style={{ backgroundColor: '#60a5fa', color: '#000', fontSize: 8 }}>
                              {contadoresChat[produto.id]}
                            </span>
                          </div>
                        )}
                        {cargo === 'gestor' && (() => {
                          const bloqueado = produto.status === 'vendido' || produto.status === 'confirmado'
                          return (
                            <button
                              onClick={e => { e.stopPropagation(); if (!bloqueado) setModalExcluir(produto) }}
                              disabled={bloqueado}
                              title={bloqueado ? 'Não é possível excluir um produto com venda registrada' : 'Excluir produto'}
                              className="py-1 px-2.5 rounded-lg text-xs border transition-all"
                              style={{
                                borderColor: bloqueado ? '#55555533' : '#f8717133',
                                color:       bloqueado ? '#555'      : '#f87171',
                                backgroundColor: bloqueado ? '#55555510' : '#f8717110',
                                cursor: bloqueado ? 'not-allowed' : 'pointer',
                                opacity: bloqueado ? 0.5 : 1,
                              }}>
                              🗑️
                            </button>
                          )
                        })()}
                      </div>
                    </div>
                  </div>

                  {/* ── Preços (sempre visíveis) ── */}
                  {produto.valor > 0 && (() => {
                    const custo = attr.custo_total ?? 0
                    const temCusto = cargo === 'gestor' && custo > 0
                    function lucroSemNF(v: number) { return v - custo }
                    function lucroComNF(v: number)  { return v *.92 - custo }
                    function corLucro(v: number)    { return v >= 0 ? '#4ade80' : '#f87171' }

                    function LucroBloco({ valor }: { valor: number }) {
                      if (!temCusto) return null
                      const lsNF = lucroSemNF(valor)
                      const lcNF = lucroComNF(valor)
                      return (
                        <div className="flex gap-3 mt-1.5 justify-end">
                          <span className="text-xs" style={{ color: '#444' }}>
                            s/NF: <span style={{ color: corLucro(lsNF) }}>R$ {fmt(lsNF)}</span>
                          </span>
                          <span className="text-xs" style={{ color: '#444' }}>
                            c/NF: <span style={{ color: lcNF >= 0 ? '#fb923c' : '#f87171' }}>R$ {fmt(lcNF)}</span>
                          </span>
                        </div>
                      )
                    }

                    // Input inline reutilizável
                    function InlineInput({ produtoId, campo, valorAtual, cor, tamanho }: {
                      produtoId: string; campo: CampoPreco; valorAtual: number
                      cor: string; tamanho: 'lg' | 'xl'
                    }) {
                      const editando = inlineEdit?.produtoId === produtoId && inlineEdit.campo === campo
                      const fontSize = tamanho === 'xl' ? '1.4rem' : '1.1rem'
                      if (editando) {
                        return (
                          <div className="flex items-center gap-1">
                            <span style={{ color: cor, fontSize, fontWeight: 'bold' }}>R$</span>
                            <input
                              autoFocus
                              value={inlineEdit.valor}
                              onChange={e => setInlineEdit(prev => prev ? { ...prev, valor: e.target.value } : null)}
                              onKeyDown={e => { if (e.key === 'Enter') salvarInline(); if (e.key === 'Escape') cancelarInline() }}
                              onBlur={salvarInline}
                              className="rounded-lg px-2 py-0.5 outline-none text-right"
                              style={{
                                backgroundColor: '#2a2a2a', border: `1px solid ${cor}`,
                                color: cor, fontSize, fontWeight: 'bold',
                                width: `${Math.max(inlineEdit.valor.length, 6) + 2}ch`
                              }}
                            />
                          </div>
                        )
                      }
                      return (
                        <button
                          onClick={() => cargo === 'gestor' && iniciarInline(produtoId, campo, String(valorAtual))}
                          className="group flex items-center gap-1 rounded-lg px-1 transition-all"
                          style={{ cursor: cargo === 'gestor' ? 'text' : 'default' }}
                          title="Clique para editar">
                          <span style={{ color: cor, fontSize, fontWeight: 'bold' }}>
                            R$ {fmt(valorAtual)}
                          </span>
                          {cargo === 'gestor' && (
                            <span className="opacity-0 group-hover:opacity-100 text-xs transition-opacity" style={{ color: '#555' }}>✏️</span>
                          )}
                        </button>
                      )
                    }

                    // Valores live (refletem edição em tempo real para os lucros)
                    const valorLive    = valorInlineAtual(produto.id, 'valor',      Number(produto.valor))
                    const avistaLive   = valorInlineAtual(produto.id, 'valor_avista', Number(produto.valor_avista ?? produto.valor))
                    const promocaoLive = valorInlineAtual(produto.id, 'promocao',   Number(produto.promocao ?? 0))
                    const psjValorLive = Number(produto.promocao_sem_juros?.valor ?? 0)

                    return (
                      <div className="px-5 py-4 flex flex-col gap-3">

                        {/* Custo */}
                        {temCusto && (
                          <div className="flex items-center justify-between pb-2 border-b" style={{ borderColor: '#1a1a1a' }}>
                            <span className="text-xs font-medium" style={{ color: '#888' }}>Custo total</span>
                            <span className="text-sm font-bold" style={{ color: '#aaa' }}>R$ {fmt(custo)}</span>
                          </div>
                        )}

                        {/* Valor de venda */}
                        <div>
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-medium uppercase tracking-wide" style={{ color: '#555' }}>Valor de venda</span>
                            <InlineInput produtoId={produto.id} campo="valor" valorAtual={valorLive} cor="white" tamanho="xl" />
                          </div>
                          <LucroBloco valor={valorLive} />
                        </div>

                        {/* Máx. desconto à vista */}
                        {(produto.valor_avista || inlineEdit?.produtoId === produto.id) && Number(produto.valor_avista) !== Number(produto.valor) && (() => {
                          const economiaAvista = valorLive - avistaLive
                          const pctAvista = economiaAvista > 0 ? Math.round((economiaAvista / valorLive) * 100) : 0
                          return (
                            <div className="pt-2 border-t" style={{ borderColor: '#1a1a1a' }}>
                              <div className="flex items-center justify-between">
                                <span className="text-xs font-medium uppercase tracking-wide" style={{ color: '#555' }}>Máx. à vista</span>
                                <InlineInput produtoId={produto.id} campo="valor_avista" valorAtual={avistaLive} cor="#c8960c" tamanho="lg" />
                              </div>
                              {cargo === 'vendedor' && economiaAvista > 0 && (
                                <div className="flex items-center justify-end gap-2 mt-1.5">
                                  <span className="text-xs line-through" style={{ color: '#555' }}>R$ {fmt(valorLive)}</span>
                                  <span className="text-xs font-bold px-2 py-0.5 rounded-full"
                                    style={{ backgroundColor: '#c8960c22', color: '#c8960c', border: '1px solid #c8960c44' }}>
                                    -{pctAvista}% · Economia de R$ {fmt(economiaAvista)}
                                  </span>
                                </div>
                              )}
                              {cargo === 'gestor' && economiaAvista > 0 && (
                                <p className="text-xs text-right mt-0.5" style={{ color: '#555' }}>-{pctAvista}% do valor normal</p>
                              )}
                              <LucroBloco valor={avistaLive} />
                            </div>
                          )
                        })()}

                        {/* Valor promocional */}
                        {((produto.promocao && Number(produto.promocao) > 0) ||
                          (inlineEdit?.produtoId === produto.id && inlineEdit.campo === 'promocao')) && (() => {
                          const normal  = valorLive
                          const economia = normal - promocaoLive
                          const pct = economia > 0 ? Math.round((economia / normal) * 100) : 0
                          return (
                            <div className="pt-2 border-t" style={{ borderColor: '#1a1a1a' }}>
                              <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                  <span className="text-xs font-medium uppercase tracking-wide" style={{ color: '#555' }}>Promocional</span>
                                  {cargo === 'gestor' && produto.promocao && Number(produto.promocao) > 0 && (
                                    <button onClick={() => removerCampo(produto.id, 'promocao')}
                                      className="text-xs px-1.5 py-0.5 rounded-md leading-none transition-all"
                                      style={{ color: '#f87171', backgroundColor: '#f8717115', border: '1px solid #f8717133' }}
                                      title="Remover promoção">
                                      ×
                                    </button>
                                  )}
                                </div>
                                <div className="text-right">
                                  <InlineInput produtoId={produto.id} campo="promocao" valorAtual={promocaoLive} cor="#60a5fa" tamanho="lg" />
                                  {economia > 0 && cargo === 'gestor' && (
                                    <p className="text-xs" style={{ color: '#555' }}>-{pct}% do valor normal</p>
                                  )}
                                </div>
                              </div>
                              {cargo === 'vendedor' && economia > 0 && (
                                <div className="flex items-center justify-end gap-2 mt-1.5">
                                  <span className="text-xs line-through" style={{ color: '#555' }}>R$ {fmt(normal)}</span>
                                  <span className="text-xs font-bold px-2 py-0.5 rounded-full"
                                    style={{ backgroundColor: '#4ade8022', color: '#4ade80', border: '1px solid #4ade8044' }}>
                                    -{pct}% · Economia de R$ {fmt(economia)}
                                  </span>
                                </div>
                              )}
                              <LucroBloco valor={promocaoLive} />
                            </div>
                          )
                        })()}

                        {/* Adicionar promoção (gestor) — quando ainda não há promoção */}
                        {cargo === 'gestor'
                          && !(produto.promocao && Number(produto.promocao) > 0)
                          && !(inlineEdit?.produtoId === produto.id && inlineEdit.campo === 'promocao') && (
                          <button onClick={() => iniciarInline(produto.id, 'promocao', '')}
                            className="self-start flex items-center gap-1 text-xs font-medium px-2.5 py-1 rounded-lg border transition-all"
                            style={{ borderColor: '#60a5fa44', color: '#60a5fa', backgroundColor: '#60a5fa11' }}
                            onMouseEnter={e => e.currentTarget.style.borderColor = '#60a5fa'}
                            onMouseLeave={e => e.currentTarget.style.borderColor = '#60a5fa44'}>
                            + Adicionar promoção
                          </button>
                        )}

                        {/* Promo parcelada */}
                        {produto.promocao_sem_juros && (() => {
                          const FALLBACK: Record<number, number> = {
                            1:2.49,2:3.99,3:5.49,4:6.99,5:8.49,6:9.99,
                            7:10.49,8:10.99,9:11.49,10:11.99,11:12.49,12:14.00,18:17.00,21:19.00
                          }
                          const psjParcelas = produto.promocao_sem_juros.parcelas
                          const jurosPsj    = juros.find(j => j.parcelas === psjParcelas)
                          const taxa        = jurosPsj?.taxa_operadora ?? FALLBACK[psjParcelas] ?? 14
                          const recebido    = psjValorLive * (1 - taxa / 100)
                          const custo       = attr.custo_total ?? 0
                          const lsNF        = recebido - custo
                          const lcNF        = recebido * 0.92 - custo
                          const corL        = (v: number) => v >= 0 ? '#4ade80' : '#f87171'
                          const economiaV   = valorLive - psjValorLive
                          const pctV        = economiaV > 0 ? Math.round((economiaV / valorLive) * 100) : 0
                          return (
                            <div className="rounded-xl p-3" style={{ backgroundColor: '#4ade8011', border: '1px solid #4ade8033' }}>
                              {/* Header */}
                              <div className="flex items-center justify-between mb-2">
                                <div className="flex items-center gap-2">
                                  <span className="text-xs font-medium uppercase tracking-wide" style={{ color: '#555' }}>Promo parcelada</span>
                                  {cargo === 'gestor' && (
                                    <button onClick={() => removerCampo(produto.id, 'promocao_sem_juros')}
                                      className="text-xs px-1.5 py-0.5 rounded-md leading-none transition-all"
                                      style={{ color: '#f87171', backgroundColor: '#f8717115', border: '1px solid #f8717133' }}
                                      title="Remover promo parcelada">
                                      ×
                                    </button>
                                  )}
                                </div>
                                <span className="text-xs font-bold px-2 py-0.5 rounded-full"
                                  style={{ backgroundColor: '#4ade8022', color: '#4ade80', border: '1px solid #4ade8044' }}>
                                  até {psjParcelas}x
                                </span>
                              </div>

                              {/* Valor */}
                              <div className="flex items-center justify-between">
                                <p className="text-lg font-bold text-white">
                                  {psjParcelas}x de <span style={{ color: '#4ade80' }}>R$ {fmt(psjValorLive / psjParcelas)}</span>
                                </p>
                                <div className="text-right">
                                  <p className="text-xs" style={{ color: '#555' }}>Total</p>
                                  <span className="text-sm font-bold" style={{ color: '#4ade80' }}>R$ {fmt(psjValorLive)}</span>
                                </div>
                              </div>

                              {/* Badge economia (vendedor) */}
                              {cargo === 'vendedor' && economiaV > 0 && (
                                <div className="flex items-center gap-2 mt-2">
                                  <span className="text-xs line-through" style={{ color: '#555' }}>R$ {fmt(valorLive)}</span>
                                  <span className="text-xs font-bold px-2 py-0.5 rounded-full"
                                    style={{ backgroundColor: '#4ade8022', color: '#4ade80', border: '1px solid #4ade8044' }}>
                                    -{pctV}% · Economia de R$ {fmt(economiaV)}
                                  </span>
                                </div>
                              )}

                              {/* Lucros (gestor) */}
                              {temCusto && (
                                <div className="flex gap-3 justify-end mt-2 pt-2 border-t" style={{ borderColor: '#4ade8022' }}>
                                  <span className="text-xs" style={{ color: '#444' }}>
                                    s/NF: <span style={{ color: corL(lsNF) }}>R$ {fmt(lsNF)}</span>
                                  </span>
                                  <span className="text-xs" style={{ color: '#444' }}>
                                    c/NF: <span style={{ color: lcNF >= 0 ? '#fb923c' : '#f87171' }}>R$ {fmt(lcNF)}</span>
                                  </span>
                                </div>
                              )}
                            </div>
                          )
                        })()}
                      </div>
                    )
                  })()}

                  {/* Sem preço ainda */}
                  {(!produto.valor || produto.valor === 0) && (
                    <div className="px-5 py-4">
                      <p className="text-sm" style={{ color: '#555' }}>Preço não definido</p>
                    </div>
                  )}

                  {/* ── IMEI (sempre visível) ── */}
                  {attr.imei && (
                    <div className="mx-5 mb-2 flex items-center gap-2">
                      <span className="text-xs font-medium" style={{ color: '#555' }}>IMEI:</span>
                      <span className="text-xs font-mono" style={{ color: '#888' }}>{attr.imei}</span>
                    </div>
                  )}

                  {/* ── Conteúdo expandido (parcelas + ações) ── */}
                  {cardExpandido === produto.id && <>

                  {/* ── Observações (vendedor) ── */}
                  {cargo === 'vendedor' && produto.observacoes && (
                    <div className="mx-5 mb-3 px-4 py-3 rounded-xl"
                      style={{ backgroundColor: '#c8960c15', border: '1px solid #c8960c33' }}>
                      <p className="text-xs font-bold mb-1" style={{ color: '#c8960c' }}>📋 Observações</p>
                      <p className="text-sm" style={{ color: '#ccc' }}>{produto.observacoes}</p>
                    </div>
                  )}

                  {/* ── Reserva info (vendedor) ── */}
                  {cargo === 'vendedor' && produto.status === 'reservado' && (
                    <div className="mx-5 mb-3 px-4 py-3 rounded-xl"
                      style={{ backgroundColor: '#f59e0b15', border: '1px solid #f59e0b33' }}>
                      <p className="text-xs font-bold mb-1" style={{ color: '#f59e0b' }}>🔒 Reservado por {produto.reservado_por}</p>
                      {produto.data_reserva && <p className="text-xs mb-1" style={{ color: '#777' }}>em {produto.data_reserva}</p>}
                      {produto.reserva_observacao && <p className="text-sm" style={{ color: '#ccc' }}>{produto.reserva_observacao}</p>}
                    </div>
                  )}

                  {/* ── Venda pendente (vendedor) ── */}
                  {cargo === 'vendedor' && produto.status === 'vendido' && (
                    <div className="mx-5 mb-3 px-4 py-3 rounded-xl"
                      style={{ backgroundColor: '#fb923c15', border: '1px solid #fb923c33' }}>
                      <p className="text-xs font-bold mb-1" style={{ color: '#fb923c' }}>⏳ Aguardando confirmação do gestor</p>
                      {(produto.vendido_por_nome || produto.vendido_por) && (
                        <p className="text-xs font-medium" style={{ color: '#ccc' }}>
                          Vendido por: <span style={{ color: '#fb923c' }}>{produto.vendido_por_nome || produto.vendido_por}</span>
                        </p>
                      )}
                      {produto.data_venda && <p className="text-xs mt-0.5" style={{ color: '#777' }}>Registrado em {produto.data_venda}</p>}
                    </div>
                  )}


                  {/* Observações (destaque se existir) */}
                  {cargo !== 'vendedor' && produto.observacoes && (
                    <div className="mx-5 mb-3 rounded-xl px-4 py-3 flex gap-3 items-start"
                      style={{ backgroundColor: '#c8960c0d', border: '1px solid #c8960c30' }}>
                      <span className="text-base mt-0.5">📋</span>
                      <p className="text-sm leading-relaxed" style={{ color: '#ccc' }}>{produto.observacoes}</p>
                    </div>
                  )}

                  {/* ── Reserva info (gestor) ── */}
                  {cargo === 'gestor' && produto.status === 'reservado' && produto.reservado_por && (
                    <div className="mx-5 mb-3 px-4 py-3 rounded-xl"
                      style={{ backgroundColor: '#f59e0b15', border: '1px solid #f59e0b33' }}>
                      <p className="text-xs font-bold mb-1" style={{ color: '#f59e0b' }}>🔒 Reservado por {produto.reservado_por}</p>
                      {produto.data_reserva && <p className="text-xs mb-1" style={{ color: '#777' }}>em {produto.data_reserva}</p>}
                      {produto.reserva_observacao && <p className="text-sm" style={{ color: '#ccc' }}>{produto.reserva_observacao}</p>}
                    </div>
                  )}

                  {/* ── Venda pendente (gestor) ── */}
                  {cargo === 'gestor' && produto.status === 'vendido' && (
                    <div className="mx-5 mb-3 px-4 py-3 rounded-xl"
                      style={{ backgroundColor: '#fb923c15', border: '1px solid #fb923c44' }}>
                      <p className="text-xs font-bold mb-2" style={{ color: '#fb923c' }}>⏳ Pendente de confirmação</p>
                      {(produto.vendido_por_nome || produto.reservado_por) && (
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-xs" style={{ color: '#666' }}>Vendedor:</span>
                          <span className="text-xs font-semibold" style={{ color: '#fff' }}>
                            {produto.vendido_por_nome || produto.reservado_por}
                          </span>
                        </div>
                      )}
                      {produto.data_venda && (
                        <div className="flex items-center gap-2">
                          <span className="text-xs" style={{ color: '#666' }}>Data:</span>
                          <span className="text-xs" style={{ color: '#888' }}>{produto.data_venda}</span>
                        </div>
                      )}
                    </div>
                  )}


                  {/* ── Painel de venda confirmada (gestor · Histórico) ── */}
                  {cargo === 'gestor' && produto.status === 'confirmado' && (
                    <div className="mx-5 mb-4 rounded-xl overflow-hidden border"
                      style={{ borderColor: '#4ade8033', backgroundColor: '#4ade8008' }}>
                      {/* Header */}
                      <div className="px-4 py-2 flex items-center gap-2 border-b" style={{ borderColor: '#4ade8022', backgroundColor: '#4ade8015' }}>
                        <span className="text-sm">✅</span>
                        <span className="text-xs font-bold uppercase tracking-wide" style={{ color: '#4ade80' }}>Venda Confirmada</span>
                      </div>
                      {/* Detalhes */}
                      <div className="px-4 py-3 flex flex-col gap-1.5">
                        {(produto.vendido_por_nome || produto.reservado_por) && (
                          <div className="flex items-center justify-between">
                            <span className="text-xs" style={{ color: '#555' }}>Vendedor</span>
                            <span className="text-xs font-semibold" style={{ color: '#fff' }}>
                              👤 {produto.vendido_por_nome || produto.reservado_por}
                            </span>
                          </div>
                        )}
                        {produto.data_venda && (
                          <div className="flex items-center justify-between">
                            <span className="text-xs" style={{ color: '#555' }}>Data da venda</span>
                            <span className="text-xs" style={{ color: '#888' }}>
                              📅 {produto.data_venda}
                            </span>
                          </div>
                        )}
                        {produto.valor_venda && produto.valor_venda > 0 && (
                          <div className="flex items-center justify-between pt-1.5 mt-0.5 border-t" style={{ borderColor: '#4ade8022' }}>
                            <span className="text-xs" style={{ color: '#555' }}>Valor de venda</span>
                            <span className="text-sm font-bold" style={{ color: '#4ade80' }}>
                              R$ {fmt(produto.valor_venda)}
                            </span>
                          </div>
                        )}
                        {produto.valor_venda && produto.valor_venda > 0 && (produto.atributos?.custo_total ?? 0) > 0 && (() => {
                          const custo = produto.atributos!.custo_total!
                          const lsNF = produto.valor_venda - custo
                          const lcNF = produto.valor_venda *.92 - custo
                          return (
                            <div className="flex gap-3 justify-end pt-1.5 border-t" style={{ borderColor: '#4ade8015' }}>
                              <span className="text-xs" style={{ color: '#444' }}>
                                s/NF: <span style={{ color: lsNF >= 0 ? '#4ade80' : '#f87171' }}>R$ {fmt(lsNF)}</span>
                              </span>
                              <span className="text-xs" style={{ color: '#444' }}>
                                c/NF: <span style={{ color: lcNF >= 0 ? '#fb923c' : '#f87171' }}>R$ {fmt(lcNF)}</span>
                              </span>
                            </div>
                          )
                        })()}
                      </div>
                    </div>
                  )}

                  {/* ── Botões de Ação ── */}
                  <div className="px-5 pb-5 pt-3 border-t" style={{ borderColor: '#1f1f1f' }}>

                    {/* Simulação de venda (acima de reserva/venda) */}
                    {simulacoes[produto.id] ? (
                      <div className="w-full mb-2 rounded-xl border p-3" style={{ borderColor: '#c8960c44', backgroundColor: '#c8960c0d' }}>
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-xs font-bold" style={{ color: '#c8960c' }}>🧮 Minha simulação</span>
                          {simulacoes[produto.id].valor_a_pagar != null && (
                            <span className="text-sm font-bold text-white">R$ {fmt(Number(simulacoes[produto.id].valor_a_pagar))}</span>
                          )}
                        </div>
                        <p className="text-xs mb-2" style={{ color: '#888' }}>
                          Cliente: <span style={{ color: '#ccc' }}>{simulacoes[produto.id].cliente_nome}</span>
                          {simulacoes[produto.id].forma_pagamento === 'parcelado' && (simulacoes[produto.id].parcelas ?? 0) > 0
                            ? ` · ${simulacoes[produto.id].parcelas}x`
                            : simulacoes[produto.id].forma_pagamento === 'a_vista' ? ' · à vista' : ''}
                          {Number(simulacoes[produto.id].troca_valor) > 0 ? ` · troca R$ ${fmt(Number(simulacoes[produto.id].troca_valor))}` : ''}
                        </p>
                        <div className="flex gap-2">
                          <button onClick={() => router.push(`/dashboard/simulacao/${produto.id}`)}
                            className="flex-1 py-1.5 rounded-lg text-xs font-bold border transition-all"
                            style={{ borderColor: '#c8960c', color: '#c8960c', backgroundColor: '#c8960c11' }}>
                            Abrir
                          </button>
                          <button onClick={() => cancelarSimulacao(produto.id)}
                            className="flex-1 py-1.5 rounded-lg text-xs font-bold border transition-all"
                            style={{ borderColor: '#7f1d1d', color: '#f87171', backgroundColor: '#f8717110' }}>
                            Cancelar
                          </button>
                        </div>
                      </div>
                    ) : produto.status === 'disponivel' ? (
                      <button onClick={() => router.push(`/dashboard/simulacao/${produto.id}`)}
                        className="w-full mb-2 py-2 rounded-xl text-xs font-bold border transition-all"
                        style={{ borderColor: '#c8960c44', color: '#c8960c', backgroundColor: '#c8960c11' }}
                        onMouseEnter={e => { e.currentTarget.style.backgroundColor = '#c8960c22'; e.currentTarget.style.borderColor = '#c8960c' }}
                        onMouseLeave={e => { e.currentTarget.style.backgroundColor = '#c8960c11'; e.currentTarget.style.borderColor = '#c8960c44' }}>
                        🧮 Simulação
                      </button>
                    ) : null}

                    {/* Vendedor: disponível */}
                    {cargo === 'vendedor' && produto.status === 'disponivel' && (
                      <div className="flex gap-2">
                        <button onClick={() => setModalReserva(produto.id)}
                          className="flex-1 py-2.5 rounded-xl text-xs font-bold border transition-all"
                          style={{ backgroundColor: '#f59e0b18', color: '#f59e0b', border: '1px solid #f59e0b44' }}
                          onMouseEnter={e => e.currentTarget.style.backgroundColor = '#f59e0b28'}
                          onMouseLeave={e => e.currentTarget.style.backgroundColor = '#f59e0b18'}>
                          🔒 Reservar
                        </button>
                        <button onClick={() => (() => { setValorVendaVendedor(''); setValorEntradaVendedor(''); setValorBaseVendedor(''); setDescontoVendedor(''); setFormaPagamento('a_vista'); setParcelasVenda(2); setModalVendaVendedor(produto.id) })()}
                          className="flex-1 py-2.5 rounded-xl text-xs font-bold transition-all"
                          style={{ backgroundColor: '#4ade8022', color: '#4ade80', border: '1px solid #4ade8044' }}
                          onMouseEnter={e => e.currentTarget.style.backgroundColor = '#4ade8035'}
                          onMouseLeave={e => e.currentTarget.style.backgroundColor = '#4ade8022'}>
                          ✅ Vendi!
                        </button>
                      </div>
                    )}

                    {/* Vendedor: reservado por mim */}
                    {cargo === 'vendedor' && produto.status === 'reservado' && produto.reservado_por === nomeUsuario && (
                      <div className="flex gap-2">
                        <button onClick={() => cancelarReserva(produto.id)}
                          className="flex-1 py-2.5 rounded-xl text-xs font-bold border transition-all"
                          style={{ backgroundColor: '#f8717110', color: '#f87171', border: '1px solid #f8717133' }}>
                          ↩️ Cancelar reserva
                        </button>
                        <button onClick={() => (() => { setValorVendaVendedor(''); setValorEntradaVendedor(''); setValorBaseVendedor(''); setDescontoVendedor(''); setFormaPagamento('a_vista'); setParcelasVenda(2); setModalVendaVendedor(produto.id) })()}
                          className="flex-1 py-2.5 rounded-xl text-xs font-bold transition-all"
                          style={{ backgroundColor: '#4ade8022', color: '#4ade80', border: '1px solid #4ade8044' }}>
                          ✅ Vendi!
                        </button>
                      </div>
                    )}

                    {/* Vendedor: reservado por outro — apenas info */}
                    {cargo === 'vendedor' && produto.status === 'reservado' && produto.reservado_por !== nomeUsuario && (
                      <p className="text-xs text-center" style={{ color: '#555' }}>Reservado por {produto.reservado_por}</p>
                    )}

                    {/* Gestor: disponível */}
                    {cargo === 'gestor' && produto.status === 'disponivel' && (
                      <button onClick={() => { setModalVenda(produto.id); setCardExpandido(null) }}
                        className="w-full py-2.5 rounded-xl text-xs font-bold transition-all"
                        style={{ backgroundColor: '#4ade8022', color: '#4ade80', border: '1px solid #4ade8044' }}
                        onMouseEnter={e => e.currentTarget.style.backgroundColor = '#4ade8035'}
                        onMouseLeave={e => e.currentTarget.style.backgroundColor = '#4ade8022'}>
                        ✅ Registrar venda direta
                      </button>
                    )}

                    {/* Gestor: reservado */}
                    {cargo === 'gestor' && produto.status === 'reservado' && (
                      <div className="flex gap-2">
                        <button onClick={() => cancelarReserva(produto.id)}
                          className="flex-1 py-2.5 rounded-xl text-xs font-bold border"
                          style={{ backgroundColor: '#f8717110', color: '#f87171', border: '1px solid #f8717133' }}>
                          ↩️ Cancelar reserva
                        </button>
                        <button onClick={() => { setModalVenda(produto.id); setCardExpandido(null) }}
                          className="flex-1 py-2.5 rounded-xl text-xs font-bold"
                          style={{ backgroundColor: '#4ade8022', color: '#4ade80', border: '1px solid #4ade8044' }}>
                          ✅ Confirmar venda
                        </button>
                      </div>
                    )}

                    {/* Gestor: vendido pendente */}
                    {cargo === 'gestor' && produto.status === 'vendido' && (
                      <button onClick={() => { setModalConfirmar(produto.id); setCardExpandido(null) }}
                        className="w-full py-2.5 rounded-xl text-xs font-bold transition-all"
                        style={{ backgroundColor: '#fb923c22', color: '#fb923c', border: '1px solid #fb923c44' }}
                        onMouseEnter={e => e.currentTarget.style.backgroundColor = '#fb923c35'}
                        onMouseLeave={e => e.currentTarget.style.backgroundColor = '#fb923c22'}>
                        ⏳ Confirmar saída
                      </button>
                    )}

                    {/* Chat */}
                    <button onClick={() => setModalChat(produto.id)}
                      className="w-full mt-2 py-2 rounded-xl text-xs font-medium border transition-all"
                      style={{ borderColor: '#60a5fa33', color: '#60a5fa88', backgroundColor: 'transparent' }}
                      onMouseEnter={e => { e.currentTarget.style.backgroundColor = '#60a5fa11'; e.currentTarget.style.color = '#60a5fa' }}
                      onMouseLeave={e => { e.currentTarget.style.backgroundColor = 'transparent'; e.currentTarget.style.color = '#60a5fa88' }}>
                      💬 Chat do produto
                    </button>

                    {/* Editar produto (gestor) */}
                    {cargo === 'gestor' && (
                      <button onClick={() => router.push(`/dashboard/editar-produto/${produto.id}`)}
                        className="w-full mt-1 py-2 rounded-xl text-xs font-medium border transition-all"
                        style={{ borderColor: '#2a2a2a', color: '#555', backgroundColor: 'transparent' }}
                        onMouseEnter={e => { e.currentTarget.style.borderColor = '#c8960c55'; e.currentTarget.style.color = '#c8960c' }}
                        onMouseLeave={e => { e.currentTarget.style.borderColor = '#2a2a2a'; e.currentTarget.style.color = '#555' }}>
                        ✏️ Editar produto
                      </button>
                    )}
                  </div>

                  </> /* fim cardExpandido */}
                </div>
              )
            })}
          </div>
        )}
      </main>

      {/* ═══ Modal: Registrar Venda ═══ */}
      {modalVenda && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4"
          style={{ backgroundColor: '#000000cc' }}
          onClick={() => setModalVenda(null)}>
          <div className="rounded-2xl border p-6 w-full max-w-md"
            style={{ backgroundColor: '#111', borderColor: '#2a2a2a' }}
            onClick={e => e.stopPropagation()}>
            <h3 className="text-lg font-bold text-white mb-1">Registrar Venda</h3>
            <p className="text-sm mb-5" style={{ color: '#666' }}>
              {(() => {
                const p = produtos.find(x => x.id === modalVenda)
                return p ? `${p.modelo} · ${p.atributos?.gb} · ${p.atributos?.cor}` : ''
              })()}
            </p>
            {vendedores.length > 0 && (
              <div className="mb-4">
                <label className="text-sm mb-1 block" style={{ color: '#aaa' }}>Quem realizou a venda?</label>
                <select value={vendedorSelecionado} onChange={e => setVendedorSelecionado(e.target.value)}
                  className="w-full rounded-xl px-4 py-3 text-white border outline-none"
                  style={{ backgroundColor: '#1a1a1a', borderColor: '#2a2a2a' }}>
                  <option value="">Gestor (eu mesmo)</option>
                  {vendedores.map(v => <option key={v.id} value={v.id}>{v.nome}</option>)}
                </select>
              </div>
            )}
            <div className="mb-6">
              <label className="text-sm mb-1 block" style={{ color: '#aaa' }}>Data da venda</label>
              <input type="date" value={dataVenda} onChange={e => setDataVenda(e.target.value)}
                className="w-full rounded-xl px-4 py-3 text-white border outline-none"
                style={{ backgroundColor: '#1a1a1a', borderColor: '#2a2a2a', colorScheme: 'dark' }} />
            </div>
            <div className="flex gap-3">
              <button onClick={() => setModalVenda(null)}
                className="flex-1 py-3 rounded-xl border text-sm font-medium"
                style={{ borderColor: '#2a2a2a', color: '#666', backgroundColor: '#1a1a1a' }}>
                Cancelar
              </button>
              <button onClick={confirmarVenda} disabled={salvandoVenda}
                className="flex-1 py-3 rounded-xl text-sm font-bold disabled:opacity-50"
                style={{ backgroundColor: '#4ade80', color: '#000' }}>
                {salvandoVenda ? 'Salvando...' : '✅ Confirmar Venda'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ═══ Modal: Reservar (vendedor) ═══ */}
      {modalReserva && (() => {
        const p = produtos.find(x => x.id === modalReserva)
        const sinalNum = parseBRL(reservaSinal)
        const sinalValido = !isNaN(sinalNum) && sinalNum >= 100
        const sinalDigitado = reservaSinal.trim() !== ''
        return (
          <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4"
            style={{ backgroundColor: '#000000cc' }}
            onClick={() => { setModalReserva(null); setReservaObs(''); setReservaSinal('') }}>
            <div className="rounded-2xl border p-6 w-full max-w-md"
              style={{ backgroundColor: '#111', borderColor: '#f59e0b33' }}
              onClick={e => e.stopPropagation()}>

              <div className="flex items-center gap-2 mb-1">
                <span className="text-2xl">🔒</span>
                <h3 className="text-lg font-bold text-white">Reservar Produto</h3>
              </div>
              <p className="text-sm mb-4" style={{ color: '#666' }}>
                {p ? `${p.modelo} · ${p.atributos?.gb ?? ''} · ${p.atributos?.cor ?? ''}` : ''}
              </p>

              {/* Aviso de política */}
              <div className="mb-4 px-4 py-3 rounded-xl flex gap-3"
                style={{ backgroundColor: '#f59e0b0d', border: '1px solid #f59e0b33' }}>
                <span className="text-lg flex-shrink-0">⚠️</span>
                <div>
                  <p className="text-xs font-bold mb-0.5" style={{ color: '#f59e0b' }}>Política de reserva</p>
                  <p className="text-xs leading-relaxed" style={{ color: '#888' }}>
                    Reservas somente são permitidas mediante sinal mínimo de{' '}
                    <span className="font-bold text-white">R$ 100,00</span>.
                    Informe o valor recebido do cliente abaixo.
                  </p>
                </div>
              </div>

              {/* Sinal */}
              <div className="mb-3">
                <label className="text-sm font-medium mb-1 block" style={{ color: '#aaa' }}>
                  Valor do sinal recebido <span style={{ color: '#f87171' }}>*</span>
                </label>
                <div className="relative">
                  <span className="absolute left-4 top-1/2 -translate-y-1/2 text-sm font-bold" style={{ color: '#555' }}>R$</span>
                  <input
                    autoFocus
                    type="number"
                    value={reservaSinal}
                    onChange={e => setReservaSinal(e.target.value)}
                    placeholder="0,00"
                    className="w-full rounded-xl pl-10 pr-4 py-3 text-white border outline-none text-lg font-bold"
                    style={{
                      backgroundColor: '#1a1a1a',
                      borderColor: sinalDigitado ? (sinalValido ? '#4ade8055' : '#f8717155') : '#2a2a2a',
                    }}
                  />
                </div>
                {sinalDigitado && !sinalValido && (
                  <p className="text-xs mt-1.5 px-1 font-medium" style={{ color: '#f87171' }}>
                    Sinal mínimo de R$ 100,00 obrigatório para reserva
                  </p>
                )}
                {sinalValido && (
                  <p className="text-xs mt-1.5 px-1 font-medium" style={{ color: '#4ade80' }}>
                    ✓ Sinal válido
                  </p>
                )}
              </div>

              {/* Observação */}
              <div className="mb-6">
                <label className="text-sm mb-1 block" style={{ color: '#aaa' }}>
                  Observação <span className="text-xs" style={{ color: '#555' }}>(nome do cliente, prazo, etc.)</span>
                </label>
                <textarea
                  value={reservaObs}
                  onChange={e => setReservaObs(e.target.value)}
                  rows={2}
                  placeholder="Ex: João Silva — buscar em 2 dias"
                  className="w-full rounded-xl px-4 py-3 text-white border outline-none resize-none text-sm"
                  style={{ backgroundColor: '#1a1a1a', borderColor: '#2a2a2a' }}
                />
              </div>

              <div className="flex gap-3">
                <button
                  onClick={() => { setModalReserva(null); setReservaObs(''); setReservaSinal('') }}
                  className="flex-1 py-3 rounded-xl border text-sm font-medium"
                  style={{ borderColor: '#2a2a2a', color: '#666', backgroundColor: '#1a1a1a' }}>
                  Cancelar
                </button>
                <button
                  onClick={salvarReserva}
                  disabled={salvandoReserva || !sinalValido}
                  className="flex-1 py-3 rounded-xl text-sm font-bold transition-all"
                  style={{
                    backgroundColor: sinalValido ? '#f59e0b' : '#2a2a2a',
                    color: sinalValido ? '#000' : '#555',
                    opacity: salvandoReserva ?.5 : 1,
                  }}>
                  {salvandoReserva ? 'Salvando...' : '🔒 Confirmar Reserva'}
                </button>
              </div>
            </div>
          </div>
        )
      })()}

      {/* ═══ Modal: Confirmar Venda (vendedor) ═══ */}
      {modalVendaVendedor && (() => {
        const p = produtos.find(x => x.id === modalVendaVendedor)
        const valorNum   = parseBRL(valorVendaVendedor)
        const entradaNum = parseBRL(valorEntradaVendedor)
        const valorOk    = !isNaN(valorNum) && valorNum > 0
        const entradaOk  = !isNaN(entradaNum) && entradaNum > 0

        // Cálculos do breakdown
        const usaParc = formaPagamento === 'parcelado' || formaPagamento === 'misto'
        const jP      = usaParc ? juros.find(j => j.parcelas === parcelasVenda) : null
        const taxa    = jP ? (jP.taxa_operadora ?? jP.taxa_comercial) : 0
        const parcelBase = formaPagamento === 'misto' ? (valorOk ? valorNum : 0) : (valorOk ? valorNum : 0)
        const taxaValor  = taxa > 0 && valorOk ? parcelBase * (taxa / 100) : 0
        const liquidoParc = parcelBase - taxaValor
        const totalBruto  = formaPagamento === 'misto' && entradaOk && valorOk
          ? entradaNum + valorNum : valorOk ? valorNum : 0
        const totalLiquido = formaPagamento === 'misto' && entradaOk && valorOk
          ? entradaNum + liquidoParc
          : formaPagamento === 'parcelado' ? liquidoParc : totalBruto

        // Habilitar confirmar
        const podeConfirmar =
          formaPagamento === 'misto'
            ? entradaOk && valorOk
            : valorOk

        const formaOpcoes: { key: FormaPagamento; label: string; emoji: string; desc: string }[] = [
          { key: 'a_vista',   label: 'À Vista',   emoji: '💵', desc: 'Dinheiro ou PIX' },
          { key: 'parcelado', label: 'Parcelado',  emoji: '💳', desc: 'Crédito na máquina' },
          { key: 'misto',     label: 'Entrada + parcelas', emoji: '💵+💳', desc: 'Parte à vista + parcelado' },
          { key: 'boleto',    label: 'Boleto',     emoji: '📄', desc: 'Boleto bancário' },
        ]

        function SeletorParcelas() {
          const opList = juros.length > 0
            ? juros
            : [2,3,4,5,6,7,8,9,10,12,18].map(n => ({ parcelas: n, taxa_comercial: 0, taxa_operadora: null }))
          return (
            <div>
              <p className="text-xs font-medium mb-1.5" style={{ color: '#777' }}>Nº de parcelas</p>
              <div className="flex flex-wrap gap-1.5">
                {opList.map(j => {
                  const ativo = parcelasVenda === j.parcelas
                  // Preview: se tiver base, mostra valor por parcela
                  const baseNum = parseFloat(valorBaseVendedor)
                  const descontoNum = parseBRL(descontoVendedor)
                  const gross = (!isNaN(baseNum) && baseNum > 0)
                    ? calcGrossFromBase(baseNum, descontoNum, formaPagamento, j.parcelas)
                    : (parseBRL(valorVendaVendedor))
                  const porParcela = gross > 0 && j.parcelas > 0 ? gross / j.parcelas : 0
                  return (
                    <button key={j.parcelas}
                      onClick={() => {
                        setParcelasVenda(j.parcelas)
                        const bn = parseFloat(valorBaseVendedor)
                        const dn = parseBRL(descontoVendedor)
                        if (!isNaN(bn) && bn > 0) {
                          const g = calcGrossFromBase(bn, dn, formaPagamento, j.parcelas)
                          setValorVendaVendedor(String(g))
                        }
                      }}
                      className="px-2.5 py-1.5 rounded-lg border text-xs font-bold transition-all"
                      style={{
                        backgroundColor: ativo ? '#4ade8022' : '#1a1a1a',
                        borderColor:     ativo ? '#4ade80'   : '#2a2a2a',
                        color:           ativo ? '#4ade80'   : '#666',
                      }}>
                      {j.parcelas}x
                    </button>
                  )
                })}
              </div>
            </div>
          )
        }

        function CampoValor({ label, aviso, value, onChange }: {
          label: string; aviso?: string; value: string; onChange: (v: string) => void
        }) {
          const n = parseBRL(value)
          const ok = !isNaN(n) && n > 0
          return (
            <div>
              <p className="text-xs font-medium mb-1" style={{ color: '#777' }}>{label}</p>
              {aviso && <p className="text-xs mb-1.5 font-medium" style={{ color: '#f59e0b' }}>{aviso}</p>}
              <div className="relative">
                <span className="absolute left-4 top-1/2 -translate-y-1/2 font-bold" style={{ color: '#444' }}>R$</span>
                <input
                  type="text" inputMode="decimal" value={value}
                  onChange={e => {
                    // aceita apenas dígitos, vírgula e ponto
                    const v = e.target.value.replace(/[^\d.,]/g, '')
                    onChange(v)
                  }}
                  placeholder="0,00"
                  className="w-full rounded-xl pl-10 pr-4 py-3 text-white border outline-none text-xl font-bold"
                  style={{ backgroundColor: '#1a1a1a', borderColor: ok ? '#4ade8055' : '#2a2a2a' }}
                />
              </div>
            </div>
          )
        }

        function Breakdown() {
          if (!valorOk) return null
          if (formaPagamento === 'misto' && !entradaOk) return null

          const ehSimples    = formaPagamento === 'a_vista' || formaPagamento === 'boleto'
          const porParcela   = parcelasVenda > 0 ? valorNum / parcelasVenda : 0
          // À vista / boleto: só mostra "Empresa recebe"
          if (ehSimples) {
            return (
              <div className="rounded-xl overflow-hidden border" style={{ borderColor: '#2a2a2a' }}>
                <div className="px-4 py-2.5 flex justify-between items-center" style={{ backgroundColor: '#4ade8010' }}>
                  <span className="text-xs font-bold" style={{ color: '#4ade80' }}>Empresa recebe</span>
                  <span className="text-base font-bold" style={{ color: '#4ade80' }}>R$ {fmt(valorNum)}</span>
                </div>
              </div>
            )
          }

          return (
            <div className="rounded-xl overflow-hidden border" style={{ borderColor: '#2a2a2a' }}>
              {/* Falar pro cliente */}
              <div className="px-4 py-2.5 flex items-center justify-between" style={{ backgroundColor: '#1a1a1a', borderBottom: '1px solid #222' }}>
                <span className="text-xs font-bold" style={{ color: '#aaa' }}>Falar pro cliente:</span>
                <div className="text-right">
                  <span className="text-base font-bold text-white">{parcelasVenda}x de R$ {fmt(porParcela)}</span>
                  {formaPagamento === 'misto' && (
                    <p className="text-xs" style={{ color: '#666' }}>+ R$ {fmt(entradaNum)} entrada</p>
                  )}
                </div>
              </div>

              {formaPagamento === 'misto' && (
                <div className="px-4 py-2 flex justify-between items-center border-b" style={{ borderColor: '#1a1a1a', backgroundColor: '#161616' }}>
                  <span className="text-xs" style={{ color: '#666' }}>Entrada à vista</span>
                  <span className="text-sm font-bold text-white">R$ {fmt(entradaNum)}</span>
                </div>
              )}
              <div className="px-4 py-2 flex justify-between items-center border-b" style={{ borderColor: '#1a1a1a', backgroundColor: '#161616' }}>
                <span className="text-xs" style={{ color: '#666' }}>
                  {formaPagamento === 'misto' ? 'Parcelado (bruto)' : 'Total na máquina'}
                </span>
                <span className="text-sm font-bold text-white">R$ {fmt(valorNum)}</span>
              </div>
              {taxa > 0 && (
                <div className="px-4 py-2 flex justify-between items-center border-b" style={{ borderColor: '#1a1a1a', backgroundColor: '#111' }}>
                  <span className="text-xs" style={{ color: '#f87171' }}>Taxa maquininha ({taxa}%)</span>
                  <span className="text-sm font-bold" style={{ color: '#f87171' }}>− R$ {fmt(taxaValor)}</span>
                </div>
              )}
              {formaPagamento === 'misto' && (
                <div className="px-4 py-2 flex justify-between items-center border-b" style={{ borderColor: '#1a1a1a', backgroundColor: '#111' }}>
                  <span className="text-xs" style={{ color: '#666' }}>Total bruto</span>
                  <span className="text-sm font-bold text-white">R$ {fmt(totalBruto)}</span>
                </div>
              )}
              <div className="px-4 py-2.5 flex justify-between items-center" style={{ backgroundColor: '#4ade8010' }}>
                <span className="text-xs font-bold" style={{ color: '#4ade80' }}>Empresa recebe</span>
                <span className="text-base font-bold" style={{ color: '#4ade80' }}>R$ {fmt(totalLiquido)}</span>
              </div>
            </div>
          )
        }

        return (
          <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-3"
            style={{ backgroundColor: '#000000cc' }}
            onClick={resetModalVenda}>
            <div className="rounded-2xl border w-full max-w-sm flex flex-col"
              style={{ backgroundColor: '#111', borderColor: '#4ade8033', maxHeight: '90vh' }}
              onClick={e => e.stopPropagation()}>

              {/* Header fixo */}
              <div className="px-4 pt-4 pb-3 border-b flex-shrink-0" style={{ borderColor: '#1a1a1a' }}>
                <div className="flex items-center justify-between mb-1">
                  <div className="flex items-center gap-2">
                    <span>✅</span>
                    <h3 className="text-sm font-bold text-white">Registrar Venda</h3>
                  </div>
                  <button onClick={resetModalVenda} className="text-lg leading-none" style={{ color: '#555' }}>×</button>
                </div>
                <p className="text-xs mb-2" style={{ color: '#555' }}>
                  {p ? `${p.modelo} · ${p.atributos?.gb ?? ''} · ${p.atributos?.cor ?? ''}` : ''}
                </p>

                {/* Chips de preço de referência */}
                {p && (
                  <div className="flex gap-1.5 flex-wrap items-center">
                    <span className="text-xs" style={{ color: '#444' }}>Base:</span>
                    {[
                      { label: 'Normal',  val: p.valor,       cor: '#aaa' },
                      ...(p.valor_avista && p.valor_avista !== p.valor
                        ? [{ label: 'À vista', val: p.valor_avista, cor: '#c8960c' }] : []),
                      ...(p.promocao && p.promocao > 0
                        ? [{ label: 'Promo',   val: p.promocao,     cor: '#60a5fa' }] : []),
                    ].map(ref => (
                      <button key={ref.label}
                        onClick={() => {
                          const descontoNum = parseBRL(descontoVendedor)
                          const gross = calcGrossFromBase(ref.val, descontoNum, formaPagamento, parcelasVenda)
                          setValorBaseVendedor(String(ref.val))
                          setValorVendaVendedor(String(gross))
                        }}
                        className="px-2 py-0.5 rounded-md border text-xs font-semibold"
                        style={{ borderColor: ref.cor + '44', color: ref.cor, backgroundColor: ref.cor + '11' }}>
                        {ref.label}: R$ {fmt(ref.val)}
                      </button>
                    ))}
                    {/* Desconto inline */}
                    <div className="flex items-center gap-1 ml-auto">
                      <span className="text-xs" style={{ color: '#444' }}>Desc:</span>
                      <div className="relative">
                        <span className="absolute left-2 top-1/2 -translate-y-1/2 text-xs" style={{ color: '#444' }}>R$</span>
                        <input
                          type="text" inputMode="decimal" value={descontoVendedor}
                          onChange={e => {
                            setDescontoVendedor(e.target.value)
                            const baseNum = parseFloat(valorBaseVendedor)
                            const desc = parseBRL(e.target.value)
                            if (!isNaN(baseNum) && baseNum > 0) {
                              setValorVendaVendedor(String(calcGrossFromBase(baseNum, desc, formaPagamento, parcelasVenda)))
                            }
                          }}
                          placeholder="0"
                          className="rounded-md pl-7 pr-2 py-1 text-white border outline-none text-xs w-20"
                          style={{ backgroundColor: '#1a1a1a', borderColor: descontoVendedor ? '#f59e0b55' : '#2a2a2a' }}
                        />
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Corpo scrollável */}
              <div className="px-4 py-3 flex flex-col gap-3 overflow-y-auto flex-1">

                {/* Forma de pagamento — tabs compactas */}
                <div className="flex gap-1.5 flex-wrap">
                  {formaOpcoes.map(op => {
                    const ativo = formaPagamento === op.key
                    return (
                      <button key={op.key}
                        onClick={() => {
                          setFormaPagamento(op.key)
                          const baseNum = parseFloat(valorBaseVendedor)
                          const descontoNum = parseBRL(descontoVendedor)
                          if (!isNaN(baseNum) && baseNum > 0) {
                            setValorVendaVendedor(String(calcGrossFromBase(baseNum, descontoNum, op.key, parcelasVenda)))
                          }
                        }}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-xs font-semibold transition-all"
                        style={{
                          backgroundColor: ativo ? '#4ade8018' : '#1a1a1a',
                          borderColor:     ativo ? '#4ade8055' : '#2a2a2a',
                          color:           ativo ? '#4ade80'   : '#666',
                        }}>
                        <span>{op.emoji}</span>
                        <span>{op.label}</span>
                      </button>
                    )
                  })}
                </div>

                {/* À Vista / Boleto */}
                {(formaPagamento === 'a_vista' || formaPagamento === 'boleto') && (
                  CampoValor({
                    label: formaPagamento === 'boleto' ? 'Valor do boleto' : 'Valor recebido',
                    value: valorVendaVendedor,
                    onChange: setValorVendaVendedor,
                  })
                )}

                {/* Parcelado */}
                {formaPagamento === 'parcelado' && (
                  <>
                    {CampoValor({
                      label: 'Total na maquininha (c/ juros)',
                      value: valorVendaVendedor,
                      onChange: (v: string) => { setValorVendaVendedor(v); setValorBaseVendedor('') },
                    })}
                    {SeletorParcelas()}
                    {Breakdown()}
                  </>
                )}

                {/* Misto */}
                {formaPagamento === 'misto' && (
                  <>
                    {CampoValor({
                      label: 'Entrada à vista',
                      value: valorEntradaVendedor,
                      onChange: setValorEntradaVendedor,
                    })}
                    {CampoValor({
                      label: 'Parcelado na maquininha (c/ juros)',
                      value: valorVendaVendedor,
                      onChange: (v: string) => { setValorVendaVendedor(v); setValorBaseVendedor('') },
                    })}
                    {SeletorParcelas()}
                    {Breakdown()}
                  </>
                )}
              </div>

              {/* Botões fixos no rodapé */}
              <div className="px-4 pb-4 pt-2 flex gap-2 flex-shrink-0 border-t" style={{ borderColor: '#1a1a1a' }}>
                <button onClick={resetModalVenda}
                  className="flex-1 py-3 rounded-xl border text-sm font-medium"
                  style={{ borderColor: '#2a2a2a', color: '#666', backgroundColor: '#1a1a1a' }}>
                  Cancelar
                </button>
                <button
                  onClick={confirmarVendaVendedor}
                  disabled={salvandoVendaVendedor || !podeConfirmar}
                  className="flex-1 py-3 rounded-xl text-sm font-bold transition-all"
                  style={{ backgroundColor: podeConfirmar ? '#4ade80' : '#2a2a2a', color: podeConfirmar ? '#000' : '#555' }}>
                  {salvandoVendaVendedor ? 'Enviando...' : '✅ Confirmar'}
                </button>
              </div>
            </div>
          </div>
        )
      })()}

      {/* ═══ Modal: Confirmar Saída (gestor) ═══ */}
      {modalConfirmar && (() => {
        const p = produtos.find(x => x.id === modalConfirmar)
        const vendedorNome = p?.vendido_por_nome || p?.reservado_por

        const formasG: { key: FormaPagamento; label: string; emoji: string }[] = [
          { key: 'a_vista',   label: 'À Vista',   emoji: '💵' },
          { key: 'parcelado', label: 'Parcelado',  emoji: '💳' },
          { key: 'misto',     label: 'Misto',      emoji: '💵+💳' },
          { key: 'boleto',    label: 'Boleto',     emoji: '📄' },
        ]

        const vNum = parseBRL(valorVendaConfirm)
        const eNum = parseBRL(entradaConfirm)
        const vOk  = !isNaN(vNum) && vNum > 0
        const eOk  = !isNaN(eNum) && eNum > 0
        const usaParc = formaConfirm === 'parcelado' || formaConfirm === 'misto'
        const jP = usaParc ? juros.find(j => j.parcelas === parcelasConfirm) : null
        const taxaG = jP ? (jP.taxa_operadora ?? jP.taxa_comercial) : 0
        const taxaValorG = taxaG > 0 && vOk ? vNum * (taxaG / 100) : 0
        const liquidoParc = vOk ? vNum - taxaValorG : 0
        const totalBrutoG = formaConfirm === 'misto' && eOk && vOk ? eNum + vNum : vOk ? vNum : 0
        const totalLiquidoG = formaConfirm === 'misto' && eOk && vOk
          ? eNum + liquidoParc
          : formaConfirm === 'parcelado' ? liquidoParc
          : totalBrutoG

        const custo = p?.atributos?.custo_total ?? 0
        const lucroG = totalLiquidoG > 0 && custo > 0 ? totalLiquidoG - custo : null

        return (
          <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4"
            style={{ backgroundColor: '#000000cc' }}
            onClick={resetModalConfirmar}>
            <div className="rounded-2xl border w-full max-w-md overflow-hidden"
              style={{ backgroundColor: '#111', borderColor: '#fb923c33' }}
              onClick={e => e.stopPropagation()}>

              {/* Header */}
              <div className="px-5 pt-5 pb-3 border-b" style={{ borderColor: '#1a1a1a' }}>
                <div className="flex items-start justify-between">
                  <div>
                    <div className="flex items-center gap-2 mb-0.5">
                      <span className="text-lg">📋</span>
                      <h3 className="text-base font-bold text-white">Confirmar Venda</h3>
                    </div>
                    <p className="text-xs" style={{ color: '#555' }}>
                      {p ? `${p.modelo} · ${p.atributos?.gb ?? ''} · ${p.atributos?.cor ?? ''}` : ''}
                    </p>
                  </div>
                  {p?.atributos?.custo_total && (
                    <span className="text-xs px-2 py-0.5 rounded-full" style={{ backgroundColor: '#2a2a2a', color: '#666' }}>
                      custo R$ {fmt(p.atributos.custo_total)}
                    </span>
                  )}
                </div>
              </div>

              <div className="px-5 py-4 flex flex-col gap-4 max-h-[70vh] overflow-y-auto">

                {/* Info vendedor + dados originais */}
                {vendedorNome && (
                  <div className="rounded-xl px-3 py-2.5 flex items-center gap-3" style={{ backgroundColor: '#f59e0b0f', border: '1px solid #f59e0b22' }}>
                    <span>👤</span>
                    <div className="flex-1">
                      <p className="text-xs font-bold text-white">{vendedorNome}</p>
                      {p?.forma_pagamento && (
                        <p className="text-xs" style={{ color: '#888' }}>
                          informou: {p.forma_pagamento === 'a_vista' ? 'à vista' : p.forma_pagamento === 'parcelado' ? `${p.parcelas_venda}x parcelado` : p.forma_pagamento}
                          {p.valor_venda ? ` · R$ ${fmt(p.valor_venda)}` : ''}
                        </p>
                      )}
                    </div>
                    {p?.data_venda && <p className="text-xs" style={{ color: '#555' }}>{p.data_venda}</p>}
                  </div>
                )}

                {/* Forma de pagamento */}
                <div>
                  <p className="text-xs font-medium mb-1.5" style={{ color: '#777' }}>Forma de pagamento</p>
                  <div className="grid grid-cols-4 gap-1.5">
                    {formasG.map(op => {
                      const ativo = formaConfirm === op.key
                      return (
                        <button key={op.key}
                          onClick={() => setFormaConfirm(op.key)}
                          className="flex flex-col items-center gap-0.5 py-2 rounded-xl border text-xs transition-all"
                          style={{
                            backgroundColor: ativo ? '#fb923c18' : '#1a1a1a',
                            borderColor:     ativo ? '#fb923c55' : '#2a2a2a',
                            color:           ativo ? '#fb923c'   : '#666',
                          }}>
                          <span className="text-base">{op.emoji}</span>
                          <span className="font-semibold leading-tight text-center">{op.label}</span>
                        </button>
                      )
                    })}
                  </div>
                </div>

                {/* Entrada (misto) */}
                {formaConfirm === 'misto' && (
                  <div>
                    <p className="text-xs font-medium mb-1" style={{ color: '#777' }}>Entrada à vista</p>
                    <div className="relative">
                      <span className="absolute left-4 top-1/2 -translate-y-1/2 font-bold text-sm" style={{ color: '#444' }}>R$</span>
                      <input type="number" value={entradaConfirm} onChange={e => setEntradaConfirm(e.target.value)}
                        placeholder="0,00" className="w-full rounded-xl pl-10 pr-4 py-3 text-white border outline-none text-lg font-bold"
                        style={{ backgroundColor: '#1a1a1a', borderColor: eOk ? '#fb923c55' : '#2a2a2a' }} />
                    </div>
                  </div>
                )}

                {/* Valor principal */}
                <div>
                  <p className="text-xs font-medium mb-1" style={{ color: '#777' }}>
                    {formaConfirm === 'misto' ? 'Parcelado na máquina (bruto)' :
                     formaConfirm === 'parcelado' ? 'Total na máquina (com juros)' :
                     'Valor recebido'}
                  </p>
                  <div className="relative">
                    <span className="absolute left-4 top-1/2 -translate-y-1/2 font-bold text-sm" style={{ color: '#444' }}>R$</span>
                    <input type="number" value={valorVendaConfirm} onChange={e => setValorVendaConfirm(e.target.value)}
                      placeholder="0,00" className="w-full rounded-xl pl-10 pr-4 py-3 text-white border outline-none text-lg font-bold"
                      style={{ backgroundColor: '#1a1a1a', borderColor: vOk ? '#fb923c55' : '#2a2a2a' }} />
                  </div>
                </div>

                {/* Parcelas */}
                {usaParc && (
                  <div>
                    <p className="text-xs font-medium mb-1.5" style={{ color: '#777' }}>Nº de parcelas</p>
                    <div className="flex flex-wrap gap-1.5">
                      {(juros.length > 0 ? juros : [2,3,4,5,6,7,8,9,10,12,18].map(n => ({ parcelas: n, taxa_comercial: 0, taxa_operadora: null }))).map(j => {
                        const ativo = parcelasConfirm === j.parcelas
                        return (
                          <button key={j.parcelas}
                            onClick={() => setParcelasConfirm(j.parcelas)}
                            className="w-11 h-9 rounded-lg border text-xs font-bold transition-all"
                            style={{
                              backgroundColor: ativo ? '#fb923c22' : '#1a1a1a',
                              borderColor:     ativo ? '#fb923c'   : '#2a2a2a',
                              color:           ativo ? '#fb923c'   : '#666',
                            }}>
                            {j.parcelas}x
                          </button>
                        )
                      })}
                    </div>
                  </div>
                )}

                {/* Breakdown gestor */}
                {vOk && usaParc && (
                  <div className="rounded-xl overflow-hidden border" style={{ borderColor: '#2a2a2a' }}>
                    <div className="px-4 py-2.5 flex items-center justify-between" style={{ backgroundColor: '#1a1a1a', borderBottom: '1px solid #222' }}>
                      <span className="text-xs font-bold" style={{ color: '#aaa' }}>Por parcela</span>
                      <span className="text-base font-bold text-white">{parcelasConfirm}x de R$ {fmt(vNum / parcelasConfirm)}</span>
                    </div>
                    {formaConfirm === 'misto' && eOk && (
                      <div className="px-4 py-2 flex justify-between border-b" style={{ borderColor: '#1a1a1a', backgroundColor: '#161616' }}>
                        <span className="text-xs" style={{ color: '#666' }}>Entrada</span>
                        <span className="text-sm font-bold text-white">R$ {fmt(eNum)}</span>
                      </div>
                    )}
                    {taxaG > 0 && (
                      <div className="px-4 py-2 flex justify-between border-b" style={{ borderColor: '#1a1a1a', backgroundColor: '#111' }}>
                        <span className="text-xs" style={{ color: '#f87171' }}>Taxa ({taxaG}%)</span>
                        <span className="text-sm font-bold" style={{ color: '#f87171' }}>− R$ {fmt(taxaValorG)}</span>
                      </div>
                    )}
                    <div className="px-4 py-2.5 flex justify-between" style={{ backgroundColor: '#fb923c10' }}>
                      <span className="text-xs font-bold" style={{ color: '#fb923c' }}>Empresa recebe</span>
                      <span className="text-sm font-bold" style={{ color: '#fb923c' }}>R$ {fmt(totalLiquidoG)}</span>
                    </div>
                  </div>
                )}

                {/* Lucro preview */}
                {totalLiquidoG > 0 && custo > 0 && (
                  <div className="flex gap-3 px-1">
                    <div>
                      <p className="text-xs" style={{ color: '#555' }}>Lucro líquido</p>
                      <p className="text-sm font-bold" style={{ color: lucroG !== null && lucroG >= 0 ? '#4ade80' : '#f87171' }}>
                        R$ {fmt(lucroG ?? 0)}
                      </p>
                    </div>
                    {totalBrutoG > 0 && custo > 0 && (
                      <div>
                        <p className="text-xs" style={{ color: '#555' }}>Margem</p>
                        <p className="text-sm font-bold" style={{ color: '#aaa' }}>
                          {(((totalLiquidoG - custo) / custo) * 100).toFixed(1)}%
                        </p>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Formulário de devolução */}
              {showDevolucao && (
                <div className="mx-5 mb-2 rounded-xl border p-3 flex flex-col gap-2" style={{ backgroundColor: '#f871710d', borderColor: '#f8717133' }}>
                  <p className="text-xs font-bold" style={{ color: '#f87171' }}>↩️ Devolver para estoque</p>
                  <input
                    type="text"
                    value={motivoDevolucao}
                    onChange={e => setMotivoDevolucao(e.target.value)}
                    placeholder="Motivo da devolução (opcional)"
                    className="w-full rounded-lg px-3 py-2 text-sm text-white border outline-none"
                    style={{ backgroundColor: '#1a1a1a', borderColor: '#2a2a2a' }}
                  />
                  <div className="flex gap-2">
                    <button onClick={() => { setShowDevolucao(false); setMotivoDevolucao('') }}
                      className="flex-1 py-1.5 rounded-lg text-xs border" style={{ borderColor: '#2a2a2a', color: '#666' }}>
                      Cancelar
                    </button>
                    <button onClick={devolverVenda} disabled={devolvendo}
                      className="flex-1 py-1.5 rounded-lg text-xs font-bold disabled:opacity-40"
                      style={{ backgroundColor: '#f87171', color: '#000' }}>
                      {devolvendo ? 'Devolvendo...' : 'Confirmar devolução'}
                    </button>
                  </div>
                </div>
              )}

              {/* Botões */}
              <div className="px-5 pb-5 pt-3 flex gap-2 border-t" style={{ borderColor: '#1a1a1a' }}>
                <button onClick={resetModalConfirmar}
                  className="py-3 px-4 rounded-xl border text-sm font-medium"
                  style={{ borderColor: '#2a2a2a', color: '#666', backgroundColor: '#1a1a1a' }}>
                  Fechar
                </button>
                {!showDevolucao && (
                  <button onClick={() => setShowDevolucao(true)}
                    className="py-3 px-4 rounded-xl border text-sm font-medium transition-all"
                    style={{ borderColor: '#f8717133', color: '#f87171', backgroundColor: '#f871710a' }}>
                    ↩️ Devolver
                  </button>
                )}
                <button onClick={confirmarSaidaGestor} disabled={salvandoConfirmar || !vOk}
                  className="flex-1 py-3 rounded-xl text-sm font-bold disabled:opacity-50 transition-all"
                  style={{ backgroundColor: vOk ? '#4ade80' : '#2a2a2a', color: vOk ? '#000' : '#555' }}>
                  {salvandoConfirmar ? 'Confirmando...' : '✅ Confirmar e Arquivar'}
                </button>
              </div>
            </div>
          </div>
        )
      })()}

      {/* ═══ Modal: Chat por Produto ═══ */}
      {modalChat && (() => {
        const p = produtos.find(x => x.id === modalChat)
        const msgRef = { current: null as HTMLDivElement | null }

        function fmtHora(iso: string) {
          return new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
        }

        return (
          <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4"
            style={{ backgroundColor: '#000000cc' }}
            onClick={() => { setModalChat(null); setNovaMensagem('') }}>
            <div className="rounded-2xl border w-full max-w-md flex flex-col"
              style={{ backgroundColor: '#111', borderColor: '#60a5fa33', height: '80vh', maxHeight: 640 }}
              onClick={e => e.stopPropagation()}>

              {/* Header */}
              <div className="px-5 py-4 border-b flex items-start justify-between flex-shrink-0" style={{ borderColor: '#1a1a1a' }}>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-base">💬</span>
                    <h3 className="text-sm font-bold text-white">Chat do Produto</h3>
                  </div>
                  <p className="text-xs mt-0.5" style={{ color: '#555' }}>
                    {p ? `${p.modelo} · ${p.atributos?.gb ?? ''} · ${p.atributos?.cor ?? ''}` : ''}
                  </p>
                  {p && (
                    <div className="flex items-center gap-3 mt-1.5 flex-wrap">
                      {p.atributos?.imei && (
                        <span className="text-xs px-2 py-0.5 rounded-lg font-mono"
                          style={{ backgroundColor: '#1a1a1a', color: '#888', border: '1px solid #2a2a2a' }}>
                          IMEI: {p.atributos.imei}
                        </span>
                      )}
                      {p.valor && (
                        <span className="text-xs px-2 py-0.5 rounded-lg font-semibold"
                          style={{ backgroundColor: '#4ade8015', color: '#4ade80', border: '1px solid #4ade8033' }}>
                          {Number(p.valor).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                        </span>
                      )}
                    </div>
                  )}
                </div>
                <button onClick={() => { setModalChat(null); setNovaMensagem('') }}
                  className="text-lg" style={{ color: '#444' }}>✕</button>
              </div>

              {/* Mensagens */}
              <div className="flex-1 overflow-y-auto px-4 py-3 flex flex-col gap-2"
                ref={el => {
                  if (el) el.scrollTop = el.scrollHeight
                }}>
                {carregandoChat && (
                  <div className="flex items-center justify-center py-8">
                    <div className="w-6 h-6 rounded-full border-2 animate-spin"
                      style={{ borderColor: '#60a5fa', borderTopColor: 'transparent' }} />
                  </div>
                )}
                {!carregandoChat && mensagensChat.length === 0 && (
                  <div className="flex flex-col items-center justify-center py-12 gap-2">
                    <span className="text-3xl">💬</span>
                    <p className="text-sm" style={{ color: '#444' }}>Nenhuma mensagem ainda</p>
                    <p className="text-xs" style={{ color: '#333' }}>Use o chat para negociar ou tirar dúvidas com o gestor</p>
                  </div>
                )}
                {mensagensChat.map(msg => {
                  const ehSistema  = msg.tipo === 'sistema'
                  const ehMinha    = msg.autor_id === userId
                  const ehGestorMsg = msg.autor_cargo === 'gestor'

                  if (ehSistema) {
                    return (
                      <div key={msg.id} className="flex items-center gap-2 my-1">
                        <div className="flex-1 h-px" style={{ backgroundColor: '#1f1f1f' }} />
                        <span className="text-xs px-2 py-0.5 rounded-full flex-shrink-0"
                          style={{ backgroundColor: '#1a1a1a', color: '#555' }}>
                          {msg.mensagem}
                        </span>
                        <div className="flex-1 h-px" style={{ backgroundColor: '#1f1f1f' }} />
                      </div>
                    )
                  }

                  return (
                    <div key={msg.id} className={`flex flex-col gap-0.5 ${ehMinha ? 'items-end' : 'items-start'}`}>
                      {!ehMinha && (
                        <span className="text-xs px-1" style={{ color: ehGestorMsg ? '#fb923c' : '#60a5fa' }}>
                          {msg.autor_nome} · {msg.autor_cargo}
                        </span>
                      )}
                      <div className="max-w-[80%] px-3.5 py-2.5 rounded-2xl text-sm"
                        style={{
                          backgroundColor: ehMinha ? '#4ade8022' : (ehGestorMsg ? '#fb923c15' : '#1a1a1a'),
                          border: `1px solid ${ehMinha ? '#4ade8033' : (ehGestorMsg ? '#fb923c33' : '#2a2a2a')}`,
                          color: '#ddd',
                          borderBottomRightRadius: ehMinha ? 4 : undefined,
                          borderBottomLeftRadius:  !ehMinha ? 4 : undefined,
                        }}>
                        {msg.mensagem}
                      </div>
                      <span className="text-xs px-1" style={{ color: '#333' }}>{fmtHora(msg.created_at)}</span>
                    </div>
                  )
                })}
              </div>

              {/* Pedidos pendentes (para o gestor responder) */}
              {cargo === 'gestor' && pedidosPendentes.filter(r => r.produto_id === modalChat).map(req => (
                <div key={req.id} className="mx-4 mb-2 rounded-xl border flex-shrink-0" style={{ backgroundColor: '#f59e0b0d', borderColor: '#f59e0b44' }}>
                  <div className="px-3 py-2.5">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-sm">🔖</span>
                      <span className="text-xs font-bold text-white">Solicitação de desconto</span>
                    </div>
                    <p className="text-xs mb-0.5" style={{ color: '#aaa' }}>
                      <span style={{ color: '#f59e0b' }}>{req.vendedor_nome}</span> pediu: <span className="font-bold text-white">R$ {fmt(req.valor_solicitado)}</span>
                    </p>
                    {req.motivo && (
                      <p className="text-xs mb-2" style={{ color: '#666' }}>
                        &quot;{req.motivo}&quot;
                      </p>
                    )}

                    {respondendoId === req.id ? (
                      <div className="flex flex-col gap-2">
                        <div className="flex gap-1.5">
                          {(['aprovado','negado','contra_proposta'] as const).map(a => (
                            <button key={a} onClick={() => setAcaoResposta(a)}
                              className="flex-1 py-1.5 rounded-lg text-xs font-bold border transition-all"
                              style={{
                                backgroundColor: acaoResposta === a ? (a === 'aprovado' ? '#4ade8022' : a === 'negado' ? '#f8717122' : '#60a5fa22') : '#1a1a1a',
                                borderColor:     acaoResposta === a ? (a === 'aprovado' ? '#4ade80' : a === 'negado' ? '#f87171' : '#60a5fa') : '#2a2a2a',
                                color:           acaoResposta === a ? (a === 'aprovado' ? '#4ade80' : a === 'negado' ? '#f87171' : '#60a5fa') : '#666',
                              }}>
                              {a === 'aprovado' ? '✅ Aprovar' : a === 'negado' ? '❌ Negar' : '💡 Contra'}
                            </button>
                          ))}
                        </div>
                        {acaoResposta === 'contra_proposta' && (
                          <div className="relative">
                            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs" style={{ color: '#444' }}>R$</span>
                            <input type="number" value={contraPropostaValor} onChange={e => setContraPropostaValor(e.target.value)}
                              placeholder="Valor da proposta" className="w-full rounded-lg pl-8 pr-3 py-2 text-sm text-white border outline-none"
                              style={{ backgroundColor: '#1a1a1a', borderColor: '#2a2a2a' }} />
                          </div>
                        )}
                        <input type="text" value={respostaTexto} onChange={e => setRespostaTexto(e.target.value)}
                          placeholder="Observação (opcional)"
                          className="w-full rounded-lg px-3 py-2 text-sm text-white border outline-none"
                          style={{ backgroundColor: '#1a1a1a', borderColor: '#2a2a2a' }} />
                        <div className="flex gap-1.5">
                          <button onClick={() => { setRespondendoId(null); setAcaoResposta(null); setContraPropostaValor(''); setRespostaTexto('') }}
                            className="flex-1 py-1.5 rounded-lg text-xs border" style={{ borderColor: '#2a2a2a', color: '#666' }}>
                            Cancelar
                          </button>
                          <button onClick={responderDesconto}
                            disabled={!acaoResposta || (acaoResposta === 'contra_proposta' && !contraPropostaValor) || salvandoResposta}
                            className="flex-1 py-1.5 rounded-lg text-xs font-bold disabled:opacity-40"
                            style={{ backgroundColor: '#4ade80', color: '#000' }}>
                            {salvandoResposta ? '...' : 'Confirmar'}
                          </button>
                        </div>
                      </div>
                    ) : (
                      <button onClick={() => setRespondendoId(req.id)}
                        className="w-full py-1.5 rounded-lg text-xs font-bold transition-all"
                        style={{ backgroundColor: '#f59e0b22', color: '#f59e0b', border: '1px solid #f59e0b44' }}>
                        Responder
                      </button>
                    )}
                  </div>
                </div>
              ))}

              {/* Pedidos do vendedor (status próprio) */}
              {cargo === 'vendedor' && pedidosPendentes.filter(r => r.produto_id === modalChat).length > 0 && (
                <div className="mx-4 mb-2 rounded-xl border flex-shrink-0 px-3 py-2.5"
                  style={{ backgroundColor: '#f59e0b0d', borderColor: '#f59e0b44' }}>
                  <p className="text-xs" style={{ color: '#f59e0b' }}>
                    ⏳ Solicitação de R$ {fmt(pedidosPendentes.filter(r => r.produto_id === modalChat)[0].valor_solicitado)} aguardando resposta do gestor...
                  </p>
                </div>
              )}

              {/* Formulário de solicitação de desconto (vendedor) */}
              {cargo === 'vendedor' && modalSolicitarDesc && (
                <div className="mx-4 mb-2 rounded-xl border flex-shrink-0 p-3" style={{ backgroundColor: '#1a1a1a', borderColor: '#2a2a2a' }}>
                  <p className="text-xs font-bold text-white mb-2">🔖 Solicitar aprovação de desconto</p>
                  <div className="flex flex-col gap-2">
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs font-bold" style={{ color: '#444' }}>R$</span>
                      <input type="number" value={valorSolicitado} onChange={e => setValorSolicitado(e.target.value)}
                        placeholder="Valor que o cliente quer pagar"
                        className="w-full rounded-lg pl-8 pr-3 py-2 text-sm text-white border outline-none"
                        style={{ backgroundColor: '#111', borderColor: valorSolicitado ? '#f59e0b55' : '#2a2a2a' }} />
                    </div>
                    <input type="text" value={motivoDesconto} onChange={e => setMotivoDesconto(e.target.value)}
                      placeholder="Motivo (ex: pagamento à vista, leva hoje)"
                      className="w-full rounded-lg px-3 py-2 text-sm text-white border outline-none"
                      style={{ backgroundColor: '#111', borderColor: '#2a2a2a' }} />
                    <div className="flex gap-2">
                      <button onClick={() => { setModalSolicitarDesc(false); setValorSolicitado(''); setMotivoDesconto('') }}
                        className="flex-1 py-1.5 rounded-lg text-xs border" style={{ borderColor: '#2a2a2a', color: '#666' }}>
                        Cancelar
                      </button>
                      <button onClick={solicitarDesconto}
                        disabled={!valorSolicitado || solicitandoDesc}
                        className="flex-1 py-1.5 rounded-lg text-xs font-bold disabled:opacity-40"
                        style={{ backgroundColor: '#f59e0b', color: '#000' }}>
                        {solicitandoDesc ? 'Enviando...' : 'Enviar para gestor'}
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* Input */}
              <div className="px-4 pb-4 pt-3 border-t flex flex-col gap-2 flex-shrink-0" style={{ borderColor: '#1a1a1a' }}>
                {/* Botão solicitar desconto (vendedor) */}
                {cargo === 'vendedor' && !modalSolicitarDesc && pedidosPendentes.filter(r => r.produto_id === modalChat).length === 0 && (
                  <button onClick={() => setModalSolicitarDesc(true)}
                    className="w-full py-2 rounded-xl text-xs font-semibold border transition-all"
                    style={{ borderColor: '#f59e0b33', color: '#f59e0b', backgroundColor: '#f59e0b0a' }}
                    onMouseEnter={e => e.currentTarget.style.backgroundColor = '#f59e0b18'}
                    onMouseLeave={e => e.currentTarget.style.backgroundColor = '#f59e0b0a'}>
                    🔖 Solicitar aprovação de desconto ao gestor
                  </button>
                )}
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={novaMensagem}
                    onChange={e => setNovaMensagem(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); enviarMensagem() } }}
                    placeholder="Digite sua mensagem..."
                    className="flex-1 rounded-xl px-4 py-2.5 text-sm text-white border outline-none"
                    style={{ backgroundColor: '#1a1a1a', borderColor: '#2a2a2a' }}
                  />
                  <button
                    onClick={enviarMensagem}
                    disabled={!novaMensagem.trim() || enviandoMensagem}
                    className="px-4 py-2.5 rounded-xl text-sm font-bold disabled:opacity-40 transition-all"
                    style={{ backgroundColor: '#60a5fa', color: '#000' }}>
                    {enviandoMensagem ? '...' : '→'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )
      })()}

      {/* ═══ Modal: Editar Preços ═══ */}
      {modalPrecos && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4"
          style={{ backgroundColor: '#000000cc' }}
          onClick={() => setModalPrecos(null)}>
          <div className="rounded-2xl border p-6 w-full max-w-md"
            style={{ backgroundColor: '#111', borderColor: '#2a2a2a' }}
            onClick={e => e.stopPropagation()}>
            <h3 className="text-lg font-bold text-white mb-1">Editar Preços</h3>
            <p className="text-sm mb-5" style={{ color: '#666' }}>
              {modalPrecos.modelo} · {modalPrecos.atributos?.gb} · {modalPrecos.atributos?.cor}
            </p>
            <div className="flex flex-col gap-4 mb-6">
              <div>
                <label className="text-sm mb-1 block" style={{ color: '#aaa' }}>Valor de Venda (R$)</label>
                <input type="number" value={editValor} onChange={e => setEditValor(e.target.value)}
                  className="w-full rounded-xl px-4 py-3 text-white border outline-none"
                  style={{ backgroundColor: '#1a1a1a', borderColor: '#2a2a2a' }} />
                {editValor && modalPrecos.atributos?.custo_total ? (
                  <p className="text-xs mt-1" style={{ color: '#4ade80' }}>
                    Lucro s/ NF: R$ {fmt(parseFloat(editValor) - (modalPrecos.atributos.custo_total ?? 0))}
                  </p>
                ) : null}
              </div>
              <div>
                <label className="text-sm mb-1 block" style={{ color: '#aaa' }}>Máx. Desconto à Vista (R$)</label>
                <input type="number" value={editValorAvista} onChange={e => setEditValorAvista(e.target.value)}
                  className="w-full rounded-xl px-4 py-3 text-white border outline-none"
                  style={{ backgroundColor: '#1a1a1a', borderColor: '#2a2a2a' }} />
              </div>
              <div>
                <label className="text-sm mb-1 block" style={{ color: '#aaa' }}>
                  Valor Promocional (R$)
                  <span className="ml-1" style={{ color: '#555' }}>— vazio para remover</span>
                </label>
                <input type="number" value={editPromocao} onChange={e => setEditPromocao(e.target.value)}
                  className="w-full rounded-xl px-4 py-3 text-white border outline-none"
                  style={{ backgroundColor: '#1a1a1a', borderColor: '#2a2a2a' }}
                  placeholder="Opcional" />
              </div>
            </div>
            <div className="flex gap-3">
              <button onClick={() => setModalPrecos(null)}
                className="flex-1 py-3 rounded-xl border text-sm font-medium"
                style={{ borderColor: '#2a2a2a', color: '#666', backgroundColor: '#1a1a1a' }}>
                Cancelar
              </button>
              <button onClick={confirmarPrecos} disabled={salvandoPrecos}
                className="flex-1 py-3 rounded-xl text-sm font-bold disabled:opacity-50"
                style={{ backgroundColor: '#c8960c', color: '#000' }}>
                {salvandoPrecos ? 'Salvando...' : '✓ Salvar Preços'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ═══ Modal: Confirmar Exclusão ═══ */}
      {modalExcluir && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4"
          style={{ backgroundColor: '#000000cc' }}
          onClick={() => setModalExcluir(null)}>
          <div className="rounded-2xl border p-6 w-full max-w-md"
            style={{ backgroundColor: '#111', borderColor: '#f8717144' }}
            onClick={e => e.stopPropagation()}>
            <div className="text-3xl mb-3">🗑️</div>
            <h3 className="text-lg font-bold text-white mb-1">Excluir produto?</h3>
            <p className="text-sm mb-1" style={{ color: '#aaa' }}>
              {modalExcluir.modelo}
              {modalExcluir.atributos?.gb ? ` · ${modalExcluir.atributos.gb}` : ''}
              {modalExcluir.atributos?.cor ? ` · ${modalExcluir.atributos.cor}` : ''}
            </p>
            <p className="text-sm mb-6" style={{ color: '#f87171' }}>
              Esta ação é permanente e não pode ser desfeita.
            </p>
            <div className="flex gap-3">
              <button onClick={() => setModalExcluir(null)}
                className="flex-1 py-3 rounded-xl border text-sm font-medium"
                style={{ borderColor: '#2a2a2a', color: '#888', backgroundColor: '#1a1a1a' }}>
                Cancelar
              </button>
              <button onClick={confirmarExclusao} disabled={excluindo}
                className="flex-1 py-3 rounded-xl text-sm font-bold disabled:opacity-50"
                style={{ backgroundColor: '#f87171', color: '#000' }}>
                {excluindo ? 'Excluindo...' : '🗑️ Excluir'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ══ Toasts ══ */}
      <ToastContainer toasts={toasts} onRemover={removerToast} />
    </div>
  )
}
