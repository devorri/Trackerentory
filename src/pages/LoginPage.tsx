import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth, type AppUser } from '../context/Auth'
import { supabaseConfigError } from '../lib/supabase'

const PUBLIC_ROLES: AppUser['role'][] = ['Customer', 'Renter']

export default function LoginPage() {
  const [mode, setMode] = useState<'signin' | 'signup'>('signin')
  const [fullName, setFullName] = useState('')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [role, setRole] = useState<AppUser['role']>('Customer')
  const [loading, setLoading] = useState(false)
  const { signIn, signUp } = useAuth()
  const nav = useNavigate()

  async function submit() {
    setLoading(true)
    const result =
      mode === 'signin'
        ? await signIn(username, password)
        : await signUp({ full_name: fullName, username, password, role })
    setLoading(false)
    if (result.error) return alert(result.error)

    const raw = localStorage.getItem('trackerentory_user')
    const u = raw ? JSON.parse(raw) as AppUser : null
    if (u?.role === 'Owner') nav('/owner')
    else if (u?.role === 'Renter') nav('/renter')
    else if (u?.role === 'Staff') nav('/pickup')
    else nav('/')
  }

  return (
    <div className="auth-layout">
      <div className="auth-card">
        <span className="brand">Track<span>Erentory</span></span>
        <p className="lede">
          {mode === 'signin'
            ? 'Sign in to manage cubes, reservations, and pickups.'
            : 'Create a Customer or Renter account. Staff are added by the Owner.'}
        </p>

        {supabaseConfigError && (
          <div className="alert warn" style={{ marginBottom: '0.85rem' }}>
            <strong>Supabase not connected</strong>
            <p style={{ margin: '0.45rem 0 0' }}>{supabaseConfigError}</p>
          </div>
        )}

        {mode === 'signup' && (
          <>
            <div className="field">
              <label>Full name</label>
              <input value={fullName} onChange={(e) => setFullName(e.target.value)} />
            </div>
            <div className="field">
              <label>Role</label>
              <select value={role} onChange={(e) => setRole(e.target.value as AppUser['role'])}>
                {PUBLIC_ROLES.map((r) => (
                  <option key={r} value={r}>{r}</option>
                ))}
              </select>
            </div>
          </>
        )}

        <div className="field">
          <label>Username</label>
          <input value={username} onChange={(e) => setUsername(e.target.value)} autoComplete="username" />
        </div>
        <div className="field">
          <label>Password</label>
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" />
        </div>

        <div className="row" style={{ marginTop: '0.35rem' }}>
          <button className="btn" type="button" onClick={submit} disabled={loading}>
            {loading ? 'Please wait…' : mode === 'signin' ? 'Sign in' : 'Create account'}
          </button>
          <button
            className="btn-ghost"
            type="button"
            onClick={() => setMode(mode === 'signin' ? 'signup' : 'signin')}
            disabled={loading}
          >
            {mode === 'signin' ? 'Need an account?' : 'Have an account?'}
          </button>
        </div>
      </div>
    </div>
  )
}
