import { createServerClient } from '@supabase/ssr'
import { createClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'

function requireServerEnv(name: 'NEXT_PUBLIC_SUPABASE_URL' | 'NEXT_PUBLIC_SUPABASE_ANON_KEY' | 'SUPABASE_SERVICE_ROLE_KEY') {
  const value = process.env[name]
  if (!value) throw new Error(`Variável de ambiente obrigatória ausente: ${name}`)
  return value
}

export async function createAuthenticatedServerClient() {
  const cookieStore = await cookies()

  return createServerClient(
    requireServerEnv('NEXT_PUBLIC_SUPABASE_URL'),
    requireServerEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY'),
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: (cookiesToSet) => {
          cookiesToSet.forEach(({ name, value, options }) => {
            cookieStore.set(name, value, options)
          })
        },
      },
    },
  )
}

export function createAdminClient() {
  return createClient(
    requireServerEnv('NEXT_PUBLIC_SUPABASE_URL'),
    requireServerEnv('SUPABASE_SERVICE_ROLE_KEY'),
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    },
  )
}
