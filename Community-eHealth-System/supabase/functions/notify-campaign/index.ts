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

Deno.serve(async (request: Request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (request.method !== 'POST') return response(405, { error: 'Method not allowed.' })

  const authorization = request.headers.get('Authorization')
  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const supabaseKey = Deno.env.get('SUPABASE_ANON_KEY')
  const resendApiKey = Deno.env.get('RESEND_API_KEY')
  const sender = Deno.env.get('RESEND_FROM')
  if (!authorization || !supabaseUrl || !supabaseKey) {
    return response(500, { error: 'The authenticated Supabase function is not configured.' })
  }
  if (!resendApiKey || !sender) {
    return response(500, { error: 'Configure RESEND_API_KEY and RESEND_FROM for campaign email.' })
  }

  const supabase = createClient(supabaseUrl, supabaseKey, {
    global: { headers: { Authorization: authorization } },
    auth: { autoRefreshToken: false, persistSession: false },
  })

  try {
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) return response(401, { error: 'Sign in with a staff account to send announcements.' })

    const body = await request.json()
    if (typeof body.campaign_id !== 'string') return response(400, { error: 'A campaign ID is required.' })

    const { data: campaign, error: campaignError } = await supabase
      .from('service_campaigns')
      .select('id, organization_id, title, description, starts_at, status, announced_at, facility:facilities(name)')
      .eq('id', body.campaign_id)
      .single()
    if (campaignError || !campaign) return response(404, { error: 'Campaign not found.' })
    if (campaign.status !== 'open') return response(400, { error: 'Only open campaigns can be announced.' })
    if (campaign.announced_at) return response(409, { error: 'This campaign has already been announced.' })

    const { data: membership, error: membershipError } = await supabase
      .from('organization_memberships')
      .select('role')
      .eq('organization_id', campaign.organization_id)
      .eq('user_id', user.id)
      .eq('status', 'active')
      .maybeSingle()
    if (membershipError || !membership || !['owner', 'admin'].includes(membership.role)) {
      return response(403, { error: 'Only an organization owner or admin can send campaign announcements.' })
    }

    const recipients = []
    for (let offset = 0; ; offset += 500) {
      const { data, error } = await supabase
        .from('client_profiles')
        .select('email, full_name')
        .eq('organization_id', campaign.organization_id)
        .eq('status', 'active')
        .eq('email_notifications', true)
        .not('email', 'is', null)
        .range(offset, offset + 499)
      if (error) return response(500, { error: 'Could not load opted-in client email addresses.' })
      recipients.push(...(data ?? []))
      if (!data || data.length < 500) break
    }

    const facility = Array.isArray(campaign.facility) ? campaign.facility[0] : campaign.facility
    const serviceDate = new Date(campaign.starts_at).toLocaleString('en-PH', {
      dateStyle: 'medium',
      timeStyle: 'short',
    })

    for (let offset = 0; offset < recipients.length; offset += 10) {
      const batch = recipients.slice(offset, offset + 10)
      const results = await Promise.all(batch.map(async (recipient) => {
        const emailResponse = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${resendApiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            from: sender,
            to: [recipient.email],
            subject: 'A community health service is available',
            text: [
              `Hello ${recipient.full_name},`,
              '',
              campaign.title,
              campaign.description,
              `When: ${serviceDate}`,
              facility?.name ? `Where: ${facility.name}` : '',
              '',
              'Please bring your registered details and contact the barangay clinic for assistance.',
            ].filter(Boolean).join('\n'),
          }),
        })
        return emailResponse.ok
      }))
      if (results.some((sent) => !sent)) {
        return response(502, { error: 'Some emails could not be sent. Check Resend delivery logs before retrying.' })
      }
    }

    const { error: updateError } = await supabase
      .from('service_campaigns')
      .update({ announced_at: new Date().toISOString() })
      .eq('id', campaign.id)
    if (updateError) return response(500, { error: 'Emails were sent, but the campaign announcement could not be recorded.' })

    return response(200, { sent: recipients.length })
  } catch (error) {
    console.error('Campaign notification failed:', error)
    return response(500, { error: 'Campaign notification failed.' })
  }
})
