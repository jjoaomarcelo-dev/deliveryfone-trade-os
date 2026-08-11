-- Fluxos de venda auxiliar, chat e autorização (idempotente).
-- Aplicar manualmente no SQL Editor do Supabase. Não realiza baixa de estoque de ERP.

ALTER TABLE products
  ADD COLUMN IF NOT EXISTS forma_pagamento       TEXT,
  ADD COLUMN IF NOT EXISTS valor_venda           NUMERIC,
  ADD COLUMN IF NOT EXISTS valor_liquido         NUMERIC,
  ADD COLUMN IF NOT EXISTS valor_entrada         NUMERIC,
  ADD COLUMN IF NOT EXISTS parcelas_venda        INTEGER,
  ADD COLUMN IF NOT EXISTS taxa_aplicada          NUMERIC,
  ADD COLUMN IF NOT EXISTS data_venda             DATE,
  ADD COLUMN IF NOT EXISTS vendido_por            TEXT,
  ADD COLUMN IF NOT EXISTS vendido_por_nome       TEXT,
  ADD COLUMN IF NOT EXISTS vendido_por_id         UUID REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS custo_snapshot         NUMERIC,
  ADD COLUMN IF NOT EXISTS margem_bruta           NUMERIC,
  ADD COLUMN IF NOT EXISTS desconto_aplicado      NUMERIC,
  ADD COLUMN IF NOT EXISTS valor_normal_snapshot NUMERIC,
  ADD COLUMN IF NOT EXISTS taxa_comercial_snap    NUMERIC,
  ADD COLUMN IF NOT EXISTS taxa_operadora_snap    NUMERIC,
  ADD COLUMN IF NOT EXISTS confirmado_por         TEXT,
  ADD COLUMN IF NOT EXISTS data_confirmacao       DATE,
  ADD COLUMN IF NOT EXISTS motivo_devolucao       TEXT;

ALTER TABLE notifications
  ADD COLUMN IF NOT EXISTS autor_id UUID REFERENCES auth.users(id) ON DELETE SET NULL;

CREATE OR REPLACE FUNCTION get_my_profile()
RETURNS TABLE(cargo text, store_id uuid)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p.cargo::text, p.store_id
  FROM profiles p
  WHERE p.id = auth.uid()
  LIMIT 1;
$$;

ALTER TABLE products ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "produtos_insert_store" ON products;
DROP POLICY IF EXISTS "products_insert" ON products;
CREATE POLICY "products_insert" ON products
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM get_my_profile() mp
      WHERE mp.cargo = 'gestor' AND mp.store_id = products.store_id
    )
  );

-- Remove a política antiga que permitia a qualquer perfil alterar qualquer coluna.
DROP POLICY IF EXISTS "produtos_update_store" ON products;
DROP POLICY IF EXISTS "products_update_gestor" ON products;
DROP POLICY IF EXISTS "products_update_vendedor" ON products;

CREATE POLICY "products_update_gestor" ON products
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM get_my_profile() mp
      WHERE mp.cargo = 'gestor' AND mp.store_id = products.store_id
    )
  );

CREATE POLICY "products_update_vendedor" ON products
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM get_my_profile() mp
      WHERE mp.cargo = 'vendedor'
        AND mp.store_id = products.store_id
        AND products.status IN ('disponivel', 'reservado')
    )
  )
  WITH CHECK (
    store_id = (SELECT mp.store_id FROM get_my_profile() mp LIMIT 1)
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

DROP POLICY IF EXISTS "product_messages_store" ON product_messages;
DROP POLICY IF EXISTS "messages_select" ON product_messages;
DROP POLICY IF EXISTS "messages_insert" ON product_messages;

CREATE POLICY "messages_select" ON product_messages
  FOR SELECT USING (
    store_id = (SELECT mp.store_id FROM get_my_profile() mp LIMIT 1)
    AND EXISTS (SELECT 1 FROM products p WHERE p.id = produto_id AND p.store_id = product_messages.store_id)
  );

CREATE POLICY "messages_insert" ON product_messages
  FOR INSERT WITH CHECK (
    autor_id = auth.uid()
    AND store_id = (SELECT mp.store_id FROM get_my_profile() mp LIMIT 1)
    AND EXISTS (SELECT 1 FROM products p WHERE p.id = produto_id AND p.store_id = product_messages.store_id)
  );

DROP POLICY IF EXISTS "discount_requests_store" ON discount_requests;
DROP POLICY IF EXISTS "discounts_select" ON discount_requests;
DROP POLICY IF EXISTS "discounts_insert" ON discount_requests;
DROP POLICY IF EXISTS "discounts_update" ON discount_requests;

CREATE POLICY "discounts_select" ON discount_requests
  FOR SELECT USING (
    store_id = (SELECT mp.store_id FROM get_my_profile() mp LIMIT 1)
    AND EXISTS (SELECT 1 FROM products p WHERE p.id = produto_id AND p.store_id = discount_requests.store_id)
  );

CREATE POLICY "discounts_insert" ON discount_requests
  FOR INSERT WITH CHECK (
    vendedor_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM get_my_profile() mp
      WHERE mp.cargo = 'vendedor' AND mp.store_id = discount_requests.store_id
    )
    AND EXISTS (SELECT 1 FROM products p WHERE p.id = produto_id AND p.store_id = discount_requests.store_id)
  );

CREATE POLICY "discounts_update" ON discount_requests
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM get_my_profile() mp
      WHERE mp.cargo = 'gestor' AND mp.store_id = discount_requests.store_id
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM get_my_profile() mp
      WHERE mp.cargo = 'gestor' AND mp.store_id = discount_requests.store_id
    )
  );

NOTIFY pgrst, 'reload schema';
