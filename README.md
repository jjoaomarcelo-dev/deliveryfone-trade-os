# DeliveryFone Trade OS

Aplicação web para controlar o fluxo do estoque, formar preços e apoiar negociações em lojas de celulares.

## Sobre o projeto

O DeliveryFone Trade OS surgiu de problemas que observei durante minha experiência como gerente de uma loja de telefonia. Informações como custo, margem, tempo em estoque, taxas de cartão e limites de negociação ficavam divididas entre ERP, planilhas e consultas à gestão.

O sistema não busca substituir um ERP. Sua proposta é acompanhar o aparelho durante o fluxo comercial e transformar as regras definidas pelo gestor em informações úteis para a venda. Com isso, o vendedor consegue consultar condições de pagamento, simular uma negociação e considerar um aparelho usado na troca sem precisar solicitar cada cálculo à gestão.

Este repositório apresenta uma versão de portfólio. Dados reais, credenciais e configurações do ambiente utilizado pela loja não estão incluídos.

## Meu papel no projeto

O projeto surgiu da minha experiência com a gestão de uma loja de telefonia. Minha participação envolveu identificar os problemas da operação, definir os fluxos, organizar as regras de negócio e validar o funcionamento da solução.

A implementação técnica foi desenvolvida com apoio de ferramentas de inteligência artificial e vem sendo revisada conforme avanço nos estudos de desenvolvimento web.

Como desenvolvedor front-end júnior, meu foco no projeto está na construção das interfaces, na experiência de uso e na compreensão do código utilizado em cada fluxo.

## Funcionalidades

- login e recuperação de senha;
- perfis de gestor e vendedor;
- cadastro e consulta de aparelhos novos e seminovos;
- acompanhamento do aparelho durante o fluxo do estoque;
- registro de custo, margem, preço e tempo em estoque;
- formação de preços conforme as regras definidas pela gestão;
- cálculo de valores por forma de pagamento e quantidade de parcelas;
- simulação de negociações com entrada, parcelamento e aparelho usado na troca;
- avaliação de aparelhos usados para apoiar a negociação;
- reserva e atualização da situação do aparelho;
- solicitação e aprovação de descontos;
- gerenciamento de usuários;
- indicadores comerciais e exportação em CSV.

## Telas

### Login

Autenticação dos usuários e recuperação de senha.

![Tela de login do DeliveryFone Trade OS](docs/images/login.png)

### Painel principal

Resumo da situação dos aparelhos no estoque e acesso aos principais fluxos comerciais.

![Painel principal com indicadores e atalhos](docs/images/painel.png)

### Avaliação de aparelhos

Formulário para estimar o valor de um aparelho usado e considerar esse valor na negociação.

![Fluxo de avaliação de compra de celular](docs/images/avaliacao.png)

### Relatórios

Consulta de indicadores por período e por vendedor para acompanhar o resultado das negociações.

![Relatórios de vendas e desempenho](docs/images/relatorios.png)

### Configurações

Área do gestor para administrar usuários e definir taxas de pagamento e critérios de avaliação.

![Configurações administrativas do sistema](docs/images/configuracoes.png)

## Tecnologias

- Next.js;
- React;
- TypeScript;
- Tailwind CSS;
- Supabase;
- Jest;
- Git e GitHub.

## O que pratiquei

- criação de interfaces responsivas com React e Tailwind CSS;
- organização de páginas e componentes com Next.js;
- uso de TypeScript em formulários e regras da aplicação;
- integração da interface com autenticação e banco de dados;
- tratamento de estados, validações e mensagens de retorno;
- transformação de necessidades do negócio em fluxos de tela;
- implementação de cálculos de preço e regras de negociação;
- testes automatizados para cálculos e regras importantes;
- organização do desenvolvimento com Git e GitHub.

## Como executar

O projeto depende de uma estrutura compatível no Supabase. Sem essa configuração, é possível analisar o código e as interfaces, mas os fluxos que consultam ou salvam dados não funcionarão completamente.

### Pré-requisitos

- Node.js 20 ou superior;
- npm;
- projeto Supabase próprio.

### Instalação

1. Clone o repositório:

   ```bash
   git clone <URL_DO_REPOSITORIO>
   cd deliveryfone-trade-os
   ```

2. Instale as dependências:

   ```bash
   npm install
   ```

3. Crie um arquivo `.env.local` na raiz do projeto:

   ```env
   NEXT_PUBLIC_SUPABASE_URL=sua_url_do_supabase
   NEXT_PUBLIC_SUPABASE_ANON_KEY=sua_chave_anonima_do_supabase
   SUPABASE_SERVICE_ROLE_KEY=sua_chave_administrativa
   ```

4. Configure no Supabase as estruturas documentadas na pasta `supabase/`.

5. Inicie o projeto:

   ```bash
   npm run dev
   ```

6. Acesse `http://localhost:3000/login`.

## Comandos disponíveis

```bash
npm run dev       # inicia o ambiente de desenvolvimento
npm run build     # gera o build de produção
npm run lint      # verifica o código com ESLint
npm test          # executa os testes
```

## Status

O projeto está em desenvolvimento e possui um ambiente privado de teste. As funcionalidades são revisadas conforme o uso e o avanço dos meus estudos.
