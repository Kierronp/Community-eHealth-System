import { createClient } from 'npm:@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info, x-supabase-api-version',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const staffRoles = ['admin', 'clinician', 'health_worker', 'inventory_manager', 'viewer']

function response(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

function validUuid(value: unknown): value is string {
  return typeof value === 'string'
    && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
}

function validEmail(value: unknown): value is string {
  return typeof value === 'string'
    && value.length <= 254
    && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim())
}

function validRole(value: unknown): value is string {
  return typeof value === 'string' && staffRoles.includes(value)
}

Deno.serve(async (request: Request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (request.method !== 'POST') return response(405, { error: 'Method not allowed.' })

  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  const authorization = request.headers.get('authorization')
  const token = authorization?.match(/^Bearer\s+(.+)$/i)?.[1]
  if (!supabaseUrl || !anonKey || !serviceRoleKey) {
    return response(500, { error: 'Staff account management is not configured.' })
  }
  if (!token) return response(401, { error: 'Sign in to manage staff accounts.' })

  const callerClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { autoRefreshToken: false, persistSession: false },
  })
  const adminClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  try {
    const { data: userResult, error: userError } = await callerClient.auth.getUser(token)
    if (userError || !userResult.user) return response(401, { error: 'Your staff session is invalid. Sign in again.' })
    const caller = userResult.user

    let body: Record<string, unknown>
    try {
      const rawBody = await request.text()
      if (rawBody.length > 16_384) return response(413, { error: 'Request is too large.' })
      body = JSON.parse(rawBody)
    } catch {
      return response(400, { error: 'A valid JSON request is required.' })
    }
    if (!body || typeof body !== 'object' || Array.isArray(body)
      || !validUuid(body.organization_id)
      || typeof body.action !== 'string') {
      return response(400, { error: 'A valid staff account action and organization are required.' })
    }
    const organizationId = body.organization_id
    const { data: membership, error: membershipError } = await adminClient
      .from('organization_memberships')
      .select('role, status')
      .eq('organization_id', organizationId)
      .eq('user_id', caller.id)
      .maybeSingle()
    if (membershipError) throw membershipError
    if (membership?.role !== 'owner' || membership.status !== 'active') {
      return response(403, { error: 'Only an active organization owner can manage staff accounts.' })
    }

    if (body.action === 'list') {
      const { data: memberships, error: listError } = await adminClient
        .from('organization_memberships')
        .select('user_id, role, status, created_at')
        .eq('organization_id', organizationId)
        .order('created_at')
      if (listError) throw listError
      const staff = await Promise.all((memberships ?? []).map(async (item) => {
        const { data: account, error: accountError } = await adminClient.auth.admin.getUserById(item.user_id)
        if (accountError) throw accountError
        return {
          ...item,
          email: account.user.email ?? '',
          full_name: String(account.user.user_metadata?.full_name ?? ''),
        }
      }))
      return response(200, { staff })
    }

    if (body.action === 'create') {
      if (!validEmail(body.email) || typeof body.full_name !== 'string'
        || body.full_name.trim().length < 2 || body.full_name.trim().length > 120
        || !validRole(body.role) || !['invite', 'password'].includes(String(body.method))) {
        return response(400, { error: 'Enter a valid name, email, staff role, and account setup method.' })
      }
      const email = body.email.trim().toLowerCase()
      const fullName = body.full_name.trim()
      let userId: string | undefined
      let createdAccount = false
      let creationError: { message: string } | null = null
      if (body.method === 'invite') {
        const { data, error } = await adminClient.auth.admin.inviteUserByEmail(email, {
          data: { full_name: fullName },
        })
        userId = data.user?.id
        createdAccount = Boolean(userId)
        creationError = error
      } else {
        if (typeof body.password !== 'string' || body.password.length < 10 || body.password.length > 128) {
          return response(400, { error: 'Set a temporary password between 10 and 128 characters.' })
        }
        const { data, error } = await adminClient.auth.admin.createUser({
          email,
          password: body.password,
          email_confirm: true,
          user_metadata: { full_name: fullName },
        })
        userId = data.user?.id
        createdAccount = Boolean(userId)
        creationError = error
      }
      if (creationError || !userId) {
        return response(400, { error: creationError?.message ?? 'Supabase did not create the staff account.' })
      }
      const { error: addMembershipError } = await adminClient
        .from('organization_memberships')
        .insert({ organization_id: organizationId, user_id: userId, role: body.role, status: 'active' })
      if (addMembershipError) {
        if (createdAccount) {
          const { error: rollbackError } = await adminClient.auth.admin.deleteUser(userId)
          if (rollbackError) console.error('Could not clean up staff account after membership creation failed:', rollbackError)
        }
        throw addMembershipError
      }
      return response(200, { created: true, user_id: userId, method: body.method })
    }

    if (body.action === 'update') {
      if (!validUuid(body.user_id) || !validEmail(body.email)
        || typeof body.full_name !== 'string' || body.full_name.trim().length < 2
        || body.full_name.trim().length > 120 || !validRole(body.role)
        || !['active', 'suspended'].includes(String(body.status))
        || (body.password !== undefined && body.password !== ''
          && (typeof body.password !== 'string' || body.password.length < 10 || body.password.length > 128))) {
        return response(400, { error: 'Enter valid account details, a supported staff role, and status.' })
      }
      if (body.user_id === caller.id && (body.role !== 'owner' || body.status !== 'active')) {
        return response(400, { error: 'You cannot change your own owner role or suspend your own account.' })
      }
      const { data: targetMembership, error: targetError } = await adminClient
        .from('organization_memberships')
        .select('role')
        .eq('organization_id', organizationId)
        .eq('user_id', body.user_id)
        .maybeSingle()
      if (targetError) throw targetError
      if (!targetMembership || targetMembership.role === 'owner') {
        return response(400, { error: 'Organization owner accounts cannot be edited here.' })
      }
      const authUpdates: {
        email: string
        email_confirm: boolean
        user_metadata: { full_name: string }
        password?: string
      } = {
        email: body.email.trim().toLowerCase(),
        email_confirm: true,
        user_metadata: { full_name: body.full_name.trim() },
      }
      if (typeof body.password === 'string' && body.password.length > 0) authUpdates.password = body.password
      const { error: authUpdateError } = await adminClient.auth.admin.updateUserById(body.user_id, authUpdates)
      if (authUpdateError) throw authUpdateError
      const { error: roleUpdateError } = await adminClient
        .from('organization_memberships')
        .update({ role: body.role, status: body.status })
        .eq('organization_id', organizationId)
        .eq('user_id', body.user_id)
      if (roleUpdateError) throw roleUpdateError
      return response(200, { updated: true })
    }

    if (body.action === 'delete') {
      if (!validUuid(body.user_id) || body.user_id === caller.id) {
        return response(400, { error: 'Choose another staff account to delete.' })
      }
      const { data: targetMembership, error: targetError } = await adminClient
        .from('organization_memberships')
        .select('role')
        .eq('organization_id', organizationId)
        .eq('user_id', body.user_id)
        .maybeSingle()
      if (targetError) throw targetError
      if (!targetMembership || targetMembership.role === 'owner') {
        return response(400, { error: 'Organization owner accounts cannot be deleted here.' })
      }
      const { data: ownerMemberships, error: ownerLookupError } = await adminClient
        .from('organization_memberships')
        .select('organization_id')
        .eq('user_id', body.user_id)
        .eq('role', 'owner')
      if (ownerLookupError) throw ownerLookupError
      if (ownerMemberships?.length) {
        return response(409, { error: 'This account is an owner of another organization. Remove its owner role before permanently deleting the login.' })
      }
      const { data: linkedClient, error: clientLookupError } = await adminClient
        .from('client_profiles')
        .select('id')
        .eq('user_id', body.user_id)
        .maybeSingle()
      if (clientLookupError) throw clientLookupError
      if (linkedClient) {
        return response(409, { error: 'This login is linked to a client profile. Remove or transfer that client profile before deleting the login.' })
      }
      const { error: deleteError } = await adminClient.auth.admin.deleteUser(body.user_id)
      if (deleteError) throw deleteError
      return response(200, { deleted: true })
    }

    return response(400, { error: 'Choose a valid staff account action.' })
  } catch (error) {
    console.error('Staff account management failed:', error)
    return response(500, { error: error instanceof Error ? error.message : 'Could not manage staff accounts.' })
  }
})
