import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export async function proxy(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          supabaseResponse = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  const { data: { user } } = await supabase.auth.getUser()
  const { pathname } = request.nextUrl
  const isLoginRoute = pathname === '/login'
  const isDashboardRoute = pathname.startsWith('/dashboard')
  const isProductManagementRoute =
    pathname === '/dashboard/novo-produto' ||
    pathname.startsWith('/dashboard/editar-produto/')
  const isSettingsRoute = pathname.startsWith('/dashboard/configuracoes')

  let profile: { cargo: string; ativo: boolean } | null = null

  if (user && (isLoginRoute || isDashboardRoute)) {
    const { data } = await supabase
        .from('profiles')
        .select('cargo, ativo')
        .eq('id', user.id)
        .single()

    profile = data
  }

  if (!user && isDashboardRoute) {
    return NextResponse.redirect(new URL('/login', request.url))
  }

  if (user && (!profile || profile.ativo === false)) {
    if (isLoginRoute || isDashboardRoute) {
      return NextResponse.redirect(new URL('/login?erro=acesso', request.url))
    }
    return supabaseResponse
  }

  if (user && profile && isLoginRoute) {
    return NextResponse.redirect(new URL('/dashboard/estoque', request.url))
  }

  if (user && isProductManagementRoute) {
    if (profile?.cargo !== 'gestor') {
      return NextResponse.redirect(new URL('/dashboard/estoque', request.url))
    }
  }

  if (user && isSettingsRoute && profile?.cargo !== 'gestor') {
    return NextResponse.redirect(new URL('/dashboard', request.url))
  }

  return supabaseResponse
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)'],
}
