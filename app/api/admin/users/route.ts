import { requireManager } from '@/app/lib/admin-auth'
import { canManageStore, validateCreateUser } from '@/app/lib/user-management'

export const dynamic = 'force-dynamic'

function friendlyAuthError(message: string) {
  const normalized = message.toLowerCase()
  if (normalized.includes('already') || normalized.includes('registered') || normalized.includes('exists')) {
    return 'Já existe uma conta com este e-mail.'
  }
  return 'Não foi possível criar a conta de acesso.'
}

export async function GET() {
  const auth = await requireManager()
  if ('error' in auth) return auth.error

  const { manager, admin } = auth
  const [{ data: store, error: storeError }, { data: profiles, error: profilesError }, authUsers] = await Promise.all([
    admin.from('stores').select('id, nome').eq('id', manager.storeId).single(),
    admin
      .from('profiles')
      .select('id, nome, cargo, store_id, ativo, created_at')
      .eq('store_id', manager.storeId)
      .order('nome'),
    admin.auth.admin.listUsers({ page: 1, perPage: 1000 }),
  ])

  if (storeError || profilesError || authUsers.error) {
    return Response.json({ error: 'Não foi possível carregar os usuários.' }, { status: 500 })
  }

  const emailById = new Map(authUsers.data.users.map((user) => [user.id, user.email ?? '']))
  const users = (profiles ?? []).map((profile) => ({
    id: profile.id,
    nome: profile.nome,
    email: emailById.get(profile.id) ?? '',
    cargo: profile.cargo,
    storeId: profile.store_id,
    storeNome: store.nome,
    ativo: profile.ativo !== false,
    createdAt: profile.created_at,
    isCurrentUser: profile.id === manager.id,
  }))

  return Response.json({
    users,
    stores: [{ id: store.id, nome: store.nome }],
    currentUserId: manager.id,
  })
}

export async function POST(request: Request) {
  const auth = await requireManager()
  if ('error' in auth) return auth.error

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return Response.json({ error: 'Dados inválidos.' }, { status: 400 })
  }

  const validated = validateCreateUser(body)
  if (!validated.data) return Response.json({ error: validated.error }, { status: 400 })

  const { manager, admin } = auth
  const input = validated.data

  if (!canManageStore(manager.storeId, input.storeId)) {
    return Response.json({ error: 'Você não pode cadastrar usuários em outra filial.' }, { status: 403 })
  }

  const { data: store, error: storeError } = await admin
    .from('stores')
    .select('id')
    .eq('id', input.storeId)
    .single()

  if (storeError || !store) {
    return Response.json({ error: 'Filial não encontrada.' }, { status: 400 })
  }

  const { data: created, error: createError } = await admin.auth.admin.createUser({
    email: input.email,
    password: input.password,
    email_confirm: true,
    user_metadata: { nome: input.nome },
    app_metadata: { cargo: input.cargo, store_id: input.storeId },
  })

  if (createError || !created.user) {
    return Response.json({ error: friendlyAuthError(createError?.message ?? '') }, { status: 400 })
  }

  const { error: profileError } = await admin.from('profiles').insert({
    id: created.user.id,
    nome: input.nome,
    cargo: input.cargo,
    store_id: input.storeId,
    ativo: true,
  })

  if (profileError) {
    await admin.auth.admin.deleteUser(created.user.id)
    return Response.json({ error: 'A conta não foi concluída. Nenhum usuário foi mantido.' }, { status: 500 })
  }

  await admin.from('user_admin_audit').insert({
    manager_id: manager.id,
    target_user_id: created.user.id,
    action: 'user_created',
    new_values: { nome: input.nome, cargo: input.cargo, store_id: input.storeId, ativo: true },
  })

  return Response.json({ message: 'Usuário criado com sucesso.', id: created.user.id }, { status: 201 })
}
