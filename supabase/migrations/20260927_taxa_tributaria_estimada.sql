-- Taxa tributária estimada usada nas simulações de margem.
-- O valor é definido por filial e pode ser alterado pelo gestor.

ALTER TABLE store_payment_config
  ADD COLUMN IF NOT EXISTS taxa_tributaria_estimada NUMERIC(5,2)
  NOT NULL DEFAULT 8
  CHECK (taxa_tributaria_estimada >= 0 AND taxa_tributaria_estimada < 100);

COMMENT ON COLUMN store_payment_config.taxa_tributaria_estimada IS
  'Percentual tributário estimado usado nas simulações financeiras da filial.';
