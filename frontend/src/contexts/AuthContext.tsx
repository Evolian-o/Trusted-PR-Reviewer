import { createContext, useContext, useEffect, useState, useCallback, type ReactNode } from 'react'
import { checkAuthStatus } from '../services/api'

interface AuthUser {
  login: string
  avatar_url: string
  user_id: number
}

interface AuthState {
  loading: boolean
  authenticated: boolean
  user: AuthUser | null
  tokenExpired: boolean
}

interface AuthContextValue {
  auth: AuthState
  refresh: () => Promise<void>
  logout: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [auth, setAuth] = useState<AuthState>({
    loading: true,
    authenticated: false,
    user: null,
    tokenExpired: false,
  })

  const refresh = useCallback(async () => {
    try {
      const data = await checkAuthStatus()
      setAuth({
        loading: false,
        authenticated: data.authenticated,
        user: data.authenticated
          ? { login: data.login!, avatar_url: data.avatar_url!, user_id: 0 }
          : null,
        tokenExpired: !!data.token_expired,
      })
    } catch {
      setAuth({ loading: false, authenticated: false, user: null, tokenExpired: false })
    }
  }, [])

  const logout = useCallback(async () => {
    await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' })
    setAuth({ loading: false, authenticated: false, user: null, tokenExpired: false })
  }, [])

  useEffect(() => {
    refresh()
  }, [refresh])

  return (
    <AuthContext.Provider value={{ auth, refresh, logout }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
