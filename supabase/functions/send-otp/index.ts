// Supabase Edge Function: send-otp
// Deploy using: supabase functions deploy send-otp
// Required env var in Supabase: RESEND_API_KEY

declare const Deno: {
  env: {
    get(key: string): string | undefined
  }
  serve(handler: (req: Request) => Promise<Response>): void
}

const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY')

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { email, code, purpose } = await req.json()

    if (!email || !code) {
      return new Response(JSON.stringify({ error: 'Missing email or code' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    if (!RESEND_API_KEY) {
      return new Response(JSON.stringify({ error: 'RESEND_API_KEY is not configured on Supabase' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

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
        Authorization: `Bearer ${RESEND_API_KEY}`,
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
            <p style="color: #888; font-size: 12px; margin-top: 30px;">If you did not request this code, please ignore this email.</p>
          </div>
        `,
      }),
    })

    const data = await res.json()
    return new Response(JSON.stringify(data), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
