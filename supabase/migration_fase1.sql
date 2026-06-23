-- ============================================================
-- DELIVERYFONE — MIGRAÇÃO FASE 1 (versão idempotente)
-- Executar no Supabase: SQL Editor → colar tudo → Run
-- Seguro para rodar mais de uma vez sem erros.
-- ============================================================


-- ============================================================
-- 1. TABELA JUROS — Renomear colunas (com checagem para não falhar se já renomeado)
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
-- 2. TABELA PRODUCTS — Novos campos
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
  ADD COLUMN IF NOT EXISTS motivo_devolucao       TEXT;


-- ============================================================
-- 3. TABELA SALE_PAYMENTS — Pagamentos múltiplos por venda
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
-- 4. TABELA PRODUCT_MESSAGES — Chat por produto
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
-- 5. TABELA DISCOUNT_REQUESTS — Solicitações de desconto
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
-- 6. TABELA TRADE_INS — Simulação de troca (fase 1: simples)
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
-- FIM DA MIGRAÇÃO
-- Verificar no Table Editor: juros (taxa_comercial, taxa_operadora),
-- products (novos campos), e as 4 novas tabelas.
-- ============================================================
