import { createAdminClient, createAuthenticatedServerClient } from './supabase-server'

export interface ManagerContext {
  id: string
  nome: string
  storeId: string
}

export async function requireManager(): Promise<
  { manager: ManagerContext; admin: ReturnType<typeof createAdminClient> } |
  { error: Response }
> {
  try {
    const supabase = await createAuthenticatedServerClient()
    const { data: { user }, error: userError } = await supabase.auth.getUser()

    if (userError || !user) {
      return { error: Response.json({ error: 'Sessão expirada. Entre novamente.' }, { status: 401 }) }
    }

    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('nome, cargo, store_id, ativo')
      .eq('id', user.id)
      .single()

    if (profileError || !profile || profile.cargo !== 'gestor' || profile.ativo === false) {
      return { error: Response.json({ error: 'Acesso permitido somente para gestores ativos.' }, { status: 403 }) }
    }

    return {
      manager: { id: user.id, nome: profile.nome, storeId: profile.store_id },
      admin: createAdminClient(),
    }
  } catch {
    return { error: Response.json({ error: 'Configuração administrativa indisponível.' }, { status: 503 }) }
  }
}
