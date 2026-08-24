'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '../../../lib/supabase'
import { SpinnerPage } from '../../../components/Spinner'

type Cargo = 'gestor' | 'vendedor'

interface ManagedUser {
  id: string
  nome: string
  email: string
  cargo: Cargo
  storeId: string
  storeNome: string
  ativo: boolean
  createdAt: string
  isCurrentUser: boolean
}

interface Store {
  id: string
  nome: string
}

interface UserForm {
  nome: string
  email: string
  password: string
  confirmPassword: string
  cargo: Cargo
  storeId: string
}

const emptyForm: UserForm = {
  nome: '',
  email: '',
  password: '',
  confirmPassword: '',
  cargo: 'vendedor',
  storeId: '',
}

async function getErrorMessage(response: Response) {
  const data = await response.json().catch(() => null)
  return data?.error || 'Não foi possível concluir a operação.'
}

export default function UsuariosPage() {
  const router = useRouter()
  const supabase = useMemo(() => createClient(), [])
  const [users, setUsers] = useState<ManagedUser[]>([])
  const [stores, setStores] = useState<Store[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [showCreate, setShowCreate] = useState(false)
  const [editing, setEditing] = useState<ManagedUser | null>(null)
  const [form, setForm] = useState<UserForm>(emptyForm)
  const [temporaryPassword, setTemporaryPassword] = useState('')
  const [search, setSearch] = useState('')
  const [cargoFilter, setCargoFilter] = useState<'todos' | Cargo>('todos')
  const [statusFilter, setStatusFilter] = useState<'todos' | 'ativos' | 'inativos'>('todos')
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  const loadUsers = useCallback(async (silent = false) => {
    if (!silent) setLoading(true)
    setError('')

    const response = await fetch('/api/admin/users', { cache: 'no-store' })
    if (response.status === 401 || response.status === 403) {
      router.push('/dashboard')
      return
    }
    if (!response.ok) {
      setError(await getErrorMessage(response))
      setLoading(false)
      return
    }

    const data = await response.json()
    setUsers(data.users)
    setStores(data.stores)
    setForm((current) => ({ ...current, storeId: current.storeId || data.stores[0]?.id || '' }))
    setLoading(false)
  }, [router])

  useEffect(() => {
    const timer = window.setTimeout(() => loadUsers(), 0)
    return () => window.clearTimeout(timer)
  }, [loadUsers])

  useEffect(() => {
    const storeId = stores[0]?.id
    if (!storeId) return

    const channel = supabase
      .channel(`profiles-admin-${storeId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'profiles', filter: `store_id=eq.${storeId}` },
        () => loadUsers(true),
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [loadUsers, stores, supabase])

  const filteredUsers = users.filter((user) => {
    const query = search.trim().toLowerCase()
    const matchesSearch = !query || user.nome.toLowerCase().includes(query) || user.email.toLowerCase().includes(query)
    const matchesCargo = cargoFilter === 'todos' || user.cargo === cargoFilter
    const matchesStatus = statusFilter === 'todos' || (statusFilter === 'ativos' ? user.ativo : !user.ativo)
    return matchesSearch && matchesCargo && matchesStatus
  })

  function showMessage(message: string) {
    setSuccess(message)
    setError('')
    window.setTimeout(() => setSuccess(''), 4000)
  }

  async function handleCreate(event: React.FormEvent) {
    event.preventDefault()
    setError('')

    if (form.password !== form.confirmPassword) {
      setError('As senhas não coincidem.')
      return
    }

    setSaving(true)
    const response = await fetch('/api/admin/users', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        nome: form.nome,
        email: form.email,
        password: form.password,
        cargo: form.cargo,
        storeId: form.storeId,
      }),
    })
    setSaving(false)

    if (!response.ok) {
      setError(await getErrorMessage(response))
      return
    }

    setShowCreate(false)
    setForm({ ...emptyForm, storeId: stores[0]?.id ?? '' })
    showMessage('Usuário criado. Ele já pode entrar com o e-mail e a senha inicial.')
    await loadUsers(true)
  }

  async function updateUser(user: ManagedUser, changes: Record<string, unknown>, successMessage: string) {
    setSaving(true)
    setError('')
    const response = await fetch(`/api/admin/users/${user.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(changes),
    })
    setSaving(false)

    if (!response.ok) {
      setError(await getErrorMessage(response))
      return false
    }

    showMessage(successMessage)
    await loadUsers(true)
    return true
  }

  async function handleEdit(event: React.FormEvent) {
    event.preventDefault()
    if (!editing) return

    const ok = await updateUser(editing, {
      nome: editing.nome,
      cargo: editing.cargo,
      storeId: editing.storeId,
      ativo: editing.ativo,
    }, 'Usuário atualizado com sucesso.')

    if (ok) setEditing(null)
  }

  async function handleTemporaryPassword(event: React.FormEvent) {
    event.preventDefault()
    if (!editing) return
    const ok = await updateUser(editing, { password: temporaryPassword }, 'Senha temporária atualizada.')
    if (ok) setTemporaryPassword('')
  }

  if (loading) return <SpinnerPage />

  const inputClass = 'w-full rounded-xl px-4 py-3 text-white outline-none border bg-[#1a1a1a] border-[#2a2a2a] focus:border-[#c8960c]'

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-white">
      <header className="border-b border-[#1f1f1f] bg-[#111] px-4 py-4 md:px-6">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <button onClick={() => router.push('/dashboard/configuracoes')} className="rounded-lg border border-[#2a2a2a] px-3 py-2 text-sm text-[#aaa] hover:border-[#c8960c] hover:text-[#c8960c]">
              ← Voltar
            </button>
            <div>
              <h1 className="font-bold">Usuários e acessos</h1>
              <p className="text-xs text-[#666]">Cadastros, cargos, filial e senhas temporárias</p>
            </div>
          </div>
          <button onClick={() => { setShowCreate(true); setEditing(null); setError('') }} className="rounded-xl bg-[#c8960c] px-4 py-2.5 text-sm font-bold text-black hover:bg-[#e0a80e]">
            + Novo usuário
          </button>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 py-6 md:px-6 md:py-8">
        {error && <div className="mb-5 rounded-xl border border-[#4a1a1a] bg-[#2a0a0a] px-4 py-3 text-sm text-[#ff7b7b]">{error}</div>}
        {success && <div className="mb-5 rounded-xl border border-[#174a2a] bg-[#0b2a16] px-4 py-3 text-sm text-[#70e89a]">{success}</div>}

        <div className="mb-6 grid gap-3 rounded-2xl border border-[#1f1f1f] bg-[#111] p-4 md:grid-cols-[1fr_180px_180px]">
          <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar por nome ou e-mail" className={inputClass} />
          <select value={cargoFilter} onChange={(event) => setCargoFilter(event.target.value as typeof cargoFilter)} className={inputClass}>
            <option value="todos">Todos os cargos</option>
            <option value="gestor">Gestores</option>
            <option value="vendedor">Vendedores</option>
          </select>
          <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as typeof statusFilter)} className={inputClass}>
            <option value="todos">Todos os status</option>
            <option value="ativos">Ativos</option>
            <option value="inativos">Inativos</option>
          </select>
        </div>

        <div className="mb-4 flex items-center justify-between text-sm text-[#777]">
          <span>{filteredUsers.length} usuário(s)</span>
          <span>{stores[0]?.nome}</span>
        </div>

        <div className="grid gap-3">
          {filteredUsers.map((user) => (
            <div key={user.id} className="flex flex-col gap-4 rounded-2xl border border-[#1f1f1f] bg-[#111] p-5 md:flex-row md:items-center">
              <div className="flex h-11 w-11 flex-none items-center justify-center rounded-full bg-[#c8960c22] font-bold text-[#c8960c]">
                {user.nome.slice(0, 1).toUpperCase()}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="font-semibold">{user.nome}</p>
                  {user.isCurrentUser && <span className="rounded-full bg-[#222] px-2 py-0.5 text-xs text-[#aaa]">Você</span>}
                </div>
                <p className="truncate text-sm text-[#777]">{user.email || 'E-mail indisponível'}</p>
              </div>
              <div className="flex flex-wrap gap-2 text-xs">
                <span className="rounded-full bg-[#c8960c18] px-3 py-1.5 capitalize text-[#d8a51b]">{user.cargo}</span>
                <span className="rounded-full bg-[#1a1a1a] px-3 py-1.5 text-[#aaa]">{user.storeNome}</span>
                <span className={`rounded-full px-3 py-1.5 ${user.ativo ? 'bg-[#12321d] text-[#68d391]' : 'bg-[#321515] text-[#f88]'}`}>
                  {user.ativo ? 'Ativo' : 'Inativo'}
                </span>
              </div>
              <button onClick={() => { setEditing({ ...user }); setShowCreate(false); setTemporaryPassword(''); setError('') }} className="rounded-lg border border-[#2a2a2a] px-4 py-2 text-sm text-[#aaa] hover:border-[#c8960c] hover:text-[#c8960c]">
                Editar
              </button>
            </div>
          ))}
          {filteredUsers.length === 0 && <div className="rounded-2xl border border-dashed border-[#2a2a2a] p-10 text-center text-[#666]">Nenhum usuário encontrado.</div>}
        </div>

        {showCreate && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4" onMouseDown={() => !saving && setShowCreate(false)}>
            <form onSubmit={handleCreate} onMouseDown={(event) => event.stopPropagation()} className="max-h-[92vh] w-full max-w-xl overflow-y-auto rounded-2xl border border-[#2a2a2a] bg-[#111] p-6">
              <div className="mb-6 flex items-center justify-between">
                <div><h2 className="text-xl font-bold">Novo usuário</h2><p className="text-sm text-[#777]">A conta será criada no Supabase automaticamente.</p></div>
                <button type="button" onClick={() => setShowCreate(false)} className="text-2xl text-[#777]">×</button>
              </div>
              <div className="grid gap-4">
                <label className="text-sm text-[#aaa]">Nome<input required value={form.nome} onChange={(event) => setForm({ ...form, nome: event.target.value })} className={`${inputClass} mt-2`} /></label>
                <label className="text-sm text-[#aaa]">E-mail<input required type="email" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} className={`${inputClass} mt-2`} /></label>
                <div className="grid gap-4 md:grid-cols-2">
                  <label className="text-sm text-[#aaa]">Cargo<select value={form.cargo} onChange={(event) => setForm({ ...form, cargo: event.target.value as Cargo })} className={`${inputClass} mt-2`}><option value="vendedor">Vendedor</option><option value="gestor">Gestor</option></select></label>
                  <label className="text-sm text-[#aaa]">Filial<select value={form.storeId} onChange={(event) => setForm({ ...form, storeId: event.target.value })} className={`${inputClass} mt-2`}>{stores.map((store) => <option key={store.id} value={store.id}>{store.nome}</option>)}</select></label>
                </div>
                <div className="grid gap-4 md:grid-cols-2">
                  <label className="text-sm text-[#aaa]">Senha inicial<input required minLength={8} type="password" value={form.password} onChange={(event) => setForm({ ...form, password: event.target.value })} className={`${inputClass} mt-2`} /></label>
                  <label className="text-sm text-[#aaa]">Confirmar senha<input required minLength={8} type="password" value={form.confirmPassword} onChange={(event) => setForm({ ...form, confirmPassword: event.target.value })} className={`${inputClass} mt-2`} /></label>
                </div>
                <p className="text-xs text-[#666]">A senha não será armazenada nem poderá ser consultada depois.</p>
                <div className="mt-2 flex justify-end gap-3">
                  <button type="button" disabled={saving} onClick={() => setShowCreate(false)} className="rounded-xl border border-[#2a2a2a] px-5 py-3 text-sm text-[#aaa]">Cancelar</button>
                  <button disabled={saving} className="rounded-xl bg-[#c8960c] px-5 py-3 text-sm font-bold text-black disabled:opacity-50">{saving ? 'Criando...' : 'Criar usuário'}</button>
                </div>
              </div>
            </form>
          </div>
        )}

        {editing && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4" onMouseDown={() => !saving && setEditing(null)}>
            <div onMouseDown={(event) => event.stopPropagation()} className="max-h-[92vh] w-full max-w-xl overflow-y-auto rounded-2xl border border-[#2a2a2a] bg-[#111] p-6">
              <div className="mb-6 flex items-center justify-between"><div><h2 className="text-xl font-bold">Editar usuário</h2><p className="text-sm text-[#777]">{editing.email}</p></div><button onClick={() => setEditing(null)} className="text-2xl text-[#777]">×</button></div>
              <form onSubmit={handleEdit} className="grid gap-4">
                <label className="text-sm text-[#aaa]">Nome<input required value={editing.nome} onChange={(event) => setEditing({ ...editing, nome: event.target.value })} className={`${inputClass} mt-2`} /></label>
                <div className="grid gap-4 md:grid-cols-2">
                  <label className="text-sm text-[#aaa]">Cargo<select disabled={editing.isCurrentUser} value={editing.cargo} onChange={(event) => setEditing({ ...editing, cargo: event.target.value as Cargo })} className={`${inputClass} mt-2 disabled:opacity-50`}><option value="vendedor">Vendedor</option><option value="gestor">Gestor</option></select></label>
                  <label className="text-sm text-[#aaa]">Filial<select disabled={editing.isCurrentUser} value={editing.storeId} onChange={(event) => setEditing({ ...editing, storeId: event.target.value })} className={`${inputClass} mt-2 disabled:opacity-50`}>{stores.map((store) => <option key={store.id} value={store.id}>{store.nome}</option>)}</select></label>
                </div>
                <label className="flex items-center justify-between rounded-xl border border-[#2a2a2a] bg-[#1a1a1a] p-4"><span><span className="block text-sm font-medium">Usuário ativo</span><span className="text-xs text-[#777]">Inativos não conseguem acessar o sistema.</span></span><input type="checkbox" disabled={editing.isCurrentUser} checked={editing.ativo} onChange={(event) => setEditing({ ...editing, ativo: event.target.checked })} className="h-5 w-5 accent-[#c8960c]" /></label>
                {editing.isCurrentUser && <p className="text-xs text-[#777]">Para sua segurança, você não pode remover o próprio cargo, filial ou acesso.</p>}
                <div className="flex justify-end gap-3"><button type="button" onClick={() => setEditing(null)} className="rounded-xl border border-[#2a2a2a] px-5 py-3 text-sm text-[#aaa]">Cancelar</button><button disabled={saving} className="rounded-xl bg-[#c8960c] px-5 py-3 text-sm font-bold text-black disabled:opacity-50">{saving ? 'Salvando...' : 'Salvar alterações'}</button></div>
              </form>

              <div className="my-6 h-px bg-[#242424]" />
              <form onSubmit={handleTemporaryPassword} className="grid gap-3">
                <div><h3 className="font-semibold">Definir senha temporária</h3><p className="text-xs text-[#777]">A senha não será exibida novamente nem salva no perfil.</p></div>
                <div className="flex flex-col gap-3 md:flex-row"><input required minLength={8} type="password" value={temporaryPassword} onChange={(event) => setTemporaryPassword(event.target.value)} placeholder="Mínimo de 8 caracteres" className={inputClass} /><button disabled={saving} className="whitespace-nowrap rounded-xl border border-[#c8960c] px-4 py-3 text-sm font-semibold text-[#c8960c] disabled:opacity-50">Atualizar senha</button></div>
              </form>
            </div>
          </div>
        )}
      </main>
    </div>
  )
}
