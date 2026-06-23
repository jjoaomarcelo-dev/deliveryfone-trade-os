-- =============================================================
-- CATÁLOGO: VÍDEO DO PRODUTO — DeliveryFone
-- Vídeo único por aparelho, adicionado no cadastro pelo gestor.
-- Regras:
--   - aparece no catálogo enquanto status = 'disponivel'
--   - troca de status (manutenção, devolução, etc.) NÃO remove o vídeo
--   - vídeo é removido apenas quando a venda é CONFIRMADA (status 'confirmado')
-- Idempotente. Supabase: SQL Editor → colar tudo → Run.
-- =============================================================

ALTER TABLE products
  ADD COLUMN IF NOT EXISTS video_url TEXT;

-- Remove o vídeo automaticamente quando a venda é confirmada.
CREATE OR REPLACE FUNCTION fn_limpar_video_confirmado()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.status = 'confirmado' AND NEW.status IS DISTINCT FROM OLD.status THEN
    NEW.video_url := NULL;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_limpar_video_confirmado ON products;
CREATE TRIGGER trg_limpar_video_confirmado
  BEFORE UPDATE ON products
  FOR EACH ROW EXECUTE FUNCTION fn_limpar_video_confirmado();

-- =============================================================
-- FIM — Verificar: products.video_url existe; ao confirmar venda,
--   video_url vira NULL automaticamente (imagens/descrição/observação
--   continuam, pois são geradas pelo app a partir do modelo).
-- =============================================================
