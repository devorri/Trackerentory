import { supabase } from './supabase'
import emailjs from '@emailjs/browser'

/** Generate a random 6-digit OTP code */
export function generateOtp(): string {
  return String(Math.floor(100000 + Math.random() * 900000))
}

/** Send OTP via EmailJS (to any recipient), Supabase Edge Function, or Resend API */
export async function sendOtpEmail(email: string, code: string, purpose: string): Promise<{ error: string | null }> {
  // 1. Try EmailJS first (sends to ANY email address directly from browser without domain verification)
  const emailjsServiceId = import.meta.env.VITE_EMAILJS_SERVICE_ID
  const emailjsTemplateId = import.meta.env.VITE_EMAILJS_TEMPLATE_ID
  const emailjsPublicKey = import.meta.env.VITE_EMAILJS_PUBLIC_KEY

  if (emailjsServiceId && emailjsTemplateId && emailjsPublicKey) {
    try {
      await emailjs.send(
        emailjsServiceId,
        emailjsTemplateId,
        {
          to_email: email,
          email: email,
          to: email,
          recipient: email,
          user_email: email,
          to_name: email.split('@')[0],
          otp_code: code,
          code: code,
          passcode: code,
          message: code,
          purpose: purpose.replace('_', ' '),
          from_name: 'TrackErentory',
        },
        emailjsPublicKey,
      )
      return { error: null }
    } catch (err: any) {
      console.warn('EmailJS delivery failed, falling back:', err)
    }
  }

  // 2. Try Supabase Edge Function
  try {
    const { data, error } = await supabase.functions.invoke('send-otp', {
      body: { email, code, purpose },
    })
    if (!error && !data?.error) return { error: null }
  } catch (err: any) {
    // Edge function failed or not deployed
  }

  // 3. Direct fallback via Resend API
  try {
    const resendKey = import.meta.env.VITE_RESEND_API_KEY
    if (!resendKey) return { error: 'No email service configured' }

    const subjectMap: Record<string, string> = {
      create_account: 'Verify your email - TrackErentory',
      forgot_password: 'Password Reset OTP - TrackErentory',
      verify: 'Verification Code - TrackErentory',
      login: 'Sign In Verification Code (2FA) - TrackErentory',
    }
    const subject = subjectMap[purpose] || 'Verification Code - TrackErentory'

    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${resendKey}`,
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

export type RequestOtpResult = {
  error: string | null
  code?: string
  emailSent?: boolean
}

/** Create an OTP record in the database and send the email */
export async function requestOtp(
  email: string,
  purpose: 'verify' | 'forgot_password' | 'create_account' | 'login',
  userId?: number | null,
): Promise<RequestOtpResult> {
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

  // Send email (attempt edge function or resend, but don't block user if delivery service is unavailable)
  const sendResult = await sendOtpEmail(email, code, purpose)
  if (sendResult.error) {
    console.warn('[OTP Notice] Email dispatch not completed (' + sendResult.error + '). Providing on-screen test code.')
    return { error: null, code, emailSent: false }
  }

  return { error: null, code, emailSent: true }
}

/** Verify an OTP code */
export async function verifyOtp(
  email: string,
  code: string,
  purpose: 'verify' | 'forgot_password' | 'create_account' | 'login',
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
