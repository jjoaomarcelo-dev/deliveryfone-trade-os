# DeliveryFone Trade OS

Aplicação web para controlar o fluxo do estoque, formar preços e apoiar negociações em lojas de celulares.

## Sobre o projeto

O DeliveryFone Trade OS surgiu de problemas que observei durante minha experiência como gerente de uma loja de telefonia. Informações como custo, margem, tempo em estoque, taxas de cartão e limites de negociação ficavam divididas entre ERP, planilhas e consultas à gestão.

O sistema não busca substituir um ERP. Sua proposta é acompanhar o aparelho durante o fluxo comercial e transformar as regras definidas pelo gestor em informações úteis para a venda. Com isso, o vendedor consegue consultar condições de pagamento, simular uma negociação e considerar um aparelho usado na troca sem precisar solicitar cada cálculo à gestão.

Este repositório apresenta uma versão de portfólio. Dados reais, credenciais e configurações do ambiente utilizado pela loja não estão incluídos.

## Meu papel no projeto

Minha contribuição partiu dos problemas que identifiquei durante minha experiência na gestão da loja. Realizei o levantamento e a organização dos requisitos, defini os fluxos e as regras de negócio e validei funcionalidades com usuários, identificando problemas e acompanhando ajustes.

A implementação do código contou com apoio significativo de ferramentas de inteligência artificial. Minhas contribuições diretas estão na análise do problema, na definição de requisitos e regras de negócio e na validação dos fluxos com usuários.

## Demonstração

Os vídeos apresentam o sistema em uso nos dois perfis de acesso. A demonstração começa pela experiência do vendedor, principal usuário do fluxo comercial, e depois mostra os recursos de configuração e acompanhamento disponíveis ao gestor.

### Visão do vendedor

https://github.com/user-attachments/assets/63b61df3-e83e-4271-a6a9-280570992b0b

Consulta do estoque, avaliação de aparelho usado, criação de diferentes simulações para clientes, reserva e registro de venda com formas de pagamento distintas.

### Visão do gestor

https://github.com/user-attachments/assets/b73eeff2-b501-4b63-adde-350d098750f4

Cadastro e precificação de produtos, acompanhamento de margens estimadas, confirmação de vendas, indicadores e configuração das regras utilizadas pela equipe.

> **Dados de demonstração:** usuários, IMEIs, produtos, preços, custos, taxas, juros e margens exibidos são fictícios. Os valores são configuráveis e os cenários têm finalidade exclusivamente demonstrativa, sem representar operações comerciais ou fiscais reais. A taxa tributária mostrada pelo sistema é apenas uma estimativa gerencial para apoiar a precificação; ela não substitui cálculo contábil ou orientação fiscal.

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

## Tecnologias

- Next.js;
- React;
- TypeScript;
- Tailwind CSS;
- Supabase;
- PostgreSQL (banco de dados utilizado pelo Supabase);
- Jest;
- Git e GitHub.

## Como executar

O projeto depende de uma estrutura compatível no Supabase. Sem essa configuração, é possível analisar o código e as interfaces, mas os fluxos que consultam ou salvam dados não funcionarão completamente.

### Pré-requisitos

- Node.js 20.9 ou superior;
- npm;
- projeto Supabase próprio.

### Instalação

1. Clone o repositório:

   ```bash
   git clone https://github.com/jjoaomarcelo-dev/deliveryfone-trade-os.git
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

Versão de portfólio disponível para consulta do código e das demonstrações. Novas funcionalidades não estão em desenvolvimento no momento.
