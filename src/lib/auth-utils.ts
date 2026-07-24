import { supabase } from './supabase'
import type { AppUser } from '../context/Auth'

/** Maps app username to the Supabase Auth email used at sign-up. */
export const usernameToEmail = (username: string) =>
  `${username.trim().toLowerCase().replace(/\s+/g, '.')}.trackerentory@local.test`

export function formatAuthError(message: string) {
  if (message === 'Invalid login credentials') {
    return [
      'Invalid username or password.',
      'Accounts must exist in Supabase Auth — not only in the users table.',
      'Use Sign up for new Customer/Renter accounts, or link existing DB users in Supabase (see docs/supabase-auth-users.md).',
    ].join(' ')
  }
  return message
}

type RegisterInput = {
  full_name: string
  username: string
  password: string
  role: AppUser['role']
  status?: string
  salary?: number | null
}

/** Creates Supabase Auth user + linked users row. */
export async function registerAuthAndProfile(input: RegisterInput) {
  const email = usernameToEmail(input.username)
  const { data, error } = await supabase.auth.signUp({
    email,
    password: input.password,
  })

  if (error) return { error: formatAuthError(error.message), appUser: null as AppUser | null }
  const authId = data.user?.id
  if (!authId) return { error: 'Unable to create auth account. Please try again.', appUser: null }

  if (!data.session) {
    const signInResult = await supabase.auth.signInWithPassword({ email, password: input.password })
    if (signInResult.error) {
      return { error: formatAuthError(signInResult.error.message), appUser: null }
    }
  }

  const { data: appUser, error: insertError } = await supabase
    .from('users')
    .insert([{
      auth_id: authId,
      full_name: input.full_name,
      username: input.username,
      password: input.password,
      role: input.role,
      status: input.status ?? 'Active',
      salary: input.salary ?? null,
    }])
    .select('user_id, full_name, role, status, salary, username')
    .maybeSingle()

  if (insertError || !appUser) {
    await supabase.auth.signOut()
    return { error: insertError?.message ?? 'Failed to create user profile.', appUser: null }
  }

  return { error: null, appUser: appUser as AppUser }
}
