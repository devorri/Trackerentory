import { supabase } from './supabase'

/** Generate a random 6-digit OTP code */
export function generateOtp(): string {
  return String(Math.floor(100000 + Math.random() * 900000))
}

/** Send OTP via Supabase Edge Function or direct Resend API fallback */
export async function sendOtpEmail(email: string, code: string, purpose: string): Promise<{ error: string | null }> {
  // 1. Try Supabase Edge Function first
  const { data, error } = await supabase.functions.invoke('send-otp', {
    body: { email, code, purpose },
  })
  if (!error && !data?.error) return { error: null }

  // 2. Direct fallback via Resend API (works out-of-the-box without CLI deployment)
  try {
    const subjectMap: Record<string, string> = {
      create_account: 'Verify your email - TrackErentory',
      forgot_password: 'Password Reset OTP - TrackErentory',
      verify: 'Verification Code - TrackErentory',
    }
    const subject = subjectMap[purpose] || 'Verification Code - TrackErentory'

    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${import.meta.env.VITE_RESEND_API_KEY || ''}`,
      },
      body: JSON.stringify({
        from: 'TrackErentory <onboarding@resend.dev>',
        to: [email],
        subject: subject,
        html: `
          <div style="font-family: Arial, sans-serif; padding: 20px; color: #333;">
            <h2 style="color: #6366f1;">TrackErentory Verification Code</h2>
            <p>Your one-time passcode (OTP) for <strong>${purpose.replace('_', ' ')}</strong> is:</p>
            <div style="font-size: 32px; font-weight: bold; letter-spacing: 4px; color: #4f46e5; margin: 20px 0;">
              ${code}
            </div>
            <p>This code will expire in <strong>10 minutes</strong>.</p>
          </div>
        `,
      }),
    })

    const result = await res.json()
    if (res.ok) return { error: null }
    return { error: result.message || result.error || 'Failed to send OTP email' }
  } catch (err: any) {
    return { error: err.message || 'Failed to connect to Resend API' }
  }
}

/** Create an OTP record in the database and send the email */
export async function requestOtp(
  email: string,
  purpose: 'verify' | 'forgot_password' | 'create_account',
  userId?: number | null,
): Promise<{ error: string | null }> {
  const code = generateOtp()
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString() // 10 min

  // Mark any previous unused OTPs for this email+purpose as used
  await supabase
    .from('otp_codes')
    .update({ used: true })
    .eq('email', email)
    .eq('purpose', purpose)
    .eq('used', false)

  // Insert new OTP
  const { error: insertErr } = await supabase.from('otp_codes').insert([{
    user_id: userId ?? null,
    email,
    code,
    purpose,
    expires_at: expiresAt,
    used: false,
  }])
  if (insertErr) return { error: insertErr.message }

  // Send email
  const sendResult = await sendOtpEmail(email, code, purpose)
  return sendResult
}

/** Verify an OTP code */
export async function verifyOtp(
  email: string,
  code: string,
  purpose: 'verify' | 'forgot_password' | 'create_account',
): Promise<{ valid: boolean; error: string | null }> {
  const now = new Date().toISOString()
  const { data, error } = await supabase
    .from('otp_codes')
    .select('*')
    .eq('email', email)
    .eq('code', code)
    .eq('purpose', purpose)
    .eq('used', false)
    .gte('expires_at', now)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (error) return { valid: false, error: error.message }
  if (!data) return { valid: false, error: 'Invalid or expired OTP code.' }

  // Mark as used
  await supabase.from('otp_codes').update({ used: true }).eq('id', data.id)

  return { valid: true, error: null }
}
