-- =============================================================
-- RLS GRANULAR POR CARGO — DeliveryFone
-- Rodar no Supabase SQL Editor como admin
-- =============================================================

-- -------------------------------------------------------------
-- 0. FUNÇÃO HELPER: evita N+1 por política
--    Retorna (cargo, store_id) do usuário autenticado
-- -------------------------------------------------------------
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


-- =============================================================
-- TABELA: products
-- =============================================================

ALTER TABLE products ENABLE ROW LEVEL SECURITY;

-- Drop políticas antigas (se existirem)
DROP POLICY IF EXISTS "products_select"  ON products;
DROP POLICY IF EXISTS "products_insert"  ON products;
DROP POLICY IF EXISTS "products_update"  ON products;
DROP POLICY IF EXISTS "products_delete"  ON products;

-- SELECT: qualquer cargo da mesma loja
CREATE POLICY "products_select" ON products
  FOR SELECT USING (
    store_id = (SELECT mp.store_id FROM get_my_profile() mp LIMIT 1)
  );

-- INSERT: apenas gestor
CREATE POLICY "products_insert" ON products
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM get_my_profile() mp
      WHERE mp.cargo = 'gestor'
        AND mp.store_id = store_id
    )
  );

-- UPDATE: gestor pode tudo; vendedor pode apenas campos de venda
-- (custo_snapshot, margem_bruta, confirmado_por, data_confirmacao ficam bloqueados para vendedor)
CREATE POLICY "products_update_gestor" ON products
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM get_my_profile() mp
      WHERE mp.cargo = 'gestor'
        AND mp.store_id = store_id
    )
  );

CREATE POLICY "products_update_vendedor" ON products
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM get_my_profile() mp
      WHERE mp.cargo = 'vendedor'
        AND mp.store_id = store_id
        -- vendedor só pode atualizar produtos disponíveis ou reservados
        AND status IN ('disponivel', 'reservado')
    )
  )
  WITH CHECK (
    -- vendedor não pode alterar campos financeiros sensíveis
    custo_snapshot    IS NOT DISTINCT FROM (SELECT custo_snapshot    FROM products p2 WHERE p2.id = id) AND
    margem_bruta      IS NOT DISTINCT FROM (SELECT margem_bruta      FROM products p2 WHERE p2.id = id) AND
    confirmado_por    IS NOT DISTINCT FROM (SELECT confirmado_por    FROM products p2 WHERE p2.id = id) AND
    data_confirmacao  IS NOT DISTINCT FROM (SELECT data_confirmacao  FROM products p2 WHERE p2.id = id) AND
    valor             IS NOT DISTINCT FROM (SELECT valor             FROM products p2 WHERE p2.id = id) AND
    valor_avista      IS NOT DISTINCT FROM (SELECT valor_avista      FROM products p2 WHERE p2.id = id) AND
    promocao          IS NOT DISTINCT FROM (SELECT promocao          FROM products p2 WHERE p2.id = id)
  );

-- DELETE: apenas gestor
CREATE POLICY "products_delete" ON products
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM get_my_profile() mp
      WHERE mp.cargo = 'gestor'
        AND mp.store_id = store_id
    )
  );


-- =============================================================
-- TABELA: profiles
-- =============================================================

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "profiles_select" ON profiles;
DROP POLICY IF EXISTS "profiles_update" ON profiles;

-- SELECT: usuário vê perfis da própria loja
CREATE POLICY "profiles_select" ON profiles
  FOR SELECT USING (
    store_id = (SELECT mp.store_id FROM get_my_profile() mp LIMIT 1)
    OR id = auth.uid()  -- sempre pode ver o próprio perfil
  );

-- UPDATE: cada um só atualiza o próprio perfil
CREATE POLICY "profiles_update" ON profiles
  FOR UPDATE USING (id = auth.uid());


-- =============================================================
-- TABELA: notifications
-- =============================================================

ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "notifications_select" ON notifications;
DROP POLICY IF EXISTS "notifications_insert" ON notifications;
DROP POLICY IF EXISTS "notifications_update" ON notifications;
DROP POLICY IF EXISTS "notifications_delete" ON notifications;

-- SELECT: vê as próprias (destinatario_id = uid) ou broadcasts (IS NULL) da mesma loja
CREATE POLICY "notifications_select" ON notifications
  FOR SELECT USING (
    (destinatario_id = auth.uid() OR destinatario_id IS NULL)
    AND store_id = (SELECT mp.store_id FROM get_my_profile() mp LIMIT 1)
  );

-- INSERT: qualquer cargo da mesma loja pode criar notificações
CREATE POLICY "notifications_insert" ON notifications
  FOR INSERT WITH CHECK (
    store_id = (SELECT mp.store_id FROM get_my_profile() mp LIMIT 1)
  );

-- UPDATE: apenas o destinatário pode marcar como lida
CREATE POLICY "notifications_update" ON notifications
  FOR UPDATE USING (
    destinatario_id = auth.uid()
    OR (destinatario_id IS NULL AND EXISTS (
      SELECT 1 FROM get_my_profile() mp WHERE mp.cargo = 'gestor'
    ))
  );

-- DELETE: gestor pode limpar todas da loja; vendedor só as próprias
CREATE POLICY "notifications_delete" ON notifications
  FOR DELETE USING (
    destinatario_id = auth.uid()
    OR (destinatario_id IS NULL AND EXISTS (
      SELECT 1 FROM get_my_profile() mp
      WHERE mp.cargo = 'gestor'
        AND mp.store_id = store_id
    ))
  );


-- =============================================================
-- TABELA: product_messages
-- =============================================================

ALTER TABLE product_messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "messages_select" ON product_messages;
DROP POLICY IF EXISTS "messages_insert" ON product_messages;

-- SELECT: mensagens de produtos da mesma loja
CREATE POLICY "messages_select" ON product_messages
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM products p
      JOIN get_my_profile() mp ON mp.store_id = p.store_id
      WHERE p.id = produto_id
    )
  );

-- INSERT: qualquer cargo da mesma loja
CREATE POLICY "messages_insert" ON product_messages
  FOR INSERT WITH CHECK (
    autor_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM products p
      JOIN get_my_profile() mp ON mp.store_id = p.store_id
      WHERE p.id = produto_id
    )
  );


-- =============================================================
-- TABELA: discount_requests
-- =============================================================

ALTER TABLE discount_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "discounts_select"  ON discount_requests;
DROP POLICY IF EXISTS "discounts_insert"  ON discount_requests;
DROP POLICY IF EXISTS "discounts_update"  ON discount_requests;

-- SELECT: ambos os cargos veem os pedidos da sua loja
CREATE POLICY "discounts_select" ON discount_requests
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM products p
      JOIN get_my_profile() mp ON mp.store_id = p.store_id
      WHERE p.id = produto_id
    )
  );

-- INSERT: apenas vendedor pode abrir pedido de desconto
CREATE POLICY "discounts_insert" ON discount_requests
  FOR INSERT WITH CHECK (
    vendedor_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM get_my_profile() mp WHERE mp.cargo = 'vendedor'
    )
  );

-- UPDATE: apenas gestor pode responder (aprovar/rejeitar)
CREATE POLICY "discounts_update" ON discount_requests
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM get_my_profile() mp WHERE mp.cargo = 'gestor'
    )
  );


-- =============================================================
-- TABELA: juros
-- =============================================================

ALTER TABLE juros ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "juros_select" ON juros;
DROP POLICY IF EXISTS "juros_insert" ON juros;
DROP POLICY IF EXISTS "juros_update" ON juros;
DROP POLICY IF EXISTS "juros_delete" ON juros;

-- SELECT: qualquer autenticado pode ler (config global da loja)
CREATE POLICY "juros_select" ON juros
  FOR SELECT USING (auth.uid() IS NOT NULL);

-- INSERT/UPDATE/DELETE: apenas gestor
CREATE POLICY "juros_insert" ON juros
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM get_my_profile() mp WHERE mp.cargo = 'gestor')
  );

CREATE POLICY "juros_update" ON juros
  FOR UPDATE USING (
    EXISTS (SELECT 1 FROM get_my_profile() mp WHERE mp.cargo = 'gestor')
  );

CREATE POLICY "juros_delete" ON juros
  FOR DELETE USING (
    EXISTS (SELECT 1 FROM get_my_profile() mp WHERE mp.cargo = 'gestor')
  );


-- =============================================================
-- VERIFICAÇÃO FINAL
-- Liste as políticas criadas:
-- =============================================================
-- SELECT schemaname, tablename, policyname, cmd, qual
-- FROM pg_policies
-- WHERE schemaname = 'public'
-- ORDER BY tablename, cmd;
