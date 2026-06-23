# AUDITORIA TÉCNICA — DeliveryFone
**Data**: Junho 2026  
**Escopo**: Auditoria completa de bugs, segurança, arquitetura e qualidade de código  
**Fontes**: Staff Engineer · QA Senior · Principal Engineer · Análise de Overengineering

---

## ÍNDICE RÁPIDO

| Severidade | Itens | Pode ir a produção? |
|---|---|---|
| 🔴 CRÍTICO | 5 | **NÃO** — dados financeiros corrompidos hoje |
| 🟠 ALTO | 11 | **NÃO** — risco de perda de dados e acesso indevido |
| 🟡 MÉDIO | 13 | Com ressalvas — UX degradada e dívida técnica acumulando |
| 🟢 BAIXO | 9 | Sim — melhorias de qualidade para próximas sprints |

---

## 🔴 CRÍTICO

> Itens que corrompem dados, causam perda financeira real ou bloqueiam o uso central do sistema.  
> **Nenhum destes pode existir em produção.**

---

### C-01 · `parseBRL` quebrado — todos os valores acima de R$999 corrompidos

**Arquivo**: `app/dashboard/estoque/page.tsx` (25+ ocorrências), `novo-produto/page.tsx`, `editar-produto/[id]/page.tsx`

**Problema**:  
O padrão `parseFloat(x.replace(',', '.'))` ignora o separador de milhar brasileiro. O valor `2.500,00` é processado como `2.5` — não como `2500`.

```typescript
// HOJE (quebrado)
parseFloat('2.500,00'.replace(',', '.'))  // → 2.5

// CORRETO (parseBRL já existe em estoque/page.tsx)
parseBRL('2.500,00')  // → 2500
```

**Impacto no negócio**: Qualquer produto acima de R$999 cadastrado ou vendido grava valores errados no banco (`valor_venda = 2.5`, `desconto_aplicado = 1.5`). Não há como detectar retroativamente sem auditoria manual linha a linha. Relatórios de lucro ficam completamente errados.

**Risco de não corrigir**: Perda financeira direta. Dados irrecuperáveis após a venda.

**Correção**: Substituir todos os `parseFloat(x.replace(',', '.'))` por `parseBRL(x)` em todos os arquivos. A função já existe e está correta em `estoque/page.tsx`.

**Esforço**: 2h

---

### C-02 · Ternária de `precoBase` quebrada por ASI — tabela de parcelas mostra R$0,00

**Arquivo**: `app/dashboard/estoque/page.tsx` (~linhas 1773 e 2034)

**Problema**:  
Uma correção anterior de TypeScript introduziu um bug de sintaxe. O JavaScript aplica Automatic Semicolon Insertion (ASI) entre as linhas da ternária, tornando cada linha um statement separado. O resultado: `precoBase` sempre vale `0` para qualquer base que não seja `'avista'`.

```typescript
// HOJE (quebrado — ASI insere ; após cada 0)
const precoBase =
  base === 'avista' && produto.valor_avista ? Number(produto.valor_avista) : 0
  base === 'promocional' && produto.promocao ? Number(produto.promocao) : 0
  Number(produto.valor)
// → precoBase = 0 quando base !== 'avista' ✗

// CORRETO (ternária encadeada)
const precoBase =
  base === 'avista'      && produto.valor_avista       ? Number(produto.valor_avista) :
  base === 'promocional' && produto.promocao           ? Number(produto.promocao) :
  base === 'sem_juros'   && produto.promocao_sem_juros ? Number(produto.promocao_sem_juros.valor) :
  Number(produto.valor)
```

**Impacto no negócio**: A funcionalidade central do produto — a tabela de simulação de parcelamento — exibe R$0,00 para todos os produtos quando a base é "Valor normal", "Promocional" ou "Sem juros" (os três casos mais comuns). Vendedores citam parcelas fictícias para clientes.

**Verificado com**: `node -e "..."` — `precoBase` retorna `0` com `base='valor'`.

**Correção**: Trocar `: 0\n` por `:\n` nos dois pontos onde o padrão ocorre.

**Esforço**: 30min

---

### C-03 · Schema mismatch — cadastro e edição de produtos quebrados

**Arquivos**: `app/dashboard/novo-produto/page.tsx`, `app/dashboard/editar-produto/[id]/page.tsx`

**Problema**:  
Ambas as páginas ainda referenciam colunas `percentual` e `taxa_real` na tabela `juros`. Essas colunas foram renomeadas para `taxa_comercial` e `taxa_operadora` na migration `setup_completo.sql`. O `SELECT` retorna `null` para todos os valores de juros.

```typescript
// HOJE (coluna inexistente no banco)
interface Juros { parcelas: number; percentual: number; taxa_real: number | null }
.select('parcelas, percentual, taxa_real')  // → null

// CORRETO
interface Juros { parcelas: number; taxa_comercial: number; taxa_operadora: number | null }
.select('parcelas, taxa_comercial, taxa_operadora')
```

**Impacto no negócio**: A tabela de parcelamento no cadastro exibe `NaN%` em todos os juros. O gestor precifica produtos sem enxergar margens de lucro reais. Pode precificar abaixo do custo inadvertidamente.

**Correção**: Atualizar interface, query e todos os usos de `j.percentual` → `j.taxa_comercial`, `j.taxa_real` → `j.taxa_operadora` nos dois arquivos.

**Esforço**: 1h

---

### C-04 · Race condition — dupla venda do mesmo produto

**Arquivo**: `app/dashboard/estoque/page.tsx` — funções `confirmarVendaVendedor`, `salvarReserva`

**Problema**:  
Dois vendedores podem registrar ações sobre o mesmo produto simultaneamente. O Realtime tem latência de 1–2s, tempo suficiente para o conflito. O UPDATE não possui condição de guarda:

```typescript
// HOJE (sem proteção)
await supabase.from('products')
  .update({ status: 'vendido', ... })
  .eq('id', produtoId)
// Aceita o UPDATE mesmo se produto já foi vendido por outro vendedor ✗

// CORRETO (lock otimista)
const { count } = await supabase.from('products')
  .update({ status: 'vendido', ... })
  .eq('id', produtoId)
  .eq('status', 'disponivel')  // ← só atualiza se ainda disponível
  .select('id', { count: 'exact', head: true })

if (!count) { toast.error('Produto já foi reservado por outro vendedor'); return }
```

**Impacto no negócio**: Produto vendido para dois clientes ao mesmo tempo. Conflito operacional, insatisfação de clientes, perda de confiança na ferramenta.

**Esforço**: 2h (reserva + venda + tratamento de erro visual)

---

### C-05 · `produto/[id]/page.tsx` — 1.359 linhas de código morto com lógica de venda duplicada

**Arquivo**: `app/dashboard/produto/[id]/page.tsx`

**Problema**:  
Esta página nunca é linkada de nenhum arquivo do projeto (verificado: zero chamadas `router.push` ou `href` apontando para `/dashboard/produto/`). Ela duplica integralmente:
- `STATUS_CONFIG`, `dataHoje`, `fmt`, `diasNoEstoque`
- Toda lógica de venda, confirmação, devolução, chat, desconto
- Funções `FormVendaVendedor` e `FormConfirmarGestor` aninhadas dentro do componente (recriadas a cada render)

**Impacto**: Dead code de 1.359 linhas que ninguém mantém mas que pode ser ativado por engano. Qualquer bug corrigido em `estoque/page.tsx` existe silenciosamente aqui também.

**Correção**: Deletar o arquivo inteiro.

**Esforço**: 5min

---

## 🟠 ALTO

> Itens que representam risco de perda de dados, segurança ou fluxos operacionais quebrados.

---

### A-01 · "Confirmado" disponível no dropdown de status rápido

**Arquivo**: `estoque/page.tsx` — dropdown de status inline

**Problema**: O gestor pode mudar um produto diretamente para `confirmado` via dropdown, sem passar pelo modal de confirmação. O produto é marcado como vendido sem `valor_venda`, `forma_pagamento`, `margem_bruta`, `confirmado_por`. Dados de auditoria financeira perdidos.

**Correção**: Filtrar `confirmado` do `Object.entries(STATUS_CONFIG)` no dropdown. O status `confirmado` só deve ser atingível pelo modal de conferência.

**Esforço**: 10min

---

### A-02 · `devolverVenda()` não limpa snapshots financeiros

**Arquivo**: `estoque/page.tsx` — função `devolverVenda`

**Problema**: Na devolução, os campos `custo_snapshot`, `margem_bruta`, `desconto_aplicado`, `confirmado_por`, `data_confirmacao`, `taxa_aplicada` ficam com os valores da venda anterior. Se o produto for revendido, o relatório mistura dados das duas vendas.

```typescript
// FALTANDO no objeto de update de devolverVenda():
custo_snapshot: null,
margem_bruta: null,
desconto_aplicado: null,
confirmado_por: null,
data_confirmacao: null,
taxa_aplicada: null,
```

**Esforço**: 10min

---

### A-03 · Notificação de resposta ao desconto com `tipo` errado

**Arquivo**: `estoque/page.tsx` — função `responderDesconto`

**Problema**: Quando o gestor aprova ou nega um desconto, a notificação é gravada com `tipo: 'desconto_solicitado'` em vez de `'desconto_respondido'`. Qualquer filtro, relatório ou automação futura por tipo de notificação será incorreto.

**Esforço**: 5min (trocar string)

---

### A-04 · `limparTodasNotifs()` deleta notificações de outros usuários

**Arquivo**: `estoque/page.tsx` — função `limparTodasNotifs`

**Problema**: A query de delete filtra apenas por `store_id`, não por `destinatario_id`. Um vendedor que clica em "Limpar todas" apaga as notificações não lidas de todos os outros usuários da loja.

```typescript
// HOJE (apaga de todos)
.delete().eq('store_id', storeId)

// CORRETO
.delete().eq('store_id', storeId).eq('destinatario_id', userId)
```

**Esforço**: 5min

---

### A-05 · Semântica inconsistente de `taxa_aplicada`

**Arquivo**: `estoque/page.tsx` — confirmação do gestor vs. registro do vendedor

**Problema**: O campo `taxa_aplicada` guarda `taxa_operadora` quando o gestor confirma, mas `taxa_operadora ?? taxa_comercial` quando o vendedor registra. A mesma coluna tem dois significados dependendo de quem fez a operação. Relatórios de análise de rentabilidade por forma de pagamento são não-confiáveis.

**Esforço**: 1h (definir semântica, padronizar, verificar relatórios)

---

### A-06 · Botão excluir visível em produtos com status `vendido`

**Arquivo**: `estoque/page.tsx` — botão de exclusão no card

**Problema**: O botão de excluir aparece em produtos com `status === 'vendido'` (aguardando confirmação do gestor). A exclusão apaga em cascata `product_messages` e `discount_requests` — histórico de negociação perdido permanentemente.

**Correção**: `disabled={produto.status === 'vendido' || produto.status === 'confirmado'}` no botão, mais verificação em `confirmarExclusao()`.

**Esforço**: 15min

---

### A-07 · Sem `middleware.ts` — autenticação apenas client-side

**Arquivo**: inexistente — `middleware.ts` não existe no projeto

**Problema**: A verificação de autenticação ocorre apenas no `useEffect` do cliente. Usuários não autenticados recebem o HTML completo da página antes do redirect. Rotas `/dashboard/*` são acessíveis por crawlers, scrapers e usuários com JavaScript desabilitado.

**Correção**: Criar `middleware.ts` com `createServerClient` do `@supabase/ssr`. Padrão documentado pelo Supabase para Next.js App Router.

**Esforço**: 2h

---

### A-08 · RLS genérico — vendedor pode alterar campos financeiros imutáveis

**Arquivo**: `supabase/setup_completo.sql` — policy `produtos_update_store`

**Problema**: A policy atual permite que qualquer usuário autenticado da mesma loja atualize qualquer campo de `products`, incluindo `custo_snapshot`, `margem_bruta`, `confirmado_por`. Um vendedor com acesso à API pode manipular histórico financeiro diretamente.

```sql
-- HOJE (sem restrição de cargo)
CREATE POLICY "produtos_update_store" ON products
  FOR UPDATE USING (store_id = ...)

-- CORRETO: policies separadas por cargo
-- Vendedor: apenas status, reserva, venda (campos operacionais)
-- Gestor: todos os campos
```

**Esforço**: 3h

---

### A-09 · Cleanup de canais Realtime cria novo canal em vez de remover

**Arquivo**: `estoque/page.tsx` — `useEffect` com subscriptions

**Problema**: `supabase.removeChannel(supabase.channel('notif-rt'))` cria uma nova instância do canal e tenta removê-la — não remove o canal existente. Em desenvolvimento com React StrictMode, as subscriptions duplicam a cada mount/unmount. Em produção: mensagens duplicadas, consumo desnecessário de WebSocket.

```typescript
// HOJE (cria novo canal ao tentar remover)
return () => {
  supabase.removeChannel(supabase.channel('notif-rt')) // ← channel() cria novo!
}

// CORRETO (guardar referência)
const ch = supabase.channel('notif-rt').on(...).subscribe()
return () => { supabase.removeChannel(ch) }
```

**Esforço**: 30min

---

### A-10 · Filtro de relatórios por nome de vendedor (string), não por UUID

**Arquivo**: `app/dashboard/relatorios/page.tsx`

**Problema**: Os relatórios filtram vendas por `vendido_por` (nome como texto). Se dois vendedores têm o mesmo nome, dados se misturam. Se um vendedor for renomeado, perde o histórico de vendas anteriores.

**Correção**: Adicionar coluna `vendido_por_id UUID` na tabela `products`, gravar o UUID na venda, filtrar por UUID.

**Esforço**: 2h (migration + atualizar gravação + atualizar filtro)

---

### A-11 · `novo-produto` e `editar-produto` têm 85% de código idêntico — bug fix em um não propaga para o outro

**Arquivos**: `novo-produto/page.tsx` (810 linhas), `editar-produto/[id]/page.tsx` (781 linhas)

**Problema**: Medição exata: 440 linhas de código idêntico compartilhadas. Qualquer bug corrigido em um arquivo precisa ser manualmente replicado no outro. O schema mismatch (C-03) é prova direta: foi corrigido em `estoque` mas não em `novo-produto` nem `editar-produto` porque estão em arquivos separados. Além disso, `MODELOS_IPHONE`, `GB_IPHONE`, `CORES_IPHONE` declarados duas vezes com 150 linhas de dados duplicados.

**Correção**: Fundir em `ProdutoForm` único com prop `produtoId?: string`. Reduz 1.591 linhas para ~700.

**Esforço**: 4h

---

## 🟡 MÉDIO

> Degradam experiência do usuário, dificultam manutenção futura ou podem causar erros ocasionais.

---

### M-01 · `dataHoje()` usa UTC — datas de venda incorretas para usuários no fuso BR

**Problema**: `new Date().toISOString().split('T')[0]` retorna data UTC. Para usuário no fuso UTC-3, às 22h o sistema registra a venda com data de "amanhã". Relatórios diários ficam com distribuição de datas incorreta.

**Correção**: `new Date().toLocaleDateString('en-CA')` — retorna `YYYY-MM-DD` no fuso local.

**Arquivos afetados**: `estoque/page.tsx`, `novo-produto`, `editar-produto`, `produto/[id]`, `relatorios`.

**Esforço**: 30min

---

### M-02 · `createClient()` no corpo do componente — nova instância Supabase a cada render

**Problema**: `const supabase = createClient()` declarado no body de todos os 6 componentes. Nova instância criada a cada re-render. Referência instável para canais Realtime. Possível vazamento de memória.

**Correção**: `const supabase = useMemo(() => createClient(), [])` ou hook dedicado `useSupabase()`.

**Esforço**: 1h

---

### M-03 · 14 usos de `alert()` nativo

**Problema**: Alertas nativos do browser — bloqueantes, sem estilo, inconsistentes com o design dark do sistema, não funcionam bem em mobile. Interrompem o fluxo do usuário desnecessariamente.

**Correção**: Componente `<Toast />` simples com Context. Substituir todos os `alert()` por `toast.error()`.

**Esforço**: 4h

---

### M-04 · Falha silenciosa nas operações async — usuário não sabe se a ação funcionou

**Problema**: A maioria das funções async não verifica o `error` retornado pelo Supabase. Se um UPDATE falhar por RLS ou problema de rede, o modal fecha e o estado local é atualizado como se tivesse funcionado — mas o banco não foi alterado.

```typescript
// HOJE (erro ignorado)
await supabase.from('products').update(updates).eq('id', id)
// modal fecha, parece que funcionou ✗

// CORRETO
const { error } = await supabase.from('products').update(updates).eq('id', id)
if (error) { toast.error('Erro ao salvar: ' + error.message); return }
```

**Esforço**: 3h (passar por todas as funções async)

---

### M-05 · CATEGORIAS com 1 item — UI de seleção de categoria sem sentido

**Arquivo**: `novo-produto/page.tsx`

**Problema**: Existe um bloco completo de UI com botões, hover animado, estado `categoria` e reset de campos — para selecionar entre uma única opção (iPhone). O usuário vê um botão que não pode ser desmarcado e não serve para nada.

**Correção**: Remover o bloco "Categoria" inteiro e tornar a seção iPhone sempre visível. Reintroduzir quando outras categorias existirem de fato.

**Esforço**: 15min

---

### M-06 · Funções utilitárias declaradas 4–5 vezes no projeto

**Problema**: Duplicações confirmadas por análise:

| Símbolo | Arquivos |
|---|---|
| `dataHoje()` | 5 arquivos |
| `diasNoEstoque()` | 4 arquivos |
| `fmt()` | 3 arquivos |
| `calcParcelado()` | 3 arquivos |
| `interface Juros` | 3 arquivos (com schemas divergentes!) |
| `MODELOS_IPHONE/GB/CORES` | 2 arquivos |
| `TAXA_REAL_FALLBACK` | 2 arquivos |
| `STATUS_CONFIG` | 2 arquivos |

**Correção**: Criar `app/lib/utils.ts`, `app/lib/financeiro.ts`, `app/lib/iphone-data.ts`, `app/types.ts`.

**Esforço**: 2h (extrair + atualizar imports)

---

### M-07 · Sem paginação — todos os produtos carregados na memória

**Problema**: `SELECT * FROM products WHERE store_id = X` sem `.limit()`. Com 200+ produtos, o carregamento inicial degrada. Com 500+, a página trava perceptivelmente na renderização de todos os cards.

**Correção**: Paginação com cursor (`.range()`) ou scroll infinito. Busca server-side com full-text search do Postgres.

**Esforço**: 1 semana

---

### M-08 · Sem tratamento de erro nas queries iniciais de carregamento

**Problema**: Se a query de `profiles` ou `products` falhar (timeout, RLS, problema de rede), o componente fica preso em estado de loading infinito. Sem feedback de erro para o usuário.

**Esforço**: 2h

---

### M-09 · Sem logging de erros em produção

**Problema**: Erros de banco são `console.error` no máximo. Em produção, quando uma venda falha, não há como diagnosticar remotamente sem acesso direto ao Supabase Dashboard. Erros silenciosos acumulam sem ninguém saber.

**Correção**: Integração com Sentry (tier gratuito suficiente para começar) + logger estruturado para operações financeiras.

**Esforço**: 4h

---

### M-10 · Sem recuperação de senha

**Problema**: Não existe "Esqueci minha senha" na tela de login. Vendedor bloqueado depende de intervenção manual do gestor no Supabase Dashboard.

**Correção**: `supabase.auth.resetPasswordForEmail()` — funcionalidade nativa pronta.

**Esforço**: 3h

---

### M-11 · `reserva_sinal` não persiste no banco

**Problema**: O campo "Sinal" no modal de reserva do vendedor (valor pago antecipadamente) é usado apenas para montar a string de notificação. Nunca é gravado na tabela `products`. Informação financeiramente relevante perdida.

**Correção**: Migration SQL + `reserva_sinal` no objeto de update de `salvarReserva()`.

**Esforço**: 1h

---

### M-12 · Scroll para produto via notificação sem fallback

**Problema**: `document.getElementById('produto-${id}')?.scrollIntoView()` falha silenciosamente se o produto estiver filtrado (status diferente, busca ativa). O usuário clica na notificação e nada acontece.

**Correção**: Limpar filtros antes do scroll + `setTimeout` de 100ms para aguardar re-render.

**Esforço**: 1h

---

### M-13 · `sale_payments` e `trade_ins` criadas no SQL mas nunca usadas no frontend

**Problema**: Duas tabelas com RLS, Realtime e índices configurados — sem nenhuma linha de código no frontend que as consuma. Complexidade de schema sem benefício atual.

**Decisão (Jun/2026)**: Manter ambas as tabelas no schema por ora.
- `sale_payments`: será implementada quando o fluxo de pagamentos parcelados precisar de rastreamento linha-a-linha (roadmap F4.1). Não dropar.
- `trade_ins`: sem previsão de uso. Dropar se não houver demanda até o próximo review de schema (Set/2026).

**Esforço**: Decisão de produto (0h técnico) — ✅ documentado

---

## 🟢 BAIXO

> Melhorias de qualidade, performance e escalabilidade futura. Sem impacto imediato na operação.

---

### B-01 · `useMemo` ausente em `produtosFiltrados` e `contagens`

`produtosFiltrados` executa até 4 `.filter()` encadeados a cada render. `contagens` itera todos os produtos 8 vezes. Com React StrictMode em dev, ocorre 2× por render.

**Esforço**: 1h

---

### B-02 · Sem índices SQL nas queries mais frequentes

Queries de `SELECT * FROM products WHERE store_id = X AND status = Y` fazem full scan. Com volume crescente, impacto direto no tempo de carregamento.

```sql
CREATE INDEX CONCURRENTLY idx_products_store_status ON products(store_id, status);
CREATE INDEX CONCURRENTLY idx_notifications_store ON notifications(store_id, lida, created_at DESC);
CREATE INDEX CONCURRENTLY idx_product_messages_produto ON product_messages(produto_id, created_at ASC);
```

**Esforço**: 30min

---

### B-03 · Sem testes automatizados para funções financeiras

`calcParcelado`, `parseBRL`, `calcLucroLiquidoParcelado` são a espinha dorsal do sistema. O bug de `parseBRL` desta sessão prova que refatorações sem testes são perigosas. 30–40 casos de teste unitário detectariam o problema antes de qualquer commit.

**Esforço**: 4h (setup Jest + testes)

---

### B-04 · Sem CI/CD — commits com erro TypeScript vão para produção

O bug de `parseBRL` (C-01) sobreviveu por múltiplas sessões sem ser detectado. Um pipeline básico no GitHub Actions com `tsc --noEmit` + `eslint` garante que esse tipo de erro é pego no PR.

**Esforço**: 3h

---

### B-05 · Sem ambiente de staging separado

Toda migration SQL vai diretamente para produção. Qualquer erro derruba dados reais.

**Esforço**: 4h (novo projeto Supabase + variáveis de ambiente separadas)

---

### B-06 · `FormVendaVendedor` e `FormConfirmarGestor` como funções aninhadas

Em `produto/[id]` (que será deletado), mas o padrão é um anti-pattern comum: componentes declarados dentro do body de outro componente são recriados a cada render, impedindo reconciliação eficiente do React.

**Esforço**: 1h (extrair para componentes separados)

---

### B-07 · Sem exportação de relatórios

Para uso operacional real de uma loja, exportar o relatório mensal para Excel é necessário para contabilidade. Hoje apenas visualizável na tela.

**Correção**: Botão "Exportar CSV" com `Blob` + `URL.createObjectURL` no cliente.

**Esforço**: 2h

---

### B-08 · Header e loading spinner repetidos em 4 páginas

O padrão de header com "← Voltar" e o spinner de loading são ~15 linhas de JSX idêntico em `novo-produto`, `editar-produto`, `produto/[id]` e `estoque`. Candidatos a componentes compartilhados `<PageHeader />` e `<Spinner />`.

**Esforço**: 1h

---

### B-09 · `brl()` declarada mas não usada em `produto/[id]`

Função `brl(v)` declarada na linha 101 de `produto/[id]/page.tsx`. Nunca chamada. Dead code local — irrelevante quando o arquivo for deletado (C-05), mas indicativo de falta de linting.

**Esforço**: 0 (resolvido com C-05)

---

## PLANO DE EXECUÇÃO RECOMENDADO

### Semana 1 — Desbloquear produção
| # | Item | Esforço |
|---|---|---|
| 1 | **C-05** Deletar `produto/[id]/page.tsx` | 5min |
| 2 | **C-02** Corrigir ternária `precoBase` (2 pontos) | 30min |
| 3 | **A-03** Corrigir `tipo` da notificação de desconto | 5min |
| 4 | **A-02** Limpar snapshots em `devolverVenda()` | 10min |
| 5 | **A-04** Corrigir `limparTodasNotifs()` | 5min |
| 6 | **A-01** Remover "confirmado" do dropdown | 10min |
| 7 | **A-06** Bloquear exclusão de produto vendido | 15min |
| 8 | **C-01** Propagar `parseBRL()` em todos os arquivos | 2h |
| 9 | **C-03** Corrigir schema mismatch (`juros`) | 1h |
| 10 | **C-04** Lock otimista na venda e reserva | 2h |
| 11 | **A-07** Criar `middleware.ts` de auth | 2h |
| 12 | **A-08** Criar RLS separada por cargo | 3h |
| | **Total** | **~12h** |

### Semanas 2–4 — Qualidade e arquitetura
`A-09` (Realtime cleanup) · `A-10` (vendido_por_id) · `A-11` (fundir páginas) · `M-01` (timezone) · `M-02` (useSupabase) · `M-03` (toast) · `M-04` (tratamento de erros) · `M-05` (remover categoria) · `M-06` (extrair libs) · `M-09` (Sentry) · `M-10` (recuperação de senha) · `B-02` (índices SQL)

### Mês 2 — Qualidade de engenharia
`B-03` (testes financeiros) · `B-04` (CI/CD) · `B-05` (staging) · `M-07` (paginação) · `M-08` (erros de carregamento) · `B-07` (exportação CSV)

---

## CONTAGEM FINAL

| Categoria | Crítico | Alto | Médio | Baixo | Total |
|---|---|---|---|---|---|
| Bugs financeiros | 2 | 3 | 1 | 0 | **6** |
| Segurança/Auth | 0 | 2 | 0 | 0 | **2** |
| Bugs funcionais | 2 | 4 | 3 | 1 | **10** |
| Overengineering | 1 | 2 | 4 | 3 | **10** |
| Performance | 0 | 0 | 2 | 2 | **4** |
| Qualidade/Processo | 0 | 0 | 3 | 3 | **6** |
| **Total** | **5** | **11** | **13** | **9** | **38** |

---

*Gerado em Junho 2026 — DeliveryFone Audit v1.0*
