-- =============================================================
-- GESTÃO SEGURA DE USUÁRIOS — DeliveryFone
-- Aplicar no Supabase SQL Editor antes de liberar a nova tela.
-- =============================================================

-- Perfis precisam ter um cargo conhecido e uma situação explícita.
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS ativo boolean NOT NULL DEFAULT true;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'profiles_cargo_check'
      AND conrelid = 'public.profiles'::regclass
  ) THEN
    ALTER TABLE public.profiles
      ADD CONSTRAINT profiles_cargo_check
      CHECK (cargo IN ('gestor', 'vendedor'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_profiles_store_ativo
  ON public.profiles (store_id, ativo);

-- Alterações de cargo, filial e situação passam exclusivamente pelas
-- rotas administrativas do servidor, que usam service_role após validar
-- a sessão e o perfil do gestor.
DROP POLICY IF EXISTS "profiles_update" ON public.profiles;

-- Registro de auditoria. Senhas nunca entram nesta tabela.
CREATE TABLE IF NOT EXISTS public.user_admin_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  manager_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  target_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  action text NOT NULL CHECK (action IN ('user_created', 'user_updated', 'password_reset')),
  old_values jsonb,
  new_values jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_user_admin_audit_target_created
  ON public.user_admin_audit (target_user_id, created_at DESC);

ALTER TABLE public.user_admin_audit ENABLE ROW LEVEL SECURITY;

-- Sem políticas para anon/authenticated: somente service_role acessa a auditoria.
REVOKE ALL ON TABLE public.user_admin_audit FROM anon, authenticated;

-- Realtime atualiza a lista de usuários na tela do gestor.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'profiles'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.profiles;
  END IF;
END $$;
