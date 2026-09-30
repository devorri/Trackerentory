import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth, type AppUser } from '../context/Auth'
import { supabaseConfigError, supabase } from '../lib/supabase'
import { requestOtp, verifyOtp } from '../lib/otp'
import PasswordInput from '../components/PasswordInput'

const PUBLIC_ROLES: AppUser['role'][] = ['Customer', 'Renter']

type AuthMode = 'signin' | 'signup' | 'forgot'
type SignupStep = 'form' | 'otp' | 'done'
type ForgotStep = 'email' | 'otp' | 'newpass'

export default function LoginPage() {
  const [mode, setMode] = useState<AuthMode>('signin')

  // Sign in state
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const { signIn, signUp, resetPassword } = useAuth()
  const nav = useNavigate()

  // Sign up state
  const [signupStep, setSignupStep] = useState<SignupStep>('form')
  const [fullName, setFullName] = useState('')
  const [signupEmail, setSignupEmail] = useState('')
  const [signupUsername, setSignupUsername] = useState('')
  const [signupPassword, setSignupPassword] = useState('')
  const [role, setRole] = useState<AppUser['role']>('Customer')
  const [otpCode, setOtpCode] = useState('')

  // Forgot password state
  const [forgotStep, setForgotStep] = useState<ForgotStep>('email')
  const [forgotUsername, setForgotUsername] = useState('')
  const [forgotEmail, setForgotEmail] = useState('')
  const [forgotOtp, setForgotOtp] = useState('')
  const [newPassword, setNewPassword] = useState('')

  const [error, setError] = useState('')
  const [info, setInfo] = useState('')

  function switchMode(m: AuthMode) {
    setMode(m)
    setError('')
    setInfo('')
    setSignupStep('form')
    setForgotStep('email')
    setOtpCode('')
    setForgotOtp('')
  }

  // ── SIGN IN ──
  async function handleSignIn() {
    setLoading(true)
    setError('')
    const result = await signIn(username, password)
    setLoading(false)
    if (result.error) return setError(result.error)

    const raw = localStorage.getItem('trackerentory_user')
    const u = raw ? JSON.parse(raw) as AppUser : null
    if (u?.role === 'Owner') nav('/owner')
    else if (u?.role === 'Renter') nav('/renter')
    else if (u?.role === 'Staff') nav('/pickup')
    else nav('/')
  }

  // ── SIGN UP ──
  async function handleSignupSubmitForm() {
    if (!fullName || !signupUsername || !signupPassword || !signupEmail) {
      return setError('All fields are required.')
    }
    setLoading(true)
    setError('')

    // Check if username already exists
    const { data: existing } = await supabase
      .from('users')
      .select('user_id')
      .eq('username', signupUsername)
      .maybeSingle()
    if (existing) {
      setLoading(false)
      return setError('Username already taken.')
    }

    // Send OTP to email
    const otpResult = await requestOtp(signupEmail, 'create_account')
    setLoading(false)
    if (otpResult.error) return setError('Failed to send OTP: ' + otpResult.error)

    setInfo('A 6-digit code has been sent to your email.')
    setSignupStep('otp')
  }

  async function handleSignupVerifyOtp() {
    if (!otpCode || otpCode.length < 6) return setError('Enter the 6-digit code.')
    setLoading(true)
    setError('')

    const verify = await verifyOtp(signupEmail, otpCode, 'create_account')
    if (!verify.valid) {
      setLoading(false)
      return setError(verify.error || 'Invalid code.')
    }

    // Create the account
    const result = await signUp({
      full_name: fullName,
      username: signupUsername,
      password: signupPassword,
      email: signupEmail,
      role,
    })
    setLoading(false)
    if (result.error) return setError(result.error)

    const raw = localStorage.getItem('trackerentory_user')
    const u = raw ? JSON.parse(raw) as AppUser : null
    if (u?.role === 'Renter') nav('/renter')
    else nav('/')
  }

  // ── FORGOT PASSWORD ──
  async function handleForgotSendOtp() {
    if (!forgotUsername) return setError('Enter your username.')
    setLoading(true)
    setError('')

    // Find the user and their email
    const { data: user } = await supabase
      .from('users')
      .select('user_id, email, username')
      .eq('username', forgotUsername)
      .maybeSingle()

    if (!user || !user.email) {
      setLoading(false)
      return setError('Account not found or no email registered.')
    }

    setForgotEmail(user.email)
    const otpResult = await requestOtp(user.email, 'forgot_password', user.user_id)
    setLoading(false)
    if (otpResult.error) return setError('Failed to send OTP: ' + otpResult.error)

    setInfo(`OTP sent to ${maskEmail(user.email)}.`)
    setForgotStep('otp')
  }

  async function handleForgotVerifyOtp() {
    if (!forgotOtp || forgotOtp.length < 6) return setError('Enter the 6-digit code.')
    setLoading(true)
    setError('')

    const verify = await verifyOtp(forgotEmail, forgotOtp, 'forgot_password')
    setLoading(false)
    if (!verify.valid) return setError(verify.error || 'Invalid code.')

    setInfo('Verified! Enter your new password.')
    setForgotStep('newpass')
  }

  async function handleForgotResetPassword() {
    if (!newPassword || newPassword.length < 4) return setError('Password must be at least 4 characters.')
    setLoading(true)
    setError('')

    const result = await resetPassword(forgotUsername, newPassword)
    setLoading(false)
    if (result.error) return setError(result.error)

    setInfo('Password reset successfully! You can now sign in.')
    setTimeout(() => switchMode('signin'), 1500)
  }

  function maskEmail(email: string) {
    const [local, domain] = email.split('@')
    if (!domain) return email
    const masked = local.slice(0, 2) + '***'
    return `${masked}@${domain}`
  }

  // ── RENDER ──
  return (
    <div className="auth-layout">
      <div className="auth-card">
        <span className="brand">Track<span>Erentory</span></span>

        {mode === 'signin' && (
          <p className="lede">Sign in to manage cubes, reservations, and pickups.</p>
        )}
        {mode === 'signup' && (
          <p className="lede">Create a Customer or Renter account. Staff are added by the Owner.</p>
        )}
        {mode === 'forgot' && (
          <p className="lede">Reset your password using your registered email.</p>
        )}

        {supabaseConfigError && (
          <div className="alert warn" style={{ marginBottom: '0.85rem' }}>
            <strong>Supabase not connected</strong>
            <p style={{ margin: '0.45rem 0 0' }}>{supabaseConfigError}</p>
          </div>
        )}

        {error && (
          <div className="alert warn" style={{ marginBottom: '0.85rem' }}>
            <p>{error}</p>
          </div>
        )}
        {info && !error && (
          <div className="alert" style={{ marginBottom: '0.85rem', borderColor: 'rgba(23,114,69,0.28)', background: 'linear-gradient(180deg, #f0fdf4, #fff)' }}>
            <p>{info}</p>
          </div>
        )}

        {/* ═══════ SIGN IN ═══════ */}
        {mode === 'signin' && (
          <>
            <div className="field">
              <label>Username</label>
              <input value={username} onChange={(e) => setUsername(e.target.value)} autoComplete="username" />
            </div>
            <PasswordInput
              label="Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
            />
            <div style={{ marginTop: '-0.5rem', marginBottom: '0.75rem' }}>
              <button type="button" className="forgot-link" onClick={() => switchMode('forgot')}>
                Forgot password?
              </button>
            </div>
            <div className="row" style={{ marginTop: '0.35rem' }}>
              <button className="btn" type="button" onClick={handleSignIn} disabled={loading}>
                {loading ? 'Please wait…' : 'Sign in'}
              </button>
              <button className="btn-ghost" type="button" onClick={() => switchMode('signup')} disabled={loading}>
                Need an account?
              </button>
            </div>
          </>
        )}

        {/* ═══════ SIGN UP ═══════ */}
        {mode === 'signup' && (
          <>
            {/* Step indicator */}
            <div className="auth-steps">
              <div className={`auth-step ${signupStep === 'form' ? 'active' : 'done'}`} />
              <div className={`auth-step ${signupStep === 'otp' ? 'active' : signupStep === 'done' ? 'done' : ''}`} />
            </div>

            {signupStep === 'form' && (
              <>
                <div className="field">
                  <label>Full name</label>
                  <input value={fullName} onChange={(e) => setFullName(e.target.value)} />
                </div>
                <div className="field">
                  <label>Email</label>
                  <input type="email" value={signupEmail} onChange={(e) => setSignupEmail(e.target.value)} placeholder="your@email.com" />
                </div>
                <div className="field">
                  <label>Role</label>
                  <select value={role} onChange={(e) => setRole(e.target.value as AppUser['role'])}>
                    {PUBLIC_ROLES.map((r) => (
                      <option key={r} value={r}>{r}</option>
                    ))}
                  </select>
                </div>
                <div className="field">
                  <label>Username</label>
                  <input value={signupUsername} onChange={(e) => setSignupUsername(e.target.value)} autoComplete="username" />
                </div>
                <PasswordInput
                  label="Password"
                  value={signupPassword}
                  onChange={(e) => setSignupPassword(e.target.value)}
                  autoComplete="new-password"
                />
                <div className="row" style={{ marginTop: '0.35rem' }}>
                  <button className="btn" type="button" onClick={handleSignupSubmitForm} disabled={loading}>
                    {loading ? 'Sending OTP…' : 'Continue'}
                  </button>
                  <button className="btn-ghost" type="button" onClick={() => switchMode('signin')} disabled={loading}>
                    Have an account?
                  </button>
                </div>
              </>
            )}

            {signupStep === 'otp' && (
              <>
                <div className="field">
                  <label>Enter the 6-digit code sent to {signupEmail}</label>
                  <input
                    className="otp-input"
                    maxLength={6}
                    value={otpCode}
                    onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                    placeholder="000000"
                  />
                </div>
                <div className="row" style={{ marginTop: '0.35rem' }}>
                  <button className="btn" type="button" onClick={handleSignupVerifyOtp} disabled={loading}>
                    {loading ? 'Verifying…' : 'Verify & Create Account'}
                  </button>
                  <button className="btn-ghost" type="button" onClick={() => { setSignupStep('form'); setError(''); setInfo('') }} disabled={loading}>
                    Back
                  </button>
                </div>
              </>
            )}
          </>
        )}

        {/* ═══════ FORGOT PASSWORD ═══════ */}
        {mode === 'forgot' && (
          <>
            {/* Step indicator */}
            <div className="auth-steps">
              <div className={`auth-step ${forgotStep === 'email' ? 'active' : 'done'}`} />
              <div className={`auth-step ${forgotStep === 'otp' ? 'active' : forgotStep === 'newpass' ? 'done' : ''}`} />
              <div className={`auth-step ${forgotStep === 'newpass' ? 'active' : ''}`} />
            </div>

            {forgotStep === 'email' && (
              <>
                <div className="field">
                  <label>Username</label>
                  <input value={forgotUsername} onChange={(e) => setForgotUsername(e.target.value)} autoComplete="username" />
                </div>
                <div className="row" style={{ marginTop: '0.35rem' }}>
                  <button className="btn" type="button" onClick={handleForgotSendOtp} disabled={loading}>
                    {loading ? 'Sending…' : 'Send OTP'}
                  </button>
                  <button className="btn-ghost" type="button" onClick={() => switchMode('signin')} disabled={loading}>
                    Back to sign in
                  </button>
                </div>
              </>
            )}

            {forgotStep === 'otp' && (
              <>
                <div className="field">
                  <label>Enter the 6-digit code</label>
                  <input
                    className="otp-input"
                    maxLength={6}
                    value={forgotOtp}
                    onChange={(e) => setForgotOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
                    placeholder="000000"
                  />
                </div>
                <div className="row" style={{ marginTop: '0.35rem' }}>
                  <button className="btn" type="button" onClick={handleForgotVerifyOtp} disabled={loading}>
                    {loading ? 'Verifying…' : 'Verify code'}
                  </button>
                  <button className="btn-ghost" type="button" onClick={() => { setForgotStep('email'); setError(''); setInfo('') }} disabled={loading}>
                    Back
                  </button>
                </div>
              </>
            )}

            {forgotStep === 'newpass' && (
              <>
                <PasswordInput
                  label="New password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  autoComplete="new-password"
                />
                <div className="row" style={{ marginTop: '0.35rem' }}>
                  <button className="btn" type="button" onClick={handleForgotResetPassword} disabled={loading}>
                    {loading ? 'Resetting…' : 'Reset password'}
                  </button>
                </div>
              </>
            )}
          </>
        )}
      </div>
    </div>
  )
}
