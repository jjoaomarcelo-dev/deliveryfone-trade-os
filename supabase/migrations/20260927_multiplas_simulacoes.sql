-- Permite que um vendedor mantenha várias simulações do mesmo produto.
-- Cada registro representa uma negociação independente por cliente.

ALTER TABLE simulacoes
  DROP CONSTRAINT IF EXISTS simulacoes_unica;

CREATE INDEX IF NOT EXISTS idx_simulacoes_produto_vendedor
  ON simulacoes (produto_id, vendedor_id, created_at DESC);
