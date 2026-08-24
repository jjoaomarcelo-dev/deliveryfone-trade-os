import {
  canManageStore,
  isCargo,
  isSelfPrivilegeChange,
  isUuid,
  validateCreateUser,
  validateUpdateUser,
} from '../app/lib/user-management'

const storeId = '4ea4e717-4b50-480b-8948-271111111111'

describe('gestão de usuários', () => {
  test('aceita um vendedor válido e normaliza o e-mail', () => {
    const result = validateCreateUser({
      nome: 'Maria Silva',
      email: '  MARIA@EXEMPLO.COM ',
      password: 'senha-segura',
      cargo: 'vendedor',
      storeId,
    })

    expect(result.error).toBeUndefined()
    expect(result.data?.email).toBe('maria@exemplo.com')
    expect(result.data?.cargo).toBe('vendedor')
  })

  test('aceita cargo gestor', () => {
    expect(isCargo('gestor')).toBe(true)
  })

  test('rejeita cargo arbitrário', () => {
    expect(validateCreateUser({
      nome: 'Maria Silva',
      email: 'maria@exemplo.com',
      password: 'senha-segura',
      cargo: 'admin',
      storeId,
    }).error).toBe('Cargo inválido.')
  })

  test('rejeita e-mail inválido', () => {
    expect(validateCreateUser({
      nome: 'Maria Silva',
      email: 'email-invalido',
      password: 'senha-segura',
      cargo: 'vendedor',
      storeId,
    }).error).toBe('Informe um e-mail válido.')
  })

  test('rejeita senha inicial curta', () => {
    expect(validateCreateUser({
      nome: 'Maria Silva',
      email: 'maria@exemplo.com',
      password: '1234567',
      cargo: 'vendedor',
      storeId,
    }).error).toContain('8 caracteres')
  })

  test('rejeita filial sem UUID', () => {
    expect(validateCreateUser({
      nome: 'Maria Silva',
      email: 'maria@exemplo.com',
      password: 'senha-segura',
      cargo: 'vendedor',
      storeId: 'outra-loja',
    }).error).toBe('Filial inválida.')
  })

  test('valida UUID', () => {
    expect(isUuid(storeId)).toBe(true)
    expect(isUuid('incorreto')).toBe(false)
  })

  test('gestor só administra a própria filial', () => {
    expect(canManageStore(storeId, storeId)).toBe(true)
    expect(canManageStore(storeId, 'f9c8ac9d-791b-4f3e-9062-111111111111')).toBe(false)
  })

  test('impede o gestor de retirar o próprio cargo', () => {
    expect(isSelfPrivilegeChange('user-1', 'user-1', { cargo: 'vendedor' })).toBe(true)
  })

  test('impede o gestor de desativar a própria conta', () => {
    expect(isSelfPrivilegeChange('user-1', 'user-1', { ativo: false })).toBe(true)
  })

  test('permite ao gestor atualizar o próprio nome', () => {
    expect(isSelfPrivilegeChange('user-1', 'user-1', { nome: 'Novo Nome' })).toBe(false)
  })

  test('aceita atualização de nome, cargo e status', () => {
    const result = validateUpdateUser({ nome: 'Novo Nome', cargo: 'gestor', ativo: true })
    expect(result.data).toEqual({ nome: 'Novo Nome', cargo: 'gestor', ativo: true })
  })

  test('rejeita atualização vazia', () => {
    expect(validateUpdateUser({}).error).toBe('Nenhuma alteração informada.')
  })

  test('rejeita senha temporária curta', () => {
    expect(validateUpdateUser({ password: 'curta' }).error).toContain('8 caracteres')
  })

  test('aceita senha temporária válida', () => {
    expect(validateUpdateUser({ password: 'temporaria123' }).data).toEqual({ password: 'temporaria123' })
  })
})
