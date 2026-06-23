-- =============================================================
-- TAXAS DE PARCELAMENTO POR FILIAL E OPERADORA — DeliveryFone
-- Idempotente. Supabase: SQL Editor → colar tudo → Run.
--
-- Modelo:
--   operadoras            catálogo global extensível (Banrisul, Stone, Cielo, ...)
--   store_operadora_taxas taxa por (filial, operadora, parcela) — 1x..12x
--   store_payment_config  operadora ativa por filial
--   taxa_audit            histórico/auditoria das alterações de taxa
--
-- Regra de cálculo (runtime, não altera preço do produto):
--   valorParcelado = valorVista / (1 - taxa/100)
-- =============================================================


-- =============================================================
-- 1. CATÁLOGO DE OPERADORAS (global)
-- =============================================================

CREATE TABLE IF NOT EXISTS operadoras (
  id          UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  nome        TEXT NOT NULL UNIQUE,
  ativo       BOOLEAN NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ DEFAULT now()
);

-- Seed inicial (idempotente)
INSERT INTO operadoras (nome)
VALUES ('Banrisul'), ('Itaú')
ON CONFLICT (nome) DO NOTHING;


-- =============================================================
-- 2. TAXAS POR FILIAL / OPERADORA / PARCELA
-- =============================================================

CREATE TABLE IF NOT EXISTS store_operadora_taxas (
  id            UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  store_id      UUID NOT NULL REFERENCES stores(id)     ON DELETE CASCADE,
  operadora_id  UUID NOT NULL REFERENCES operadoras(id) ON DELETE CASCADE,
  parcelas      INTEGER NOT NULL,
  taxa          NUMERIC NOT NULL DEFAULT 0,
  updated_at    TIMESTAMPTZ DEFAULT now(),
  updated_by    UUID REFERENCES profiles(id) ON DELETE SET NULL,
  CONSTRAINT store_operadora_taxas_unica UNIQUE (store_id, operadora_id, parcelas),
  CONSTRAINT taxa_valida     CHECK (taxa >= 0 AND taxa < 100),
  CONSTRAINT parcelas_valida CHECK (parcelas >= 1 AND parcelas <= 21)
);

CREATE INDEX IF NOT EXISTS idx_store_op_taxas_lookup
  ON store_operadora_taxas (store_id, operadora_id, parcelas);


-- =============================================================
-- 3. OPERADORA ATIVA POR FILIAL
-- =============================================================

CREATE TABLE IF NOT EXISTS store_payment_config (
  store_id            UUID PRIMARY KEY REFERENCES stores(id) ON DELETE CASCADE,
  operadora_ativa_id  UUID REFERENCES operadoras(id) ON DELETE SET NULL,
  updated_at          TIMESTAMPTZ DEFAULT now(),
  updated_by          UUID REFERENCES profiles(id) ON DELETE SET NULL
);


-- =============================================================
-- 4. AUDITORIA / HISTÓRICO DE ALTERAÇÕES DE TAXA
-- =============================================================

CREATE TABLE IF NOT EXISTS taxa_audit (
  id              UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  store_id        UUID REFERENCES stores(id)     ON DELETE CASCADE,
  operadora_id    UUID REFERENCES operadoras(id) ON DELETE SET NULL,
  operadora_nome  TEXT,
  parcelas        INTEGER,
  valor_anterior  NUMERIC,
  valor_novo      NUMERIC,
  usuario_id      UUID REFERENCES profiles(id) ON DELETE SET NULL,
  usuario_nome    TEXT,
  created_at      TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_taxa_audit_store
  ON taxa_audit (store_id, created_at DESC);


-- =============================================================
-- 5. TRIGGER DE AUDITORIA (à prova de adulteração via front)
--    Grava em taxa_audit toda alteração de valor de taxa.
-- =============================================================

CREATE OR REPLACE FUNCTION fn_audit_taxa()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_nome_user TEXT;
  v_nome_op   TEXT;
BEGIN
  -- Pula operações do sistema/seed (sem usuário autenticado): não polui o histórico
  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;

  -- Pula criação de parcela "não oferecida" (taxa 0) — sem valor histórico
  IF TG_OP = 'INSERT' AND NEW.taxa = 0 THEN
    RETURN NEW;
  END IF;

  -- Só audita quando o valor realmente muda
  IF TG_OP = 'UPDATE' AND NEW.taxa IS NOT DISTINCT FROM OLD.taxa THEN
    RETURN NEW;
  END IF;

  SELECT nome INTO v_nome_user FROM profiles  WHERE id = auth.uid();
  SELECT nome INTO v_nome_op   FROM operadoras WHERE id = NEW.operadora_id;

  INSERT INTO taxa_audit (
    store_id, operadora_id, operadora_nome, parcelas,
    valor_anterior, valor_novo, usuario_id, usuario_nome
  ) VALUES (
    NEW.store_id, NEW.operadora_id, v_nome_op, NEW.parcelas,
    CASE WHEN TG_OP = 'UPDATE' THEN OLD.taxa ELSE NULL END,
    NEW.taxa, auth.uid(), v_nome_user
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_audit_taxa ON store_operadora_taxas;
CREATE TRIGGER trg_audit_taxa
  AFTER INSERT OR UPDATE ON store_operadora_taxas
  FOR EACH ROW EXECUTE FUNCTION fn_audit_taxa();


-- =============================================================
-- 6. SEED: taxas-padrão para cada filial × operadora × 1x..12x
--    Defaults derivados do TAXA_REAL_FALLBACK do app.
--    Só insere o que faltar (ON CONFLICT DO NOTHING).
-- =============================================================

DO $$
DECLARE
  v_default NUMERIC[] := ARRAY[
    0.00,  -- 1x (à vista no crédito, sem juros — conforme exemplo do prompt)
    3.99,  -- 2x
    5.49,  -- 3x
    6.99,  -- 4x
    8.49,  -- 5x
    9.99,  -- 6x
    10.49, -- 7x
    10.99, -- 8x
    11.49, -- 9x
    11.99, -- 10x
    12.49, -- 11x
    14.00  -- 12x
  ];
  v_store    RECORD;
  v_op       RECORD;
  v_parcela  INTEGER;
BEGIN
  FOR v_store IN SELECT id FROM stores LOOP
    FOR v_op IN SELECT id FROM operadoras LOOP
      FOR v_parcela IN 1..12 LOOP
        INSERT INTO store_operadora_taxas (store_id, operadora_id, parcelas, taxa)
        VALUES (v_store.id, v_op.id, v_parcela, v_default[v_parcela])
        ON CONFLICT (store_id, operadora_id, parcelas) DO NOTHING;
      END LOOP;
    END LOOP;

    -- operadora ativa padrão: primeira operadora (alfabética) se ainda não houver config
    INSERT INTO store_payment_config (store_id, operadora_ativa_id)
    VALUES (
      v_store.id,
      (SELECT id FROM operadoras ORDER BY nome LIMIT 1)
    )
    ON CONFLICT (store_id) DO NOTHING;
  END LOOP;
END $$;


-- =============================================================
-- 7. RLS
-- =============================================================

ALTER TABLE operadoras            ENABLE ROW LEVEL SECURITY;
ALTER TABLE store_operadora_taxas ENABLE ROW LEVEL SECURITY;
ALTER TABLE store_payment_config  ENABLE ROW LEVEL SECURITY;
ALTER TABLE taxa_audit            ENABLE ROW LEVEL SECURITY;

-- ---- operadoras: catálogo global (somente leitura para o app) ----
-- Escrita NÃO é exposta a usuários: como o catálogo é global e usa
-- ON DELETE CASCADE, permitir DELETE a um gestor apagaria as taxas de
-- TODAS as filiais. Novas operadoras são adicionadas via painel Supabase
-- (service role, que ignora RLS) — sem necessidade de alterar código.
DROP POLICY IF EXISTS "operadoras_select" ON operadoras;
DROP POLICY IF EXISTS "operadoras_write"  ON operadoras;

-- SELECT: qualquer autenticado (vendedor precisa para calcular)
CREATE POLICY "operadoras_select" ON operadoras
  FOR SELECT USING (auth.uid() IS NOT NULL);

-- ---- store_operadora_taxas: escopo por filial ----
DROP POLICY IF EXISTS "store_taxas_select" ON store_operadora_taxas;
DROP POLICY IF EXISTS "store_taxas_write"  ON store_operadora_taxas;

-- SELECT: qualquer cargo da mesma filial
CREATE POLICY "store_taxas_select" ON store_operadora_taxas
  FOR SELECT USING (
    store_id = (SELECT mp.store_id FROM get_my_profile() mp LIMIT 1)
  );

-- INSERT/UPDATE/DELETE: apenas gestor da própria filial
CREATE POLICY "store_taxas_write" ON store_operadora_taxas
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM get_my_profile() mp
      WHERE mp.cargo = 'gestor' AND mp.store_id = store_id
    )
  ) WITH CHECK (
    EXISTS (
      SELECT 1 FROM get_my_profile() mp
      WHERE mp.cargo = 'gestor' AND mp.store_id = store_id
    )
  );

-- ---- store_payment_config: escopo por filial ----
DROP POLICY IF EXISTS "store_config_select" ON store_payment_config;
DROP POLICY IF EXISTS "store_config_write"  ON store_payment_config;

CREATE POLICY "store_config_select" ON store_payment_config
  FOR SELECT USING (
    store_id = (SELECT mp.store_id FROM get_my_profile() mp LIMIT 1)
  );

CREATE POLICY "store_config_write" ON store_payment_config
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM get_my_profile() mp
      WHERE mp.cargo = 'gestor' AND mp.store_id = store_id
    )
  ) WITH CHECK (
    EXISTS (
      SELECT 1 FROM get_my_profile() mp
      WHERE mp.cargo = 'gestor' AND mp.store_id = store_id
    )
  );

-- ---- taxa_audit: leitura gestor da filial; insert via trigger (SECURITY DEFINER) ----
DROP POLICY IF EXISTS "taxa_audit_select" ON taxa_audit;

CREATE POLICY "taxa_audit_select" ON taxa_audit
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM get_my_profile() mp
      WHERE mp.cargo = 'gestor' AND mp.store_id = store_id
    )
  );


-- =============================================================
-- FIM
-- Verificar: Table Editor → operadoras (3 linhas),
--   store_operadora_taxas (12 × operadoras × stores),
--   store_payment_config (1 por store), taxa_audit (vazia).
-- =============================================================
