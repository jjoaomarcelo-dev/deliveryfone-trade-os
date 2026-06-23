-- =============================================================
-- AVALIAÇÃO DE COMPRA DE CELULAR — DeliveryFone
-- Registra as avaliações de aparelhos de clientes feitas na loja.
-- Idempotente. Supabase: SQL Editor → colar tudo → Run.
--
-- Cálculo (no app, lib/avaliacao.ts):
--   valor = valorBase[modelo]
--         × multiplicadorCapacidade[capacidade]
--         × Π(multiplicador de cada condição)
-- =============================================================

CREATE TABLE IF NOT EXISTS avaliacoes (
  id              UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  store_id        UUID NOT NULL REFERENCES stores(id)   ON DELETE CASCADE,
  avaliador_id    UUID REFERENCES profiles(id)          ON DELETE SET NULL,
  avaliador_nome  TEXT,
  cliente_nome    TEXT,
  marca           TEXT NOT NULL,
  modelo          TEXT NOT NULL,
  capacidade      TEXT,
  cor             TEXT,
  condicoes       JSONB NOT NULL DEFAULT '{}'::jsonb,
  valor_base      NUMERIC,
  valor_avaliado  NUMERIC NOT NULL,
  observacoes     TEXT,
  created_at      TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_avaliacoes_store
  ON avaliacoes (store_id, created_at DESC);


-- =============================================================
-- RLS — escopo por filial
-- =============================================================

ALTER TABLE avaliacoes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "avaliacoes_select" ON avaliacoes;
DROP POLICY IF EXISTS "avaliacoes_insert" ON avaliacoes;
DROP POLICY IF EXISTS "avaliacoes_delete" ON avaliacoes;

-- SELECT: qualquer cargo da mesma filial
CREATE POLICY "avaliacoes_select" ON avaliacoes
  FOR SELECT USING (
    store_id = (SELECT mp.store_id FROM get_my_profile() mp LIMIT 1)
  );

-- INSERT: qualquer cargo da própria filial (gestor e vendedor avaliam)
CREATE POLICY "avaliacoes_insert" ON avaliacoes
  FOR INSERT WITH CHECK (
    store_id = (SELECT mp.store_id FROM get_my_profile() mp LIMIT 1)
  );

-- DELETE: apenas gestor da própria filial
CREATE POLICY "avaliacoes_delete" ON avaliacoes
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM get_my_profile() mp
      WHERE mp.cargo = 'gestor' AND mp.store_id = store_id
    )
  );


-- =============================================================
-- FIM
-- Verificar: Table Editor → avaliacoes (vazia),
--   Authentication → Policies → avaliacoes (3 policies).
-- =============================================================
