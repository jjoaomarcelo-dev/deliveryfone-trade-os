-- =============================================================
-- AVALIAÇÃO: VALOR-BASE POR CAPACIDADE (memória) — DeliveryFone
-- Cada armazenamento tem um valor de venda diferente.
-- Idempotente. Supabase: SQL Editor → colar tudo → Run.
--
-- O valor-base passa a ser por (filial, modelo, capacidade).
-- Depreciação, % por peça e condição continuam por modelo (são %).
-- =============================================================

CREATE TABLE IF NOT EXISTS store_avaliacao_valores (
  id          UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  store_id    UUID NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  modelo      TEXT NOT NULL,
  capacidade  TEXT NOT NULL,
  valor_base  NUMERIC NOT NULL DEFAULT 0,
  updated_at  TIMESTAMPTZ DEFAULT now(),
  updated_by  UUID REFERENCES profiles(id) ON DELETE SET NULL,
  CONSTRAINT store_aval_valores_unico UNIQUE (store_id, modelo, capacidade)
);

CREATE INDEX IF NOT EXISTS idx_store_aval_valores
  ON store_avaliacao_valores (store_id, modelo);


-- =============================================================
-- SEED — gera o valor por capacidade a partir do valor-base do
-- modelo já configurado na filial × um fator por capacidade.
-- Só insere o que faltar (não sobrescreve ajustes do gestor).
-- =============================================================

INSERT INTO store_avaliacao_valores (store_id, modelo, capacidade, valor_base)
SELECT
  sm.store_id,
  sm.modelo,
  c.capacidade,
  ROUND(sm.valor_base * CASE c.capacidade
    WHEN '64GB'  THEN 0.90
    WHEN '128GB' THEN 1.00
    WHEN '256GB' THEN 1.10
    WHEN '512GB' THEN 1.20
    WHEN '1TB'   THEN 1.30
    ELSE 1.00
  END)
FROM store_avaliacao_modelos sm
JOIN (VALUES
  ('iPhone 11','64GB'),        ('iPhone 11','128GB'),       ('iPhone 11','256GB'),
  ('iPhone 11 Pro','64GB'),    ('iPhone 11 Pro','256GB'),   ('iPhone 11 Pro','512GB'),
  ('iPhone 11 Pro Max','64GB'),('iPhone 11 Pro Max','256GB'),('iPhone 11 Pro Max','512GB'),
  ('iPhone 12','64GB'),        ('iPhone 12','128GB'),       ('iPhone 12','256GB'),
  ('iPhone 12 Mini','64GB'),   ('iPhone 12 Mini','128GB'),  ('iPhone 12 Mini','256GB'),
  ('iPhone 12 Pro','128GB'),   ('iPhone 12 Pro','256GB'),   ('iPhone 12 Pro','512GB'),
  ('iPhone 12 Pro Max','128GB'),('iPhone 12 Pro Max','256GB'),('iPhone 12 Pro Max','512GB'),
  ('iPhone 13','128GB'),       ('iPhone 13','256GB'),       ('iPhone 13','512GB'),
  ('iPhone 13 Mini','128GB'),  ('iPhone 13 Mini','256GB'),  ('iPhone 13 Mini','512GB'),
  ('iPhone 13 Pro','128GB'),   ('iPhone 13 Pro','256GB'),   ('iPhone 13 Pro','512GB'),   ('iPhone 13 Pro','1TB'),
  ('iPhone 13 Pro Max','128GB'),('iPhone 13 Pro Max','256GB'),('iPhone 13 Pro Max','512GB'),('iPhone 13 Pro Max','1TB'),
  ('iPhone 14','128GB'),       ('iPhone 14','256GB'),       ('iPhone 14','512GB'),
  ('iPhone 14 Plus','128GB'),  ('iPhone 14 Plus','256GB'),  ('iPhone 14 Plus','512GB'),
  ('iPhone 14 Pro','128GB'),   ('iPhone 14 Pro','256GB'),   ('iPhone 14 Pro','512GB'),   ('iPhone 14 Pro','1TB'),
  ('iPhone 14 Pro Max','128GB'),('iPhone 14 Pro Max','256GB'),('iPhone 14 Pro Max','512GB'),('iPhone 14 Pro Max','1TB'),
  ('iPhone 15','128GB'),       ('iPhone 15','256GB'),       ('iPhone 15','512GB'),
  ('iPhone 15 Plus','128GB'),  ('iPhone 15 Plus','256GB'),  ('iPhone 15 Plus','512GB'),
  ('iPhone 15 Pro','128GB'),   ('iPhone 15 Pro','256GB'),   ('iPhone 15 Pro','512GB'),   ('iPhone 15 Pro','1TB'),
  ('iPhone 15 Pro Max','256GB'),('iPhone 15 Pro Max','512GB'),('iPhone 15 Pro Max','1TB'),
  ('iPhone 16','128GB'),       ('iPhone 16','256GB'),       ('iPhone 16','512GB'),
  ('iPhone 16 Plus','128GB'),  ('iPhone 16 Plus','256GB'),  ('iPhone 16 Plus','512GB'),
  ('iPhone 16 Pro','128GB'),   ('iPhone 16 Pro','256GB'),   ('iPhone 16 Pro','512GB'),   ('iPhone 16 Pro','1TB'),
  ('iPhone 16 Pro Max','256GB'),('iPhone 16 Pro Max','512GB'),('iPhone 16 Pro Max','1TB'),
  ('iPhone 16e','128GB'),      ('iPhone 16e','256GB'),
  ('iPhone 17','128GB'),       ('iPhone 17','256GB'),       ('iPhone 17','512GB'),
  ('iPhone 17 Air','128GB'),   ('iPhone 17 Air','256GB'),   ('iPhone 17 Air','512GB'),
  ('iPhone 17 Pro','256GB'),   ('iPhone 17 Pro','512GB'),   ('iPhone 17 Pro','1TB'),
  ('iPhone 17 Pro Max','256GB'),('iPhone 17 Pro Max','512GB'),('iPhone 17 Pro Max','1TB')
) AS c(modelo, capacidade) ON c.modelo = sm.modelo
ON CONFLICT (store_id, modelo, capacidade) DO NOTHING;


-- =============================================================
-- RLS — escopo por filial (igual às demais)
-- =============================================================

ALTER TABLE store_avaliacao_valores ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "store_aval_valores_select" ON store_avaliacao_valores;
DROP POLICY IF EXISTS "store_aval_valores_write"  ON store_avaliacao_valores;

CREATE POLICY "store_aval_valores_select" ON store_avaliacao_valores
  FOR SELECT USING (
    store_id = (SELECT mp.store_id FROM get_my_profile() mp LIMIT 1)
  );

CREATE POLICY "store_aval_valores_write" ON store_avaliacao_valores
  FOR ALL USING (
    EXISTS (SELECT 1 FROM get_my_profile() mp WHERE mp.cargo = 'gestor' AND mp.store_id = store_id)
  ) WITH CHECK (
    EXISTS (SELECT 1 FROM get_my_profile() mp WHERE mp.cargo = 'gestor' AND mp.store_id = store_id)
  );


-- =============================================================
-- FIM — Verificar: store_avaliacao_valores (~76 linhas por loja).
-- =============================================================
