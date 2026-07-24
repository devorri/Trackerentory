import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { supabase } from '../lib/supabase'

export type AppUser = {
  user_id: number
  full_name: string
  role: 'Owner' | 'Staff' | 'Renter' | 'Customer'
  status: string | null
  salary: number | null
  username: string
}

type AuthContextValue = {
  user: AppUser | null
  /** @deprecated use `user` — kept for existing pages */
  appUser: AppUser | null
  loading: boolean
  signIn: (username: string, password: string) => Promise<{ error: string | null }>
  signUp: (input: {
    full_name: string
    username: string
    password: string
    role: AppUser['role']
  }) => Promise<{ error: string | null }>
  signOut: () => void
}

const SESSION_KEY = 'trackerentory_user'
const AuthContext = createContext<AuthContextValue | null>(null)

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<AppUser | null>(null)
  const [loading, setLoading] = useState(true)

  const persist = (next: AppUser | null) => {
    setUser(next)
    if (next) localStorage.setItem(SESSION_KEY, JSON.stringify(next))
    else localStorage.removeItem(SESSION_KEY)
  }

  useEffect(() => {
    try {
      const raw = localStorage.getItem(SESSION_KEY)
      if (raw) setUser(JSON.parse(raw) as AppUser)
    } catch {
      localStorage.removeItem(SESSION_KEY)
    } finally {
      setLoading(false)
    }
  }, [])

  const signIn = async (username: string, password: string) => {
    const { data, error } = await supabase
      .from('users')
      .select('user_id, full_name, role, status, salary, username')
      .eq('username', username)
      .eq('password', password)
      .maybeSingle()

    if (error) return { error: error.message }
    if (!data) return { error: 'Invalid username or password' }
    if (data.status === 'Resigned') return { error: 'This account is resigned.' }

    persist(data as AppUser)
    return { error: null }
  }

  const signUp = async (input: {
    full_name: string
    username: string
    password: string
    role: AppUser['role']
  }) => {
    const { data, error } = await supabase
      .from('users')
      .insert([{
        full_name: input.full_name,
        username: input.username,
        password: input.password,
        role: input.role,
        status: 'Active',
      }])
      .select('user_id, full_name, role, status, salary, username')
      .maybeSingle()

    if (error) return { error: error.message }
    if (!data) return { error: 'Failed to create user account.' }

    persist(data as AppUser)
    return { error: null }
  }

  const signOut = () => {
    persist(null)
  }

  return (
    <AuthContext.Provider value={{ user, appUser: user, loading, signIn, signUp, signOut }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
