-- ============================================================
-- DELIVERYFONE — SETUP COMPLETO (idempotente)
-- Roda tudo de uma vez: migração + tabelas + RLS + realtime
-- Seguro para rodar mais de uma vez sem erros.
-- Supabase: SQL Editor → colar tudo → Run
-- ============================================================


-- ============================================================
-- 1. JUROS — Renomear colunas
-- ============================================================

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_name = 'juros' AND column_name = 'percentual') THEN
    ALTER TABLE juros RENAME COLUMN percentual TO taxa_comercial;
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_name = 'juros' AND column_name = 'taxa_real') THEN
    ALTER TABLE juros RENAME COLUMN taxa_real TO taxa_operadora;
  END IF;
END $$;


-- ============================================================
-- 2. PRODUCTS — Novos campos
-- ============================================================

ALTER TABLE products
  ADD COLUMN IF NOT EXISTS reserva_cliente        TEXT,
  ADD COLUMN IF NOT EXISTS cliente_nome           TEXT,
  ADD COLUMN IF NOT EXISTS custo_snapshot         NUMERIC,
  ADD COLUMN IF NOT EXISTS margem_bruta           NUMERIC,
  ADD COLUMN IF NOT EXISTS desconto_aplicado      NUMERIC,
  ADD COLUMN IF NOT EXISTS valor_normal_snapshot  NUMERIC,
  ADD COLUMN IF NOT EXISTS taxa_comercial_snap    NUMERIC,
  ADD COLUMN IF NOT EXISTS taxa_operadora_snap    NUMERIC,
  ADD COLUMN IF NOT EXISTS confirmado_por         TEXT,
  ADD COLUMN IF NOT EXISTS data_confirmacao       DATE,
  ADD COLUMN IF NOT EXISTS motivo_devolucao       TEXT,
  ADD COLUMN IF NOT EXISTS observacoes            TEXT,
  ADD COLUMN IF NOT EXISTS forma_pagamento        TEXT,
  ADD COLUMN IF NOT EXISTS valor_venda            NUMERIC,
  ADD COLUMN IF NOT EXISTS valor_liquido          NUMERIC,
  ADD COLUMN IF NOT EXISTS valor_entrada          NUMERIC,
  ADD COLUMN IF NOT EXISTS parcelas_venda         INTEGER,
  ADD COLUMN IF NOT EXISTS taxa_aplicada          NUMERIC,
  ADD COLUMN IF NOT EXISTS data_venda             DATE,
  ADD COLUMN IF NOT EXISTS vendido_por            TEXT,
  ADD COLUMN IF NOT EXISTS vendido_por_nome       TEXT,
  ADD COLUMN IF NOT EXISTS vendido_por_id         UUID REFERENCES auth.users(id);


-- ============================================================
-- 3. PRODUCTS — RLS: permitir que vendedor atualize produtos
-- ============================================================

ALTER TABLE products ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "produtos_update_store" ON products;
DROP POLICY IF EXISTS "products_update_gestor" ON products;
DROP POLICY IF EXISTS "products_update_vendedor" ON products;
CREATE POLICY "products_update_gestor" ON products
  FOR UPDATE USING (
    store_id = (SELECT store_id FROM profiles WHERE id = auth.uid())
    AND (SELECT cargo FROM profiles WHERE id = auth.uid()) = 'gestor'
  );

CREATE POLICY "products_update_vendedor" ON products
  FOR UPDATE USING (
    store_id = (SELECT store_id FROM profiles WHERE id = auth.uid())
    AND (SELECT cargo FROM profiles WHERE id = auth.uid()) = 'vendedor'
    AND status IN ('disponivel', 'reservado')
  )
  WITH CHECK (
    store_id = (SELECT store_id FROM profiles WHERE id = auth.uid())
    AND status IN ('disponivel', 'reservado', 'vendido')
  );

CREATE OR REPLACE FUNCTION protect_product_manager_fields()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND cargo = 'vendedor')
     AND (
       NEW.store_id IS DISTINCT FROM OLD.store_id OR
       NEW.modelo IS DISTINCT FROM OLD.modelo OR
       NEW.valor IS DISTINCT FROM OLD.valor OR
       NEW.valor_avista IS DISTINCT FROM OLD.valor_avista OR
       NEW.promocao IS DISTINCT FROM OLD.promocao OR
       NEW.atributos IS DISTINCT FROM OLD.atributos OR
       NEW.custo_snapshot IS DISTINCT FROM OLD.custo_snapshot OR
       NEW.margem_bruta IS DISTINCT FROM OLD.margem_bruta OR
       NEW.confirmado_por IS DISTINCT FROM OLD.confirmado_por OR
       NEW.data_confirmacao IS DISTINCT FROM OLD.data_confirmacao
     ) THEN
    RAISE EXCEPTION 'vendedor não pode alterar campos gerenciais do produto';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_protect_product_manager_fields ON products;
CREATE TRIGGER trg_protect_product_manager_fields
  BEFORE UPDATE ON products
  FOR EACH ROW EXECUTE FUNCTION protect_product_manager_fields();

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'products' AND policyname = 'produtos_select_store'
  ) THEN
    CREATE POLICY "produtos_select_store" ON products
      FOR SELECT
      USING (
        store_id = (SELECT store_id FROM profiles WHERE id = auth.uid())
      );
  END IF;
END $$;

DROP POLICY IF EXISTS "produtos_insert_store" ON products;
DROP POLICY IF EXISTS "products_insert" ON products;
CREATE POLICY "products_insert" ON products
  FOR INSERT WITH CHECK (
    store_id = (SELECT store_id FROM profiles WHERE id = auth.uid())
    AND (SELECT cargo FROM profiles WHERE id = auth.uid()) = 'gestor'
  );

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'products' AND policyname = 'produtos_delete_gestor'
  ) THEN
    CREATE POLICY "produtos_delete_gestor" ON products
      FOR DELETE
      USING (
        store_id = (SELECT store_id FROM profiles WHERE id = auth.uid())
        AND (SELECT cargo FROM profiles WHERE id = auth.uid()) = 'gestor'
      );
  END IF;
END $$;


-- ============================================================
-- 4. PRODUCTS — Realtime com REPLICA IDENTITY FULL
-- ============================================================

ALTER TABLE products REPLICA IDENTITY FULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'products'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE products;
  END IF;
END $$;


-- ============================================================
-- 5. TABELA: sale_payments
-- ============================================================

CREATE TABLE IF NOT EXISTS sale_payments (
  id              UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  produto_id      UUID REFERENCES products(id) ON DELETE CASCADE,
  store_id        UUID REFERENCES stores(id)   ON DELETE CASCADE,
  forma           TEXT NOT NULL,
  valor           NUMERIC NOT NULL,
  parcelas        INTEGER,
  taxa_comercial  NUMERIC,
  taxa_operadora  NUMERIC,
  valor_liquido   NUMERIC,
  created_at      TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE sale_payments ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies
    WHERE tablename = 'sale_payments' AND policyname = 'sale_payments_store') THEN
    CREATE POLICY "sale_payments_store" ON sale_payments
      FOR ALL USING (
        store_id = (SELECT store_id FROM profiles WHERE id = auth.uid())
      );
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'sale_payments'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE sale_payments;
  END IF;
END $$;


-- ============================================================
-- 6. TABELA: product_messages (chat por produto)
-- ============================================================

CREATE TABLE IF NOT EXISTS product_messages (
  id           UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  produto_id   UUID REFERENCES products(id) ON DELETE CASCADE,
  store_id     UUID REFERENCES stores(id)   ON DELETE CASCADE,
  autor_id     UUID REFERENCES profiles(id) ON DELETE SET NULL,
  autor_nome   TEXT NOT NULL,
  autor_cargo  TEXT NOT NULL DEFAULT 'sistema',
  mensagem     TEXT NOT NULL,
  tipo         TEXT NOT NULL DEFAULT 'mensagem',
  metadata     JSONB,
  created_at   TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE product_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE product_messages REPLICA IDENTITY FULL;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies
    WHERE tablename = 'product_messages' AND policyname = 'product_messages_store') THEN
    CREATE POLICY "product_messages_store" ON product_messages
      FOR ALL USING (
        store_id = (SELECT store_id FROM profiles WHERE id = auth.uid())
      );
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'product_messages'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE product_messages;
  END IF;
END $$;


-- ============================================================
-- 7. TABELA: discount_requests (aprovação de desconto)
-- ============================================================

CREATE TABLE IF NOT EXISTS discount_requests (
  id                UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  produto_id        UUID REFERENCES products(id) ON DELETE CASCADE,
  store_id          UUID REFERENCES stores(id)   ON DELETE CASCADE,
  vendedor_id       UUID REFERENCES profiles(id) ON DELETE SET NULL,
  vendedor_nome     TEXT NOT NULL,
  valor_solicitado  NUMERIC NOT NULL,
  valor_original    NUMERIC NOT NULL,
  motivo            TEXT,
  status            TEXT NOT NULL DEFAULT 'pendente',
  valor_aprovado    NUMERIC,
  resposta_gestor   TEXT,
  gestor_id         UUID REFERENCES profiles(id) ON DELETE SET NULL,
  gestor_nome       TEXT,
  created_at        TIMESTAMPTZ DEFAULT now(),
  resolved_at       TIMESTAMPTZ
);

ALTER TABLE discount_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE discount_requests REPLICA IDENTITY FULL;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies
    WHERE tablename = 'discount_requests' AND policyname = 'discount_requests_store') THEN
    CREATE POLICY "discount_requests_store" ON discount_requests
      FOR ALL USING (
        store_id = (SELECT store_id FROM profiles WHERE id = auth.uid())
      );
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'discount_requests'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE discount_requests;
  END IF;
END $$;


-- ============================================================
-- 8. TABELA: trade_ins (simulação de troca — fase 1)
-- ============================================================

CREATE TABLE IF NOT EXISTS trade_ins (
  id              UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  produto_id      UUID REFERENCES products(id) ON DELETE SET NULL,
  store_id        UUID REFERENCES stores(id)   ON DELETE CASCADE,
  vendedor_nome   TEXT NOT NULL,
  marca           TEXT NOT NULL,
  modelo          TEXT NOT NULL,
  armazenamento   TEXT,
  observacoes     TEXT,
  created_at      TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE trade_ins ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies
    WHERE tablename = 'trade_ins' AND policyname = 'trade_ins_store') THEN
    CREATE POLICY "trade_ins_store" ON trade_ins
      FOR ALL USING (
        store_id = (SELECT store_id FROM profiles WHERE id = auth.uid())
      );
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'trade_ins'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE trade_ins;
  END IF;
END $$;


-- ============================================================
-- 9. NOTIFICATIONS — garantir RLS, realtime e tipos permitidos
-- ============================================================

-- Remover constraint antiga de tipo e recriar com todos os valores
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_name = 'notifications' AND constraint_name = 'notifications_tipo_check'
  ) THEN
    ALTER TABLE notifications DROP CONSTRAINT notifications_tipo_check;
  END IF;
END $$;

ALTER TABLE notifications
  ADD CONSTRAINT notifications_tipo_check CHECK (tipo IN (
    'reserva',
    'venda_pendente',
    'venda_confirmada',
    'venda_devolvida',
    'desconto_solicitado',
    'desconto_respondido',
    'mensagem_chat'
  ));

ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications REPLICA IDENTITY FULL;
ALTER TABLE notifications
  ADD COLUMN IF NOT EXISTS autor_id UUID REFERENCES auth.users(id) ON DELETE SET NULL;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies
    WHERE tablename = 'notifications' AND policyname = 'notifications_store') THEN
    CREATE POLICY "notifications_store" ON notifications
      FOR ALL USING (
        store_id = (SELECT store_id FROM profiles WHERE id = auth.uid())
      );
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'notifications'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE notifications;
  END IF;
END $$;


-- ============================================================
-- FIM
-- Verificar: Table Editor → juros (taxa_comercial, taxa_operadora)
--            products (novos campos) · 4 novas tabelas
--            Authentication → Policies → products (4 policies)
-- ============================================================
