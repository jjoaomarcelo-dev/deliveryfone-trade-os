# Arquitetura — Fase 1: DeliveryFone

> Documento de referência. Nenhum código novo deve ser escrito sem que este documento esteja fechado.

---

## 1. Fluxo Completo de Venda

```
[DISPONÍVEL]
    │
    ├─ (opcional) RESERVA
    │       vendedor informa: cliente, observação, sinal (mín R$100)
    │       status → 'reservado'
    │
    ├─ SIMULAÇÃO (sempre disponível no produto)
    │       vendedor vê tabela de parcelas em tempo real
    │       pode solicitar desconto via chat do produto
    │
    ▼
[NEGOCIAÇÃO — Chat do produto]
    │   vendedor e gestor conversam dentro do produto
    │   desconto solicitado → gestor aprova / nega / contra-proposta
    │   tudo fica registrado no histórico
    │
    ▼
[VENDA REGISTRADA pelo vendedor]
    │   vendedor preenche: cliente, forma(s) de pagamento, valores
    │   sistema preenche automaticamente: data, hora, loja, vendedor, produto
    │   status → 'vendido' (aguardando conferência)
    │   notificação gerada para o gestor
    │
    ▼
[CONFERÊNCIA DO GESTOR]
    │   gestor verifica no ERP externo
    │   pode editar qualquer campo antes de confirmar
    │   decide: Confirmar ou Devolver
    │
    ├─ DEVOLVER → status volta para 'disponivel' ou 'reservado'
    │              gestor registra motivo no chat do produto
    │              notificação para o vendedor
    │
    ▼
[CONFIRMADO]
        produto sai do estoque ativo
        todos os snapshots financeiros ficam gravados permanentemente
        entra na categoria Vendidos para relatórios
```

**Regras do fluxo:**
- O produto nunca sai do estoque ativo sem confirmação do gestor
- A data oficial da venda é a data em que o vendedor registrou (não a confirmação)
- Todos os valores financeiros são snapshot — não mudam mesmo que o produto seja editado depois
- O gestor pode editar os dados da venda antes de confirmar, mas o sistema registra quem editou

---

## 2. Fluxo Completo de Reserva

```
[VENDEDOR abre produto DISPONÍVEL]
    │
    ▼
Clica em "Reservar"
    │   preenche: nome do cliente, observação, valor do sinal
    │   sistema preenche: vendedor, data, hora, loja
    │   validação: sinal mínimo R$100
    │
    ▼
[RESERVADO]
    │   todos os vendedores veem: "Reservado por [Vendedor] para [Cliente] — DD/MM HH:MM"
    │   gestor NÃO recebe notificação (reserva é operação interna do vendedor)
    │
    ├─ CANCELAR RESERVA (vendedor que reservou ou gestor)
    │       status → 'disponivel'
    │       campos de reserva limpos
    │       registro de quem cancelou e quando (no histórico do produto)
    │
    ▼
VENDA (segue o fluxo de venda normal a partir daqui)
```

**Regras de reserva:**
- Somente o vendedor que reservou pode cancelar (gestor sempre pode)
- Sinal é informativo — não é processado pelo sistema nesta fase
- Reserva não gera notificação para o gestor
- Produto reservado não pode ser vendido por outro vendedor (status bloqueia)

---

## 3. Fluxo Completo de Aprovação de Desconto

```
[VENDEDOR está negociando]
    │   vê que precisa oferecer valor abaixo do permitido
    │
    ▼
Abre o Chat do produto
    │   digita mensagem livre OU clica "Solicitar Aprovação"
    │
    ├─ MENSAGEM LIVRE
    │       "Cliente fecha por R$4.850, posso fazer?"
    │       gestor responde pelo mesmo chat
    │       aprovação fica no histórico de mensagens
    │
    └─ SOLICITAÇÃO FORMAL (botão dedicado)
            vendedor informa: valor solicitado, motivo
            cria registro em discount_requests
            notificação em tempo real para o gestor
            │
            ▼
        [GESTOR RECEBE NOTIFICAÇÃO]
            │   vê o produto, o valor atual e o valor solicitado
            │   decide:
            │
            ├─ APROVAR → valor aprovado = valor solicitado
            │             notificação para vendedor: "Aprovado ✓"
            │             registro permanente com: gestor, data/hora, valor
            │
            ├─ NEGAR   → notificação para vendedor: "Negado — [motivo]"
            │             registro permanente
            │
            └─ CONTRA-PROPOSTA → "Pode fazer por R$4.900"
                                  notificação para vendedor com novo valor
                                  vendedor aceita ou renegocia
```

**Regras de aprovação:**
- Toda aprovação fica registrada com: quem pediu, quem aprovou, valor solicitado, valor aprovado, data/hora
- Vendedor só pode finalizar a venda com desconto após aprovação formal (quando usar o fluxo de solicitação)
- Desconto aplicado é registrado nos dados da venda para relatórios ("quanto foi perdido em descontos")

---

## 4. Fluxo Completo de Conferência do Gestor

```
[GESTOR recebe notificação: "Venda aguardando conferência"]
    │
    ▼
Abre o produto (status = 'vendido')
    │   visualiza painel de conferência:
    │   - O que o vendedor registrou (cliente, pagamentos, valores)
    │   - Histórico do chat do produto
    │   - Aprovações de desconto concedidas
    │   - Custo do produto vs valor vendido (lucro estimado)
    │
    ▼
Confere no ERP externo
    │
    ├─ CONFIRMAR (dados corretos)
    │       gestor pode editar campos antes de confirmar
    │       clica "Confirmar e Arquivar"
    │       sistema grava: confirmado_por, data_confirmacao
    │       status → 'confirmado'
    │       snapshots financeiros gravados permanentemente
    │       notificação para vendedor: "Venda confirmada ✓"
    │       produto desaparece do estoque ativo
    │       produto entra em Vendidos (relatórios)
    │
    └─ DEVOLVER (dados incorretos)
            gestor informa motivo
            status → 'disponivel' (ou 'reservado' se havia reserva)
            mensagem automática no chat: "Venda devolvida — [motivo]"
            notificação para vendedor
            vendedor pode corrigir e registrar novamente
```

**Snapshots gravados permanentemente na confirmação:**
- `valor_venda` — total bruto recebido
- `valor_liquido` — após desconto da operadora
- `custo_snapshot` — custo do aparelho no momento da venda
- `margem_bruta` — valor_liquido − custo_snapshot
- `desconto_aplicado` — valor_normal − valor_venda (se houve)
- `taxa_comercial_snapshot` — taxa cobrada do cliente
- `taxa_operadora_snapshot` — taxa real descontada pela máquina
- `vendido_por`, `store_id`, `data_venda`, `data_confirmacao`

---

## 5. Estrutura dos Relatórios

Os relatórios devem responder perguntas sem precisar de cálculos manuais. O banco deve nascer preparado para isso.

### Perguntas que o sistema deve responder

| Pergunta | Fonte de dados |
|---|---|
| Quanto cada vendedor vendeu (R$)? | SUM(valor_venda) GROUP BY vendido_por WHERE status = confirmado |
| Quanto cada vendedor lucrou? | SUM(margem_bruta) GROUP BY vendido_por |
| Quantos aparelhos cada vendedor vendeu? | COUNT(*) GROUP BY vendido_por |
| Qual loja vende mais? | SUM(valor_venda) GROUP BY store_id |
| Qual marca/categoria vende mais? | SUM(valor_venda) GROUP BY categoria |
| Quantos descontos foram aprovados? | COUNT(*) FROM discount_requests WHERE status = aprovado |
| Quanto foi perdido em descontos? | SUM(desconto_aplicado) WHERE desconto_aplicado > 0 |
| Ticket médio? | AVG(valor_venda) |
| Lucro bruto total? | SUM(margem_bruta) |
| Produtos parados há mais de X dias? | DATEDIFF(now, data_entrada) > X |
| Tempo médio de venda (entrada → confirmado)? | AVG(data_confirmacao − data_entrada) |

### Filtros necessários
- Por vendedor
- Por loja
- Por período (dia, semana, mês, intervalo personalizado)
- Por categoria/marca
- Por forma de pagamento

### Indicadores por vendedor (exemplo)
```
João
  Aparelhos vendidos: 34
  Valor total vendido: R$ 182.000
  Lucro gerado: R$ 28.500
  Ticket médio: R$ 5.353
  Descontos concedidos: 8 (total: R$ 2.400)
  Taxa de conversão: reservas → vendas
```

---

## 6. Estrutura do Banco de Dados

### Tabela `juros` — RENOMEAR campos para clareza

```sql
-- taxa_comercial: o que é cobrado do cliente (markup)
-- taxa_operadora: o que a maquininha desconta do bruto (custo real)
-- Nunca devem ser tratadas como a mesma coisa.

ALTER TABLE juros
  RENAME COLUMN percentual TO taxa_comercial;
-- taxa_real já existe → renomear para taxa_operadora
ALTER TABLE juros
  RENAME COLUMN taxa_real TO taxa_operadora;
```

### Campos novos na tabela `products`

```sql
ALTER TABLE products
  -- Reserva
  ADD COLUMN IF NOT EXISTS reserva_cliente        TEXT,        -- nome do cliente na reserva

  -- Venda
  ADD COLUMN IF NOT EXISTS cliente_nome           TEXT,        -- nome do cliente na venda

  -- Snapshots financeiros (gravados na confirmação, imutáveis)
  ADD COLUMN IF NOT EXISTS custo_snapshot         NUMERIC,     -- custo do aparelho no momento da venda
  ADD COLUMN IF NOT EXISTS margem_bruta           NUMERIC,     -- valor_liquido − custo_snapshot
  ADD COLUMN IF NOT EXISTS desconto_aplicado      NUMERIC,     -- valor_normal − valor_venda
  ADD COLUMN IF NOT EXISTS valor_normal_snapshot  NUMERIC,     -- preço normal no momento da venda
  ADD COLUMN IF NOT EXISTS taxa_comercial_snap    NUMERIC,     -- taxa cobrada do cliente
  ADD COLUMN IF NOT EXISTS taxa_operadora_snap    NUMERIC,     -- taxa real da maquininha

  -- Confirmação
  ADD COLUMN IF NOT EXISTS confirmado_por         TEXT,
  ADD COLUMN IF NOT EXISTS data_confirmacao       DATE,
  ADD COLUMN IF NOT EXISTS motivo_devolucao       TEXT;        -- se gestor devolver a venda
```

### Nova tabela `sale_payments` — Pagamentos múltiplos

```sql
-- Suporta: PIX R$2.000 + Cartão R$3.000 + Boleto R$1.000 = R$6.000
CREATE TABLE IF NOT EXISTS sale_payments (
  id              UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  produto_id      UUID REFERENCES products(id) ON DELETE CASCADE,
  store_id        UUID REFERENCES stores(id),
  forma           TEXT NOT NULL,
  -- pix | dinheiro | debito | credito | boleto | financiamento
  valor           NUMERIC NOT NULL,
  parcelas        INTEGER,               -- apenas para crédito
  taxa_comercial  NUMERIC,              -- markup cobrado do cliente
  taxa_operadora  NUMERIC,              -- desconto real da maquininha
  valor_liquido   NUMERIC,             -- o que a empresa efetivamente recebe
  created_at      TIMESTAMPTZ DEFAULT now()
);
```

### Nova tabela `product_messages` — Chat por produto

```sql
CREATE TABLE IF NOT EXISTS product_messages (
  id           UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  produto_id   UUID REFERENCES products(id) ON DELETE CASCADE,
  store_id     UUID REFERENCES stores(id),
  autor_id     UUID REFERENCES profiles(id),
  autor_nome   TEXT NOT NULL,
  autor_cargo  TEXT NOT NULL,           -- vendedor | gestor | sistema
  mensagem     TEXT NOT NULL,
  tipo         TEXT DEFAULT 'mensagem',
  -- mensagem | sistema | solicitacao_desconto | aprovacao | negacao | contra_proposta
  metadata     JSONB,                   -- dados estruturados quando necessário
  created_at   TIMESTAMPTZ DEFAULT now()
);

-- RLS: todos da mesma store veem todas as mensagens dos produtos da store
```

### Nova tabela `discount_requests` — Solicitações de desconto

```sql
CREATE TABLE IF NOT EXISTS discount_requests (
  id                UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  produto_id        UUID REFERENCES products(id) ON DELETE CASCADE,
  store_id          UUID REFERENCES stores(id),
  vendedor_id       UUID REFERENCES profiles(id),
  vendedor_nome     TEXT NOT NULL,
  valor_solicitado  NUMERIC NOT NULL,
  valor_original    NUMERIC NOT NULL,   -- snapshot do valor_venda no momento
  motivo            TEXT,
  status            TEXT DEFAULT 'pendente',
  -- pendente | aprovado | negado | contra_proposta
  valor_aprovado    NUMERIC,
  resposta_gestor   TEXT,
  gestor_id         UUID REFERENCES profiles(id),
  gestor_nome       TEXT,
  created_at        TIMESTAMPTZ DEFAULT now(),
  resolved_at       TIMESTAMPTZ
);
```

### Nova tabela `trade_ins` — Simulação de troca (fase 1: simples)

```sql
CREATE TABLE IF NOT EXISTS trade_ins (
  id              UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  produto_id      UUID REFERENCES products(id) ON DELETE SET NULL,
  store_id        UUID REFERENCES stores(id),
  vendedor_nome   TEXT NOT NULL,
  marca           TEXT NOT NULL,
  modelo          TEXT NOT NULL,
  armazenamento   TEXT,
  observacoes     TEXT,
  -- campos para fase 2 (avaliação completa):
  -- bateria, tela, face_id, cameras, outros_reparos, valor_compra, valor_revenda
  created_at      TIMESTAMPTZ DEFAULT now()
);
```

### Tabela `notifications` — Sem mudanças de estrutura

Adicionar apenas novos `tipo` valores:
- `venda_pendente` ✓ (já existe)
- `desconto_solicitado` (novo)
- `desconto_respondido` (novo)
- `venda_confirmada` (novo — notificar vendedor)
- `venda_devolvida` (novo — notificar vendedor)

---

## Decisões de Arquitetura Fechadas

| Decisão | Escolha | Motivo |
|---|---|---|
| Taxa comercial vs taxa operadora | Campos separados, nunca misturados | Financeiro correto para relatórios |
| Pagamentos múltiplos | Tabela `sale_payments` separada | Suporta PIX+Cartão+Boleto sem gambiarra |
| Chat | Tabela `product_messages` | Histórico permanente por produto |
| Snapshots na confirmação | Gravados imutáveis em `products` | Relatórios históricos sempre corretos |
| Aprovação de desconto | Tabela `discount_requests` + mensagem no chat | Rastreabilidade + comunicação integrada |
| Múltiplas lojas | `store_id` já existe, sem expansão agora | Fase 2 |
| Fotos/vídeos | Não nesta fase | Validar lógica primeiro |

---

## Ordem de Implementação — Fase 1

1. **SQL de migração** — executar no Supabase (renomear campos juros, novos campos products, novas tabelas)
2. **Fluxo de venda completo** — incluindo cliente_nome, múltiplos pagamentos (sale_payments)
3. **Chat por produto** — product_messages com realtime
4. **Aprovação de desconto** — discount_requests + notificações
5. **Conferência do gestor** — painel completo com snapshots na confirmação
6. **Relatórios por vendedor** — dashboard básico de performance
