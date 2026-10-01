import { useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useAuth, type AppUser } from '../context/Auth'
import { supabaseConfigError, supabase } from '../lib/supabase'
import { requestOtp, verifyOtp } from '../lib/otp'
import { validatePasswordStrength, type PasswordCheck } from '../lib/auth-utils'
import PasswordInput from '../components/PasswordInput'

const PUBLIC_ROLES: AppUser['role'][] = ['Customer', 'Renter']

type AuthMode = 'signin' | 'signup' | 'forgot'
type SigninStep = 'credentials' | 'otp'
type SignupStep = 'form' | 'otp' | 'done'
type ForgotStep = 'email' | 'otp' | 'newpass'

function PasswordStrengthIndicator({ checks }: { checks: PasswordCheck[] }) {
  if (!checks.length) return null
  return (
    <ul className="pw-checks">
      {checks.map((c) => (
        <li key={c.label} className={c.met ? 'met' : ''}>
          <span className="pw-check-icon">{c.met ? '✓' : '✗'}</span>
          {c.label}
        </li>
      ))}
    </ul>
  )
}

export default function LoginPage() {
  const [mode, setMode] = useState<AuthMode>('signin')
  const [searchParams] = useSearchParams()

  // Sign in state
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const { signIn, signUp, resetPassword } = useAuth()
  const nav = useNavigate()

  // Sign in 2FA state
  const [signinStep, setSigninStep] = useState<SigninStep>('credentials')
  const [signinOtp, setSigninOtp] = useState('')
  const [signinEmail, setSigninEmail] = useState('')
  const [signinTestOtp, setSigninTestOtp] = useState<string | null>(null)

  // Sign up state
  const [signupStep, setSignupStep] = useState<SignupStep>('form')
  const [fullName, setFullName] = useState('')
  const [signupEmail, setSignupEmail] = useState('')
  const [signupUsername, setSignupUsername] = useState('')
  const [signupPassword, setSignupPassword] = useState('')
  const [signupConfirmPw, setSignupConfirmPw] = useState('')
  const [role, setRole] = useState<AppUser['role']>('Customer')
  const [otpCode, setOtpCode] = useState('')

  // Forgot password state
  const [forgotStep, setForgotStep] = useState<ForgotStep>('email')
  const [forgotUsername, setForgotUsername] = useState('')
  const [forgotEmail, setForgotEmail] = useState('')
  const [forgotOtp, setForgotOtp] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [newPasswordConfirm, setNewPasswordConfirm] = useState('')

  // Test / demo fallback OTP code display
  const [signupTestOtp, setSignupTestOtp] = useState<string | null>(null)
  const [forgotTestOtp, setForgotTestOtp] = useState<string | null>(null)

  const [error, setError] = useState('')
  const [info, setInfo] = useState('')

  function switchMode(m: AuthMode) {
    setMode(m)
    setError('')
    setInfo('')
    setSigninStep('credentials')
    setSignupStep('form')
    setForgotStep('email')
    setOtpCode('')
    setSigninOtp('')
    setForgotOtp('')
    setSignupTestOtp(null)
    setSigninTestOtp(null)
    setForgotTestOtp(null)
    setSignupConfirmPw('')
    setNewPasswordConfirm('')
  }

  function navigateAfterAuth(u: AppUser | null) {
    const redirect = searchParams.get('redirect')
    if (redirect) {
      nav(redirect)
      return
    }
    if (u?.role === 'Owner') nav('/owner')
    else if (u?.role === 'Renter') nav('/renter')
    else if (u?.role === 'Staff') nav('/pickup')
    else nav('/')
  }

  // ── SIGN IN (Step 1: credentials → Step 2: OTP) ──
  async function handleSignInCredentials() {
    setLoading(true)
    setError('')

    // Validate credentials first
    const { data, error: dbError } = await supabase
      .from('users')
      .select('user_id, full_name, role, status, salary, username, email')
      .eq('username', username)
      .eq('password', password)
      .maybeSingle()

    if (dbError) {
      setLoading(false)
      return setError(dbError.message)
    }
    if (!data) {
      setLoading(false)
      return setError('Invalid username or password.')
    }
    if (data.status === 'Resigned') {
      setLoading(false)
      return setError('This account is resigned.')
    }

    const appUser = data as AppUser

    // Check if user has email for 2FA
    if (!appUser.email) {
      // No email — skip 2FA, sign in directly
      const result = await signIn(username, password)
      setLoading(false)
      if (result.error) return setError(result.error)
      const raw = localStorage.getItem('trackerentory_user')
      const u = raw ? JSON.parse(raw) as AppUser : null
      navigateAfterAuth(u)
      return
    }

    // Send OTP for 2FA
    setSigninEmail(appUser.email)
    const otpResult = await requestOtp(appUser.email, 'login', appUser.user_id)
    setLoading(false)

    if (otpResult.error) return setError('Failed to send OTP: ' + otpResult.error)

    if (otpResult.emailSent) {
      setInfo(`A verification code has been sent to ${maskEmail(appUser.email)}.`)
      setSigninTestOtp(null)
    } else if (otpResult.code) {
      setSigninTestOtp(otpResult.code)
      setSigninOtp(otpResult.code)
      setInfo(`Demo/Test Mode: Your verification code is ${otpResult.code} (auto-filled below).`)
    }
    setSigninStep('otp')
  }

  async function handleSignInVerifyOtp() {
    if (!signinOtp || signinOtp.length < 6) return setError('Enter the 6-digit code.')
    setLoading(true)
    setError('')

    const verify = await verifyOtp(signinEmail, signinOtp, 'login')
    if (!verify.valid) {
      setLoading(false)
      return setError(verify.error || 'Invalid code.')
    }

    // OTP verified — complete sign in
    const result = await signIn(username, password)
    setLoading(false)
    if (result.error) return setError(result.error)

    const raw = localStorage.getItem('trackerentory_user')
    const u = raw ? JSON.parse(raw) as AppUser : null
    navigateAfterAuth(u)
  }

  // ── SIGN UP ──
  async function handleSignupSubmitForm() {
    if (!fullName || !signupUsername || !signupPassword || !signupEmail) {
      return setError('All fields are required.')
    }

    // Password strength
    const strength = validatePasswordStrength(signupPassword)
    if (!strength.valid) {
      return setError('Password does not meet the requirements.')
    }

    // Confirm password
    if (signupPassword !== signupConfirmPw) {
      return setError('Passwords do not match.')
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

    if (otpResult.emailSent) {
      setInfo('A 6-digit code has been sent to your email.')
      setSignupTestOtp(null)
    } else if (otpResult.code) {
      setSignupTestOtp(otpResult.code)
      setOtpCode(otpResult.code)
      setInfo(`Demo/Test Mode: Your verification code is ${otpResult.code} (auto-filled below).`)
    }
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
    navigateAfterAuth(u)
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

    if (otpResult.emailSent) {
      setInfo(`OTP sent to ${maskEmail(user.email)}.`)
      setForgotTestOtp(null)
    } else if (otpResult.code) {
      setForgotTestOtp(otpResult.code)
      setForgotOtp(otpResult.code)
      setInfo(`Demo/Test Mode: Your verification code is ${otpResult.code} (auto-filled below).`)
    }
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
    // Password strength
    const strength = validatePasswordStrength(newPassword)
    if (!strength.valid) {
      return setError('Password does not meet the requirements.')
    }
    // Confirm password
    if (newPassword !== newPasswordConfirm) {
      return setError('Passwords do not match.')
    }
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

  // Password strength for current form
  const signupPwChecks = signupPassword ? validatePasswordStrength(signupPassword).checks : []
  const newPwChecks = newPassword ? validatePasswordStrength(newPassword).checks : []

  // ── RENDER ──
  return (
    <div className="auth-layout">
      <div className="auth-card">
        <span className="brand">Track<span>Erentory</span></span>

        {mode === 'signin' && signinStep === 'credentials' && (
          <p className="lede">Sign in to manage cubes, reservations, and pickups.</p>
        )}
        {mode === 'signin' && signinStep === 'otp' && (
          <p className="lede">Enter the verification code sent to your email.</p>
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
        {mode === 'signin' && signinStep === 'credentials' && (
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
              <button className="btn" type="button" onClick={handleSignInCredentials} disabled={loading}>
                {loading ? 'Please wait…' : 'Sign in'}
              </button>
              <button className="btn-ghost" type="button" onClick={() => switchMode('signup')} disabled={loading}>
                Need an account?
              </button>
            </div>
          </>
        )}

        {/* SIGN IN — OTP Step (2FA) */}
        {mode === 'signin' && signinStep === 'otp' && (
          <>
            <div className="auth-steps">
              <div className="auth-step done" />
              <div className="auth-step active" />
            </div>
            <div className="field">
              <label>Enter the 6-digit code sent to {maskEmail(signinEmail)}</label>
              <input
                className="otp-input"
                maxLength={6}
                value={signinOtp}
                onChange={(e) => setSigninOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
                placeholder="000000"
              />
              {signinTestOtp && (
                <div style={{ marginTop: '0.5rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.4rem 0.75rem', background: 'rgba(99, 102, 241, 0.1)', border: '1px solid rgba(99, 102, 241, 0.25)', borderRadius: '6px', fontSize: '0.85rem' }}>
                  <span>Test Code: <strong style={{ letterSpacing: '1px' }}>{signinTestOtp}</strong></span>
                  <button
                    type="button"
                    className="btn-ghost"
                    style={{ padding: '0.2rem 0.6rem', fontSize: '0.75rem', height: 'auto' }}
                    onClick={() => setSigninOtp(signinTestOtp)}
                  >
                    Auto-Fill
                  </button>
                </div>
              )}
            </div>
            <div className="row" style={{ marginTop: '0.35rem' }}>
              <button className="btn" type="button" onClick={handleSignInVerifyOtp} disabled={loading}>
                {loading ? 'Verifying…' : 'Verify & Sign in'}
              </button>
              <button className="btn-ghost" type="button" onClick={() => { setSigninStep('credentials'); setError(''); setInfo('') }} disabled={loading}>
                Back
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
                {signupPassword && <PasswordStrengthIndicator checks={signupPwChecks} />}
                <PasswordInput
                  label="Confirm password"
                  value={signupConfirmPw}
                  onChange={(e) => setSignupConfirmPw(e.target.value)}
                  autoComplete="new-password"
                />
                {signupConfirmPw && signupPassword !== signupConfirmPw && (
                  <p style={{ color: '#dc2626', fontSize: '0.82rem', margin: '-0.3rem 0 0.5rem' }}>Passwords do not match.</p>
                )}
                {signupConfirmPw && signupPassword === signupConfirmPw && signupConfirmPw.length > 0 && (
                  <p style={{ color: '#16a34a', fontSize: '0.82rem', margin: '-0.3rem 0 0.5rem' }}>✓ Passwords match.</p>
                )}
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
                  {signupTestOtp && (
                    <div style={{ marginTop: '0.5rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.4rem 0.75rem', background: 'rgba(99, 102, 241, 0.1)', border: '1px solid rgba(99, 102, 241, 0.25)', borderRadius: '6px', fontSize: '0.85rem' }}>
                      <span>Test Code: <strong style={{ letterSpacing: '1px' }}>{signupTestOtp}</strong></span>
                      <button
                        type="button"
                        className="btn-ghost"
                        style={{ padding: '0.2rem 0.6rem', fontSize: '0.75rem', height: 'auto' }}
                        onClick={() => setOtpCode(signupTestOtp)}
                      >
                        Auto-Fill
                      </button>
                    </div>
                  )}
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
                  {forgotTestOtp && (
                    <div style={{ marginTop: '0.5rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.4rem 0.75rem', background: 'rgba(99, 102, 241, 0.1)', border: '1px solid rgba(99, 102, 241, 0.25)', borderRadius: '6px', fontSize: '0.85rem' }}>
                      <span>Test Code: <strong style={{ letterSpacing: '1px' }}>{forgotTestOtp}</strong></span>
                      <button
                        type="button"
                        className="btn-ghost"
                        style={{ padding: '0.2rem 0.6rem', fontSize: '0.75rem', height: 'auto' }}
                        onClick={() => setForgotOtp(forgotTestOtp)}
                      >
                        Auto-Fill
                      </button>
                    </div>
                  )}
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
                {newPassword && <PasswordStrengthIndicator checks={newPwChecks} />}
                <PasswordInput
                  label="Confirm new password"
                  value={newPasswordConfirm}
                  onChange={(e) => setNewPasswordConfirm(e.target.value)}
                  autoComplete="new-password"
                />
                {newPasswordConfirm && newPassword !== newPasswordConfirm && (
                  <p style={{ color: '#dc2626', fontSize: '0.82rem', margin: '-0.3rem 0 0.5rem' }}>Passwords do not match.</p>
                )}
                {newPasswordConfirm && newPassword === newPasswordConfirm && newPasswordConfirm.length > 0 && (
                  <p style={{ color: '#16a34a', fontSize: '0.82rem', margin: '-0.3rem 0 0.5rem' }}>✓ Passwords match.</p>
                )}
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
