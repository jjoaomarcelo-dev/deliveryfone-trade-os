-- M-11: Persistir sinal de reserva no banco
-- Rodar no Supabase SQL Editor

ALTER TABLE products
  ADD COLUMN IF NOT EXISTS reserva_sinal NUMERIC(10,2) DEFAULT NULL;

COMMENT ON COLUMN products.reserva_sinal IS
  'Valor do sinal recebido no momento da reserva (R$). Limpo quando reserva é cancelada ou produto vendido.';
