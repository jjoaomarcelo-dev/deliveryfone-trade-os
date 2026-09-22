# Supabase

Esta pasta reúne os scripts SQL usados na evolução do banco de dados do DeliveryFone Trade OS.

Os arquivos registram mudanças em tabelas, políticas de acesso, índices, taxas de parcelamento, avaliações, simulações e gerenciamento de usuários.

## Organização

```text
supabase/
├── migrations/          # alterações incrementais ordenadas pela data
├── migration_fase1.sql  # consolidação histórica da primeira fase
└── setup_completo.sql   # consolidação das estruturas operacionais
```

## Migrações

Os arquivos de `migrations/` seguem o formato `AAAAMMDD_descricao.sql`. A data no nome ajuda a identificar a ordem em que as alterações foram criadas.

Entre as estruturas documentadas estão:

- índices e políticas de Row Level Security;
- reservas e identificação de vendedores;
- taxas de parcelamento por filial e operadora;
- avaliações e critérios de compra de aparelhos usados;
- simulações de vendas;
- comunicação entre gestor e vendedor;
- gerenciamento e auditoria de usuários.

## Aplicação dos scripts

Os scripts foram criados para o banco usado durante o desenvolvimento e pressupõem uma estrutura básica compatível. `setup_completo.sql` consolida parte da evolução operacional, mas não funciona como criação independente de um banco vazio.

Antes de executar qualquer arquivo:

1. confira quais migrações já foram aplicadas no projeto Supabase;
2. faça backup do banco;
3. revise o conteúdo do script;
4. aplique somente as alterações necessárias, respeitando a ordem das datas;
5. valide as políticas e os fluxos em um ambiente de teste.

Os scripts podem ser executados pelo SQL Editor do Supabase. Eles não devem ser aplicados diretamente em produção sem revisão.

## Segurança

As políticas do banco complementam as validações realizadas pela aplicação. Chaves administrativas e dados reais da operação não fazem parte deste repositório.

Alterações que utilizam `SUPABASE_SERVICE_ROLE_KEY` devem ser executadas somente no servidor, pois essa chave ignora as políticas de Row Level Security.
