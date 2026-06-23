-- =============================================================
-- CONFIGURAÇÃO DE AVALIAÇÃO DE COMPRA POR FILIAL — DeliveryFone
-- Torna a tabela de avaliação editável por loja (como as taxas).
-- Idempotente. Supabase: SQL Editor → colar tudo → Run.
--
-- Modelo:
--   store_avaliacao_modelos  valor-base + % de desconto por peça, por filial/modelo
--   store_avaliacao_config   condições e problemas graves (→ técnico), por filial
--
-- Cálculo (no app):
--   valorFinal = valor_base × (1 − (Σ % das peças marcadas + % da condição)/100)
--   Problema grave marcado ⇒ exige avaliação presencial por técnico.
-- =============================================================


-- =============================================================
-- 1. VALOR-BASE E DESCONTOS POR PEÇA (por filial × modelo)
--    Tabela "larga" espelhando a planilha (1 linha por modelo).
-- =============================================================

CREATE TABLE IF NOT EXISTS store_avaliacao_modelos (
  id                   UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  store_id             UUID NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  modelo               TEXT NOT NULL,
  valor_base           NUMERIC NOT NULL DEFAULT 0,  -- valor de venda total
  depreciacao_pct      NUMERIC NOT NULL DEFAULT 0,  -- desconto base sobre o valor (planilha "DIMINUIR %")
  pct_tela             NUMERIC NOT NULL DEFAULT 0,
  pct_tampa            NUMERIC NOT NULL DEFAULT 0,
  pct_bateria          NUMERIC NOT NULL DEFAULT 0,
  pct_camera_traseira  NUMERIC NOT NULL DEFAULT 0,
  pct_camera_frontal   NUMERIC NOT NULL DEFAULT 0,
  pct_carcaca          NUMERIC NOT NULL DEFAULT 0,
  updated_at           TIMESTAMPTZ DEFAULT now(),
  updated_by           UUID REFERENCES profiles(id) ON DELETE SET NULL,
  CONSTRAINT store_avaliacao_modelos_unico UNIQUE (store_id, modelo)
);

CREATE INDEX IF NOT EXISTS idx_store_aval_modelos
  ON store_avaliacao_modelos (store_id);


-- =============================================================
-- 2. CONFIG GERAL POR FILIAL (condições + problemas graves)
--    JSONB para edição flexível de listas pelo gestor.
-- =============================================================

CREATE TABLE IF NOT EXISTS store_avaliacao_config (
  store_id          UUID PRIMARY KEY REFERENCES stores(id) ON DELETE CASCADE,
  -- [{ "nome": "Bom", "pct": 5 }, ...]
  condicoes         JSONB NOT NULL DEFAULT '[]'::jsonb,
  -- ["Celular não liga", "Não carrega", ...]
  problemas_graves  JSONB NOT NULL DEFAULT '[]'::jsonb,
  updated_at        TIMESTAMPTZ DEFAULT now(),
  updated_by        UUID REFERENCES profiles(id) ON DELETE SET NULL
);


-- =============================================================
-- 3. AVALIACOES — registrar se precisou de técnico
-- =============================================================

ALTER TABLE avaliacoes
  ADD COLUMN IF NOT EXISTS precisa_tecnico BOOLEAN NOT NULL DEFAULT false;


-- =============================================================
-- 4. SEED — valores-base e % por peça (da planilha do gestor)
--    Modelos fora da planilha usam valores espelhados de modelos
--    próximos (placeholder editável). Só insere o que faltar.
-- =============================================================

INSERT INTO store_avaliacao_modelos
  (store_id, modelo, valor_base, depreciacao_pct, pct_tela, pct_tampa, pct_bateria, pct_camera_traseira, pct_camera_frontal, pct_carcaca)
SELECT s.id, m.modelo, m.valor_base, m.dep, m.tela, m.tampa, m.bateria, m.cam_t, m.cam_f, m.carcaca
FROM stores s
CROSS JOIN (VALUES
  ('iPhone 11',          570, 50, 10, 10, 12, 10, 12, 8),
  ('iPhone 11 Pro',      700, 50, 12, 12, 12, 12,  9, 8),
  ('iPhone 11 Pro Max',  850, 50, 12, 12, 12, 12,  9, 8),
  ('iPhone 12',         1000, 50, 15, 10, 15, 12,  9, 8),
  ('iPhone 12 Mini',     900, 50, 15, 10, 15, 12,  9, 8),
  ('iPhone 12 Pro',     1500, 32, 10, 10, 10, 10,  9, 8),
  ('iPhone 12 Pro Max', 1700, 32, 10, 10, 10, 10,  9, 8),
  ('iPhone 13',         1700, 33, 13, 10, 13, 13, 10, 8),
  ('iPhone 13 Mini',    1500, 33, 13, 10, 13, 13, 10, 8),
  ('iPhone 13 Pro',     2250, 28, 12, 12, 12, 12, 10, 8),
  ('iPhone 13 Pro Max', 2750, 28, 12, 12, 12, 12, 10, 8),
  ('iPhone 14',         1800, 32, 10, 10, 10, 12, 10, 8),
  ('iPhone 14 Plus',    2000, 32, 10, 10, 10, 12, 10, 8),
  ('iPhone 14 Pro',     2700, 26,  9, 10, 10, 13, 12, 8),
  ('iPhone 14 Pro Max', 3000, 26,  9, 10, 10, 13, 12, 8),
  ('iPhone 15',         2500, 28, 10, 10, 10, 13, 12, 8),
  ('iPhone 15 Plus',    2700, 28, 10, 10, 10, 13, 12, 8),
  ('iPhone 15 Pro',     2800, 24, 15, 15, 13, 14, 12, 8),
  ('iPhone 15 Pro Max', 3000, 24, 15, 15, 13, 14, 12, 8),
  ('iPhone 16',         3300, 24, 15, 15, 13, 15, 12, 8),
  ('iPhone 16 Plus',    3500, 24, 15, 15, 13, 15, 12, 8),
  ('iPhone 16 Pro',     4300, 22, 15, 15, 13, 15, 12, 8),
  ('iPhone 16 Pro Max', 4700, 22, 15, 15, 13, 15, 12, 8),
  ('iPhone 16e',        2500, 28, 15, 15, 13, 15, 12, 8),
  ('iPhone 17',         3300, 22, 15, 15, 13, 15, 12, 8),
  ('iPhone 17 Air',     3500, 22, 15, 15, 13, 15, 12, 8),
  ('iPhone 17 Pro',     4300, 22, 15, 15, 13, 15, 12, 8),
  ('iPhone 17 Pro Max', 4700, 22, 15, 15, 13, 15, 12, 8)
) AS m(modelo, valor_base, dep, tela, tampa, bateria, cam_t, cam_f, carcaca)
ON CONFLICT (store_id, modelo) DO NOTHING;


-- Config geral padrão por filial
INSERT INTO store_avaliacao_config (store_id, condicoes, problemas_graves)
SELECT s.id,
  '[
     {"nome": "Impecável",   "pct": 0},
     {"nome": "Bom",         "pct": 5},
     {"nome": "Regular",     "pct": 12},
     {"nome": "Com avarias", "pct": 20}
   ]'::jsonb,
  '[
     "Celular não liga",
     "Rede Wi-Fi não funciona",
     "Microfone não funciona",
     "Botões power",
     "Botões de volume",
     "Não carrega"
   ]'::jsonb
FROM stores s
ON CONFLICT (store_id) DO NOTHING;


-- =============================================================
-- 5. RLS — escopo por filial (igual às taxas)
-- =============================================================

ALTER TABLE store_avaliacao_modelos ENABLE ROW LEVEL SECURITY;
ALTER TABLE store_avaliacao_config  ENABLE ROW LEVEL SECURITY;

-- ---- store_avaliacao_modelos ----
DROP POLICY IF EXISTS "store_aval_modelos_select" ON store_avaliacao_modelos;
DROP POLICY IF EXISTS "store_aval_modelos_write"  ON store_avaliacao_modelos;

-- SELECT: qualquer cargo da mesma filial (vendedor avalia)
CREATE POLICY "store_aval_modelos_select" ON store_avaliacao_modelos
  FOR SELECT USING (
    store_id = (SELECT mp.store_id FROM get_my_profile() mp LIMIT 1)
  );

-- INSERT/UPDATE/DELETE: apenas gestor da própria filial
CREATE POLICY "store_aval_modelos_write" ON store_avaliacao_modelos
  FOR ALL USING (
    EXISTS (SELECT 1 FROM get_my_profile() mp WHERE mp.cargo = 'gestor' AND mp.store_id = store_id)
  ) WITH CHECK (
    EXISTS (SELECT 1 FROM get_my_profile() mp WHERE mp.cargo = 'gestor' AND mp.store_id = store_id)
  );

-- ---- store_avaliacao_config ----
DROP POLICY IF EXISTS "store_aval_config_select" ON store_avaliacao_config;
DROP POLICY IF EXISTS "store_aval_config_write"  ON store_avaliacao_config;

CREATE POLICY "store_aval_config_select" ON store_avaliacao_config
  FOR SELECT USING (
    store_id = (SELECT mp.store_id FROM get_my_profile() mp LIMIT 1)
  );

CREATE POLICY "store_aval_config_write" ON store_avaliacao_config
  FOR ALL USING (
    EXISTS (SELECT 1 FROM get_my_profile() mp WHERE mp.cargo = 'gestor' AND mp.store_id = store_id)
  ) WITH CHECK (
    EXISTS (SELECT 1 FROM get_my_profile() mp WHERE mp.cargo = 'gestor' AND mp.store_id = store_id)
  );


-- =============================================================
-- FIM
-- Verificar: Table Editor → store_avaliacao_modelos (28 × nº de lojas),
--   store_avaliacao_config (1 por loja), avaliacoes.precisa_tecnico.
-- =============================================================
