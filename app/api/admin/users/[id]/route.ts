import { requireManager } from '@/app/lib/admin-auth'
import {
  canManageStore,
  isSelfPrivilegeChange,
  isUuid,
  validateUpdateUser,
} from '@/app/lib/user-management'

export const dynamic = 'force-dynamic'

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireManager()
  if ('error' in auth) return auth.error

  const { id } = await params
  if (!isUuid(id)) return Response.json({ error: 'Usuário inválido.' }, { status: 400 })

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return Response.json({ error: 'Dados inválidos.' }, { status: 400 })
  }

  const validated = validateUpdateUser(body)
  if (!validated.data) return Response.json({ error: validated.error }, { status: 400 })

  const { manager, admin } = auth
  const update = validated.data

  if (isSelfPrivilegeChange(manager.id, id, update)) {
    return Response.json({ error: 'Você não pode remover o próprio acesso administrativo.' }, { status: 400 })
  }

  const { data: current, error: currentError } = await admin
    .from('profiles')
    .select('id, nome, cargo, store_id, ativo')
    .eq('id', id)
    .single()

  if (currentError || !current || !canManageStore(manager.storeId, current.store_id)) {
    return Response.json({ error: 'Usuário não encontrado nesta filial.' }, { status: 404 })
  }

  const targetStoreId = update.storeId ?? current.store_id
  if (!canManageStore(manager.storeId, targetStoreId)) {
    return Response.json({ error: 'Você não pode transferir usuários para outra filial.' }, { status: 403 })
  }

  const profileChanges: Record<string, string | boolean> = {}
  if (update.nome !== undefined) profileChanges.nome = update.nome
  if (update.cargo !== undefined) profileChanges.cargo = update.cargo
  if (update.storeId !== undefined) profileChanges.store_id = update.storeId
  if (update.ativo !== undefined) profileChanges.ativo = update.ativo

  if (Object.keys(profileChanges).length > 0) {
    const { error: profileError } = await admin.from('profiles').update(profileChanges).eq('id', id)
    if (profileError) return Response.json({ error: 'Não foi possível atualizar o perfil.' }, { status: 500 })
  }

  const authChanges: {
    password?: string
    user_metadata?: { nome: string }
    app_metadata?: { cargo: string; store_id: string }
    ban_duration?: string
  } = {}
  if (update.password !== undefined) authChanges.password = update.password
  if (update.nome !== undefined) authChanges.user_metadata = { nome: update.nome }
  if (update.cargo !== undefined || update.storeId !== undefined) {
    authChanges.app_metadata = {
      cargo: update.cargo ?? current.cargo,
      store_id: targetStoreId,
    }
  }
  if (update.ativo !== undefined) authChanges.ban_duration = update.ativo ? 'none' : '876000h'

  if (Object.keys(authChanges).length > 0) {
    const { error: authError } = await admin.auth.admin.updateUserById(id, authChanges)
    if (authError) {
      if (Object.keys(profileChanges).length > 0) {
        await admin.from('profiles').update({
          nome: current.nome,
          cargo: current.cargo,
          store_id: current.store_id,
          ativo: current.ativo,
        }).eq('id', id)
      }
      return Response.json({ error: 'A alteração não foi concluída.' }, { status: 500 })
    }
  }

  await admin.from('user_admin_audit').insert({
    manager_id: manager.id,
    target_user_id: id,
    action: update.password !== undefined ? 'password_reset' : 'user_updated',
    old_values: update.password !== undefined ? null : current,
    new_values: update.password !== undefined ? null : { ...current, ...profileChanges },
  })

  return Response.json({ message: update.password ? 'Senha temporária atualizada.' : 'Usuário atualizado.' })
}
