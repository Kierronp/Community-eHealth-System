import { createClient } from 'npm:@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info, x-supabase-api-version',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

function response(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

function validString(value: unknown, min: number, max: number) {
  return typeof value === 'string' && value.trim().length >= min && value.trim().length <= max
}

function validUuid(value: unknown): value is string {
  return typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
}

async function rateLimit(supabase: ReturnType<typeof createClient>, secret: string, key: string, maximum: number, windowSeconds: number) {
  const encoder = new TextEncoder()
  const cryptoKey = await crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  const signature = await crypto.subtle.sign('HMAC', cryptoKey, encoder.encode(key))
  const rateKey = Array.from(new Uint8Array(signature), (byte) => byte.toString(16).padStart(2, '0')).join('')
  const { data, error } = await supabase.rpc('consume_public_rate_limit', {
    p_rate_key: rateKey,
    p_max_requests: maximum,
    p_window_seconds: windowSeconds,
  })
  if (error) throw new Error('Could not verify request rate limits.')
  return data === true
}

Deno.serve(async (request: Request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (request.method !== 'POST') return response(405, { error: 'Method not allowed.' })

  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (!supabaseUrl || !serviceRoleKey) return response(500, { error: 'The public client service is not configured.' })

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  try {
    const ipAddress = request.headers.get('cf-connecting-ip')
      ?? request.headers.get('x-real-ip')
      ?? request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
    if (!ipAddress) return response(400, { error: 'Could not verify your connection. Please try again.' })
    if (!await rateLimit(supabase, serviceRoleKey, `ip:${ipAddress}`, 20, 900)) {
      return response(429, { error: 'Too many requests from this connection. Please try again later.' })
    }

    let body: Record<string, unknown>
    try {
      const rawBody = await request.text()
      if (rawBody.length > 16_384) return response(413, { error: 'Request is too large.' })
      body = JSON.parse(rawBody)
    } catch {
      return response(400, { error: 'A valid JSON request is required.' })
    }
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      return response(400, { error: 'A valid client portal action is required.' })
    }
    const action = body.action
    if (!validUuid(body.organization_id)) return response(400, { error: 'Select a valid clinic.' })

    if (action === 'register') {
      if (!validString(body.full_name, 2, 120)
        || !validString(body.email, 3, 254)
        || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(body.email))
        || typeof body.pin !== 'string' || !/^[0-9]{4}$/.test(body.pin)
        || !validString(body.phone, 5, 40)
        || !validString(body.address, 2, 240)
        || typeof body.birth_date !== 'string'
        || !/^\d{4}-\d{2}-\d{2}$/.test(body.birth_date)
        || Number.isNaN(Date.parse(`${body.birth_date}T00:00:00Z`))
        || new Date(`${body.birth_date}T00:00:00Z`) > new Date()) {
        return response(400, { error: 'Enter a valid name, email, four-digit PIN, phone, address, and birth date.' })
      }
      if (!await rateLimit(supabase, serviceRoleKey, `registration:${ipAddress}`, 4, 3600)) {
        return response(429, { error: 'Too many registration attempts. Please try again later.' })
      }
      const { data: memberNumber, error } = await supabase.rpc('register_public_client_profile', {
        p_organization_id: body.organization_id,
        p_full_name: String(body.full_name).trim(),
        p_email: String(body.email).trim().toLowerCase(),
        p_pin: body.pin,
        p_phone: String(body.phone).trim(),
        p_address: String(body.address).trim(),
        p_birth_date: body.birth_date,
        p_email_notifications: body.email_notifications === true,
      })
      if (error) {
        if (error.code === '23505' || error.code === '22023') return response(400, { error: error.message })
        console.error('Public client registration failed:', error)
        return response(500, { error: 'Could not register your account. Please contact the clinic if this continues.' })
      }
      if (typeof memberNumber !== 'string' || !memberNumber) {
        console.error('Public client registration returned no application confirmation.')
        return response(500, { error: 'Your application was saved, but we could not confirm it. Please contact the clinic.' })
      }
      return response(200, { registered: true, pending: true })
    }

    if (action !== 'join') {
      return response(400, { error: 'Choose a valid client portal action.' })
    }
    if (!validString(body.full_name, 2, 120) || typeof body.pin !== 'string' || !/^[0-9]{4}$/.test(body.pin)) {
      return response(400, { error: 'Enter your registered full name and four-digit PIN.' })
    }

    const normalizedName = String(body.full_name).trim().toLowerCase()
    if (!await rateLimit(supabase, serviceRoleKey, `identity:${body.organization_id}:${normalizedName}`, 6, 900)) {
      return response(429, { error: 'Too many attempts for these account details. Please try again later.' })
    }

    if (!validUuid(body.campaign_id)) {
      return response(400, { error: 'Choose a valid service.' })
    }
    if (!await rateLimit(supabase, serviceRoleKey, `service-join:${ipAddress}`, 8, 900)) {
      return response(429, { error: 'Too many service joins from this connection. Please try again later.' })
    }
    const { data, error } = await supabase.rpc('join_public_service', {
      p_organization_id: body.organization_id,
      p_campaign_id: body.campaign_id,
      p_full_name: String(body.full_name).trim(),
      p_pin: body.pin,
    })
    if (error || !data?.[0]?.join_id || data[0].assigned_queue_number == null) {
      if (error?.code === '22023') return response(400, { error: error.message })
      console.error('Public service join failed:', error)
      return response(500, { error: 'Could not join this service.' })
    }
    return response(200, {
      join_id: data[0].join_id,
      already_joined: data[0].already_joined,
      queue_number: data[0].assigned_queue_number,
    })
  } catch (error) {
    console.error('Public client portal request failed:', error)
    return response(500, { error: error instanceof Error ? error.message : 'The request could not be completed.' })
  }
})
