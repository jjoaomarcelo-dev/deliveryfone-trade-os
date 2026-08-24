export const CARGOS = ['gestor', 'vendedor'] as const

export type Cargo = (typeof CARGOS)[number]

export interface CreateUserInput {
  nome: string
  email: string
  password: string
  cargo: Cargo
  storeId: string
}

export interface UpdateUserInput {
  nome?: string
  cargo?: Cargo
  storeId?: string
  ativo?: boolean
  password?: string
}

export interface ValidationResult<T> {
  data?: T
  error?: string
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export function isCargo(value: unknown): value is Cargo {
  return typeof value === 'string' && CARGOS.includes(value as Cargo)
}

export function isUuid(value: unknown): value is string {
  return typeof value === 'string' && UUID_PATTERN.test(value)
}

export function validateCreateUser(value: unknown): ValidationResult<CreateUserInput> {
  if (!value || typeof value !== 'object') return { error: 'Dados inválidos.' }

  const input = value as Record<string, unknown>
  const nome = typeof input.nome === 'string' ? input.nome.trim() : ''
  const email = typeof input.email === 'string' ? input.email.trim().toLowerCase() : ''
  const password = typeof input.password === 'string' ? input.password : ''
  const cargo = input.cargo
  const storeId = input.storeId

  if (nome.length < 2) return { error: 'Informe o nome completo.' }
  if (!EMAIL_PATTERN.test(email)) return { error: 'Informe um e-mail válido.' }
  if (password.length < 8) return { error: 'A senha inicial deve ter pelo menos 8 caracteres.' }
  if (!isCargo(cargo)) return { error: 'Cargo inválido.' }
  if (!isUuid(storeId)) return { error: 'Filial inválida.' }

  return { data: { nome, email, password, cargo, storeId } }
}

export function validateUpdateUser(value: unknown): ValidationResult<UpdateUserInput> {
  if (!value || typeof value !== 'object') return { error: 'Dados inválidos.' }

  const input = value as Record<string, unknown>
  const data: UpdateUserInput = {}

  if ('nome' in input) {
    const nome = typeof input.nome === 'string' ? input.nome.trim() : ''
    if (nome.length < 2) return { error: 'Informe o nome completo.' }
    data.nome = nome
  }

  if ('cargo' in input) {
    if (!isCargo(input.cargo)) return { error: 'Cargo inválido.' }
    data.cargo = input.cargo
  }

  if ('storeId' in input) {
    if (!isUuid(input.storeId)) return { error: 'Filial inválida.' }
    data.storeId = input.storeId
  }

  if ('ativo' in input) {
    if (typeof input.ativo !== 'boolean') return { error: 'Situação inválida.' }
    data.ativo = input.ativo
  }

  if ('password' in input) {
    if (typeof input.password !== 'string' || input.password.length < 8) {
      return { error: 'A senha temporária deve ter pelo menos 8 caracteres.' }
    }
    data.password = input.password
  }

  if (Object.keys(data).length === 0) return { error: 'Nenhuma alteração informada.' }
  return { data }
}

export function canManageStore(managerStoreId: string, targetStoreId: string) {
  return managerStoreId === targetStoreId
}

export function isSelfPrivilegeChange(
  managerId: string,
  targetId: string,
  update: UpdateUserInput,
) {
  return managerId === targetId && (
    update.cargo !== undefined ||
    update.storeId !== undefined ||
    update.ativo === false
  )
}
