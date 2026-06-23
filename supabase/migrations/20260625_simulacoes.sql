-- =============================================================
-- SIMULAÇÕES DE VENDA POR VENDEDOR — DeliveryFone
-- O vendedor confirma uma simulação (com nome do cliente) e ela fica
-- "guardada" no card do produto, visível só para ele, até fechar ou cancelar.
-- Idempotente. Supabase: SQL Editor → colar tudo → Run.
-- =============================================================

CREATE TABLE IF NOT EXISTS simulacoes (
  id               UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  store_id         UUID NOT NULL REFERENCES stores(id)   ON DELETE CASCADE,
  produto_id       UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  vendedor_id      UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  vendedor_nome    TEXT,
  cliente_nome     TEXT NOT NULL,
  base             TEXT,             -- 'normal' | 'avista' | 'promocao'
  preco_base       NUMERIC,
  entrada          NUMERIC DEFAULT 0,
  troca_valor      NUMERIC DEFAULT 0,
  troca_descricao  TEXT,
  forma_pagamento  TEXT,             -- 'a_vista' | 'parcelado'
  parcelas         INTEGER DEFAULT 0,
  valor_a_pagar    NUMERIC,
  created_at       TIMESTAMPTZ DEFAULT now(),
  updated_at       TIMESTAMPTZ DEFAULT now(),
  -- uma simulação aberta por (produto, vendedor)
  CONSTRAINT simulacoes_unica UNIQUE (produto_id, vendedor_id)
);

CREATE INDEX IF NOT EXISTS idx_simulacoes_vendedor
  ON simulacoes (store_id, vendedor_id);


-- =============================================================
-- RLS — cada vendedor enxerga/edita apenas as próprias simulações
-- =============================================================

ALTER TABLE simulacoes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "simulacoes_select" ON simulacoes;
DROP POLICY IF EXISTS "simulacoes_insert" ON simulacoes;
DROP POLICY IF EXISTS "simulacoes_update" ON simulacoes;
DROP POLICY IF EXISTS "simulacoes_delete" ON simulacoes;

-- SELECT: somente as próprias (qualquer cargo vê só as suas)
CREATE POLICY "simulacoes_select" ON simulacoes
  FOR SELECT USING (vendedor_id = auth.uid());

-- INSERT: cria como si mesmo, na própria filial
CREATE POLICY "simulacoes_insert" ON simulacoes
  FOR INSERT WITH CHECK (
    vendedor_id = auth.uid()
    AND store_id = (SELECT mp.store_id FROM get_my_profile() mp LIMIT 1)
  );

-- UPDATE: somente as próprias
CREATE POLICY "simulacoes_update" ON simulacoes
  FOR UPDATE USING (vendedor_id = auth.uid())
  WITH CHECK (vendedor_id = auth.uid());

-- DELETE (cancelar): somente as próprias
CREATE POLICY "simulacoes_delete" ON simulacoes
  FOR DELETE USING (vendedor_id = auth.uid());


-- =============================================================
-- FIM — Verificar: Table Editor → simulacoes (vazia), 4 policies.
-- =============================================================
