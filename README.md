# Deliveryfone Trade OS

Sistema web em desenvolvimento, criado a partir de necessidades reais de uma operação de varejo de telefonia. A proposta é centralizar em um único ambiente processos que fazem parte da rotina da loja, conectando gestores e vendedores na gestão de estoque, formação de preços, simulações, vendas, avaliação de aparelhos usados e comunicação interna.

## Origem do projeto

A ideia surgiu durante minha experiência na gestão de uma loja de celulares. No dia a dia, comecei a identificar problemas que dificultavam tanto o trabalho dos vendedores quanto o controle da operação pelos gestores.

A loja já utilizava um ERP, mas algumas necessidades específicas da rotina comercial ainda dependiam de consultas, controles paralelos e informações que não estavam disponíveis da forma que a equipe precisava. Antes de criar uma solução própria, busquei adaptar esses processos às ferramentas já utilizadas pela loja, inclusive solicitando relatórios específicos, mas algumas necessidades continuaram sem uma solução adequada para aquele fluxo de trabalho.

Informações como estoque, custos, fornecedores, preços, condições de pagamento, limites de desconto e avaliação de aparelhos usados acabavam distribuídas entre diferentes fontes. Isso fazia com que várias etapas de uma venda ainda dependessem da consulta ou confirmação de um gestor.

Um dos primeiros problemas que identifiquei estava no cálculo das vendas parceladas. As taxas cobradas pelas operadoras das máquinas de cartão eram consideradas de uma forma que não garantia o valor líquido esperado pela loja. A partir disso, comecei a buscar uma maneira de calcular e disponibilizar esses valores de forma mais consistente para a equipe.

Minha primeira solução foi criar uma estrutura no Google Sheets. Nela passei a centralizar estoque, preços e informações dos aparelhos, além de automatizar cálculos de parcelamento, formação de preço e avaliação de aparelhos usados. Também mantinha informações de custos e fornecedores em uma área de controle da gestão.

As planilhas resolveram boa parte dos problemas iniciais, mas, com o uso diário, ficou claro que a operação ainda dependia muito dos gestores. Dúvidas sobre descontos, avaliações, condições de venda e outras decisões continuavam surgindo durante os atendimentos.

Foi a partir dessas limitações que nasceu a ideia do Deliveryfone Trade OS: transformar os processos que eu já vinha organizando em uma aplicação voltada para a rotina da loja, na qual gestores pudessem administrar as regras e informações da operação enquanto vendedores tivessem acesso ao que precisam para atender e vender com mais autonomia.

## Como o sistema está estruturado

Atualmente, o Deliveryfone Trade OS está sendo desenvolvido em torno de dois perfis de usuário: gestor e vendedor. A proposta é que ambos trabalhem sobre a mesma operação e os mesmos dados, mas com acessos e responsabilidades diferentes.

A autenticação e o controle de usuários utilizam o Supabase, com cada perfil associado a uma loja.

### Gestor

O perfil de gestor concentra o controle operacional e as informações restritas da loja, como custos, margens e configurações.

Entre os fluxos já presentes no projeto, o gestor pode:

- cadastrar, editar e excluir produtos;
- acompanhar o estoque por status e consultar o histórico de vendas;
- registrar custos, origem, fornecedor, preços e promoções;
- configurar taxas de parcelamento por operadora;
- configurar valores e critérios usados na avaliação de aparelhos;
- responder a pedidos de desconto enviados pelos vendedores;
- confirmar vendas e acompanhar indicadores e vendas por vendedor.

### Vendedor

O perfil de vendedor é voltado ao atendimento e à negociação. A proposta é permitir que ele encontre no próprio sistema as informações necessárias para conduzir uma venda, sem ter acesso aos dados financeiros e configurações restritas à gestão.

Entre os fluxos já presentes no projeto, o vendedor pode:

- consultar os produtos disponíveis e suas condições comerciais;
- simular pagamentos à vista ou parcelados;
- incluir um aparelho usado na negociação por meio do fluxo de avaliação;
- salvar ou cancelar uma simulação vinculada ao produto;
- reservar um aparelho;
- registrar uma venda para posterior confirmação do gestor;
- solicitar condições de desconto ao gestor;
- conversar com o gestor no contexto de um produto;
- consultar suas vendas confirmadas e indicadores de desempenho.

A separação entre os perfis não é tratada apenas na interface. O projeto também utiliza políticas de Row Level Security (RLS) no banco de dados para controlar o acesso às informações de acordo com a loja e o perfil do usuário.

## Funcionalidades implementadas

O projeto já possui implementação para os principais fluxos que deram origem à ideia, embora eles ainda estejam em processo de revisão, testes e evolução.

Atualmente, estão presentes:

- autenticação de usuários e recuperação de senha;
- controle de acesso por perfil e loja;
- estoque com busca, filtros e diferentes estados de produto;
- cadastro de aparelhos novos e seminovos, com informações como IMEI, capacidade, cor, condição e bateria;
- controle de custos, preços, promoções e tempo em estoque;
- cálculo de vendas parceladas com base nas taxas configuradas;
- configuração de taxas de parcelamento por loja e operadora;
- simulação de vendas com diferentes formas de pagamento, entrada e aparelho usado na troca;
- fluxo de reserva, registro e confirmação de vendas;
- avaliação prévia de aparelhos usados com critérios configuráveis;
- histórico de avaliações;
- solicitações de desconto com aprovação, recusa ou contraproposta;
- mensagens e notificações vinculadas ao fluxo comercial;
- relatórios com informações de vendas, margem, ticket médio e descontos, além de exportação em CSV.

## Regras de negócio

Grande parte das regras do sistema surgiu de situações encontradas na rotina da operação. Entre as principais estão:

- o valor de uma venda parcelada é calculado considerando a taxa da operadora, buscando preservar o valor líquido esperado pela loja;
- custos, margens e outras informações financeiras ficam restritos ao perfil de gestor;
- uma venda registrada pelo vendedor não retira automaticamente o produto do estoque: ela permanece aguardando a conferência e confirmação do gestor;
- reservas e vendas consideram o estado atual do produto para reduzir conflitos sobre o mesmo aparelho;
- condições de desconto fora dos limites disponíveis para o vendedor seguem um fluxo de solicitação e aprovação pelo gestor;
- a avaliação de um aparelho usado funciona como uma estimativa inicial e pode depender de conferência presencial antes da negociação;
- usuários são associados a uma loja, e as permissões no banco ajudam a restringir o acesso aos dados daquela operação.

## Tecnologias presentes no projeto

- Next.js 16 e React 19;
- TypeScript;
- Tailwind CSS 4;
- Supabase (autenticação, PostgreSQL, Row Level Security e Realtime);
- Jest e ts-jest para testes unitários;
- ESLint.

## Desenvolvimento e aprendizado

A definição do problema, dos fluxos e das regras de negócio partiu da minha experiência direta com a operação. Para transformar essa ideia em uma aplicação, utilizei ferramentas de inteligência artificial como apoio durante o desenvolvimento, principalmente na geração de código, implementação das funcionalidades e investigação de problemas.

O projeto também faz parte do meu processo de desenvolvimento técnico. Atualmente, estudo os fundamentos das tecnologias utilizadas e reviso a implementação para compreender como cada parte do sistema funciona, desde a lógica da aplicação até sua integração com o banco de dados.

Esse processo tem como objetivo transformar o projeto não apenas em uma solução para os problemas que deram origem a ele, mas também em uma base prática para desenvolver minha autonomia em programação e evoluir tecnicamente a aplicação.

## Estado atual

O Deliveryfone Trade OS está em desenvolvimento. Diversos fluxos que fazem parte da proposta do sistema já possuem implementação, mas o projeto continua passando por revisão, testes e evolução.

Nesta etapa, além de evoluir as funcionalidades, estou revisando a estrutura e o código existente para compreender melhor a implementação e identificar melhorias que possam ser feitas à medida que avanço nos estudos.

O repositório também possui migrações do Supabase e testes unitários voltados a regras de cálculo financeiro, taxas, avaliação de aparelhos e funções auxiliares.

## Próximos passos

O projeto continuará evoluindo à medida que avanço na revisão da implementação e no desenvolvimento dos meus conhecimentos técnicos. Algumas ideias previstas para a evolução do Trade OS são:

- aprimorar os fluxos e funcionalidades já implementados;
- revisar e melhorar a organização e a estrutura do código;
- ampliar a cobertura de testes;
- desenvolver um catálogo de produtos com fotos e vídeos próprios para cada item, permitindo que o vendedor acesse rapidamente essas mídias e compartilhe com o cliente, especialmente o vídeo do produto específico, durante a venda;
- desenvolver um sistema interno de tarefas, permitindo que gestores atribuam atividades aos funcionários e acompanhem sua conclusão;
- utilizar os dados das tarefas e da operação para ampliar os indicadores disponíveis aos gestores;
- evoluir a comunicação interna entre gestores e vendedores;
- melhorar a experiência de uso e a adaptação do sistema para diferentes dispositivos.

## Executando localmente

### Pré-requisitos

- Node.js;
- npm;
- um projeto no Supabase configurado com a estrutura de banco de dados utilizada pela aplicação.

### Configuração

1. Clone o repositório e acesse a pasta do projeto:

   ```bash
   git clone <URL_DO_REPOSITORIO>
   cd deliveryfone-trade-os
   ```

2. Instale as dependências:

   ```bash
   npm install
   ```

3. Crie um arquivo `.env.local` na raiz do projeto e configure as variáveis de ambiente do Supabase:

   ```env
   NEXT_PUBLIC_SUPABASE_URL=sua_url_do_supabase
   NEXT_PUBLIC_SUPABASE_ANON_KEY=sua_chave_anonima_do_supabase
   ```

   O arquivo `.env.local` não é versionado no repositório. As credenciais devem ser obtidas no projeto correspondente no Supabase.

4. Configure o banco de dados utilizando os scripts SQL disponíveis no diretório `supabase/`.

5. Inicie o ambiente de desenvolvimento:

   ```bash
   npm run dev
   ```

6. Acesse a aplicação em:

   ```text
   http://localhost:3000/login
   ```

### Comandos disponíveis

```bash
npm run dev       # inicia o ambiente de desenvolvimento
npm run build     # gera o build de produção
npm run start     # executa o build de produção
npm run lint      # executa a análise estática do código
npm test          # executa os testes unitários
```
