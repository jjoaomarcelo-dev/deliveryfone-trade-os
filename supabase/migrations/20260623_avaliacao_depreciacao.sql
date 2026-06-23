-- =============================================================
-- AVALIAÇÃO: COLUNA DE DEPRECIAÇÃO — DeliveryFone
-- Adiciona a depreciação (% "DIMINUIR" da planilha) ao valor-base.
-- Idempotente. Supabase: SQL Editor → colar tudo → Run.
--
-- Novo cálculo (no app):
--   valorFinal = valor_base × (1 − (depreciacao_pct
--                                   + Σ % das peças marcadas
--                                   + % da condição) / 100)
-- =============================================================

ALTER TABLE store_avaliacao_modelos
  ADD COLUMN IF NOT EXISTS depreciacao_pct NUMERIC NOT NULL DEFAULT 0;

-- Backfill com os valores da planilha do gestor.
-- Só preenche onde ainda está 0 (não sobrescreve ajustes já feitos).
UPDATE store_avaliacao_modelos t
SET depreciacao_pct = d.dep
FROM (VALUES
  ('iPhone 11',          50),
  ('iPhone 11 Pro',      50),
  ('iPhone 11 Pro Max',  50),
  ('iPhone 12',          50),
  ('iPhone 12 Mini',     50),
  ('iPhone 12 Pro',      32),
  ('iPhone 12 Pro Max',  32),
  ('iPhone 13',          33),
  ('iPhone 13 Mini',     33),
  ('iPhone 13 Pro',      28),
  ('iPhone 13 Pro Max',  28),
  ('iPhone 14',          32),
  ('iPhone 14 Plus',     32),
  ('iPhone 14 Pro',      26),
  ('iPhone 14 Pro Max',  26),
  ('iPhone 15',          28),
  ('iPhone 15 Plus',     28),
  ('iPhone 15 Pro',      24),
  ('iPhone 15 Pro Max',  24),
  ('iPhone 16',          24),
  ('iPhone 16 Plus',     24),
  ('iPhone 16 Pro',      22),
  ('iPhone 16 Pro Max',  22),
  ('iPhone 16e',         28),
  ('iPhone 17',          22),
  ('iPhone 17 Air',      22),
  ('iPhone 17 Pro',      22),
  ('iPhone 17 Pro Max',  22)
) AS d(modelo, dep)
WHERE t.modelo = d.modelo AND t.depreciacao_pct = 0;

-- =============================================================
-- FIM — Verificar: store_avaliacao_modelos.depreciacao_pct preenchida.
-- =============================================================
