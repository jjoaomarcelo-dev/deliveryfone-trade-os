-- A-10: Rastrear vendedor por UUID em vez de string
-- Rodar no Supabase SQL Editor

ALTER TABLE products
  ADD COLUMN IF NOT EXISTS vendido_por_id UUID REFERENCES auth.users(id);

COMMENT ON COLUMN products.vendido_por_id IS
  'UUID do vendedor que registrou a venda. Mais confiável que vendido_por (string) para filtros no relatório.';

-- Índice para relatórios filtrados por vendedor
CREATE INDEX IF NOT EXISTS idx_products_vendido_por_id
  ON products(vendido_por_id)
  WHERE vendido_por_id IS NOT NULL;
