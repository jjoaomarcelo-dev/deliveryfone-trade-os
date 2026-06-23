-- =============================================================
-- TAXAS DE PARCELAMENTO: estender limite para 21x
-- e tratar taxa 0 como "não oferecida" (não polui auditoria).
-- Idempotente. Supabase: SQL Editor → colar tudo → Run.
-- =============================================================

-- 1. Atualiza o CHECK de parcelas: 1..12 → 1..21
ALTER TABLE store_operadora_taxas
  DROP CONSTRAINT IF EXISTS parcelas_valida;

ALTER TABLE store_operadora_taxas
  ADD CONSTRAINT parcelas_valida CHECK (parcelas >= 1 AND parcelas <= 21);

-- 2. Trigger de auditoria: não registrar a CRIAÇÃO de linhas com taxa 0
--    (parcela "não oferecida" por padrão). Continua auditando:
--    - INSERT de taxa > 0 (parcela habilitada)
--    - UPDATE que muda o valor (inclusive habilitar/desabilitar)
CREATE OR REPLACE FUNCTION fn_audit_taxa()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_nome_user TEXT;
  v_nome_op   TEXT;
BEGIN
  -- Pula operações do sistema/seed (sem usuário autenticado)
  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;

  -- Pula criação de parcela "não oferecida" (taxa 0) — sem valor histórico
  IF TG_OP = 'INSERT' AND NEW.taxa = 0 THEN
    RETURN NEW;
  END IF;

  -- Só audita quando o valor realmente muda
  IF TG_OP = 'UPDATE' AND NEW.taxa IS NOT DISTINCT FROM OLD.taxa THEN
    RETURN NEW;
  END IF;

  SELECT nome INTO v_nome_user FROM profiles  WHERE id = auth.uid();
  SELECT nome INTO v_nome_op   FROM operadoras WHERE id = NEW.operadora_id;

  INSERT INTO taxa_audit (
    store_id, operadora_id, operadora_nome, parcelas,
    valor_anterior, valor_novo, usuario_id, usuario_nome
  ) VALUES (
    NEW.store_id, NEW.operadora_id, v_nome_op, NEW.parcelas,
    CASE WHEN TG_OP = 'UPDATE' THEN OLD.taxa ELSE NULL END,
    NEW.taxa, auth.uid(), v_nome_user
  );

  RETURN NEW;
END;
$$;

-- =============================================================
-- Verificar: agora é possível inserir parcelas 13..21.
-- Taxa 0 = "não oferecida" (excluída da tabela de parcelamento pelo app).
-- =============================================================
