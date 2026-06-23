-- =============================================================
-- OPERADORAS: manter apenas Banrisul e Itaú (remover Stone e Cielo)
-- Idempotente. Supabase: SQL Editor → colar tudo → Run.
-- =============================================================

-- 1. Garante Itaú no catálogo
INSERT INTO operadoras (nome)
VALUES ('Itaú')
ON CONFLICT (nome) DO NOTHING;

-- 2. Seed das taxas de Itaú (1x..12x) para cada filial que ainda não tiver
DO $$
DECLARE
  v_default NUMERIC[] := ARRAY[
    0.00,  -- 1x
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
  v_itau   UUID;
  v_store  RECORD;
  v_p      INTEGER;
BEGIN
  SELECT id INTO v_itau FROM operadoras WHERE nome = 'Itaú';

  FOR v_store IN SELECT id FROM stores LOOP
    FOR v_p IN 1..12 LOOP
      INSERT INTO store_operadora_taxas (store_id, operadora_id, parcelas, taxa)
      VALUES (v_store.id, v_itau, v_p, v_default[v_p])
      ON CONFLICT (store_id, operadora_id, parcelas) DO NOTHING;
    END LOOP;
  END LOOP;
END $$;

-- 3. Repointar filiais cuja operadora ATIVA era Stone/Cielo → Banrisul
--    (evita ficar sem operadora ativa após a remoção)
UPDATE store_payment_config
SET operadora_ativa_id = (SELECT id FROM operadoras WHERE nome = 'Banrisul'),
    updated_at = now()
WHERE operadora_ativa_id IN (
  SELECT id FROM operadoras WHERE nome IN ('Stone', 'Cielo')
);

-- 4. Remover Stone e Cielo
--    ON DELETE CASCADE remove suas taxas; o histórico (taxa_audit) é
--    preservado pois guarda operadora_nome em texto (FK vira NULL via SET NULL).
DELETE FROM operadoras WHERE nome IN ('Stone', 'Cielo');

-- =============================================================
-- Verificar: SELECT nome FROM operadoras ORDER BY nome;
--   → deve retornar apenas: Banrisul, Itaú
-- =============================================================
