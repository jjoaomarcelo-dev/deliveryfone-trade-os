-- B-02: Índices nas queries mais frequentes
-- Rodar no Supabase SQL Editor

-- products: query principal (store_id + status)
CREATE INDEX IF NOT EXISTS idx_products_store_status
  ON products(store_id, status);

-- products: ordenação por data_entrada (cards do estoque)
CREATE INDEX IF NOT EXISTS idx_products_store_entrada
  ON products(store_id, data_entrada DESC);

-- notifications: painel de notificações (store_id + lida + created_at)
CREATE INDEX IF NOT EXISTS idx_notifications_store_lida
  ON notifications(store_id, lida, created_at DESC);

-- product_messages: chat por produto
CREATE INDEX IF NOT EXISTS idx_product_messages_produto
  ON product_messages(produto_id, created_at ASC);

-- discount_requests: pedidos pendentes por loja
CREATE INDEX IF NOT EXISTS idx_discount_requests_store_status
  ON discount_requests(store_id, status);
