import { useCallback, useEffect, useState } from 'react'
import { supabase, supabaseConfigurationError, supabaseConfigured } from './lib/supabase.js'

function PublicClientDashboard({ onStaffLogin }) {
  const [section, setSection] = useState('dashboard')
  const [campaigns, setCampaigns] = useState([])
  const [campaignLoading, setCampaignLoading] = useState(supabaseConfigured)
  const [campaignError, setCampaignError] = useState('')
  const [organizations, setOrganizations] = useState([])
  const [organizationError, setOrganizationError] = useState('')
  const [selectedCampaign, setSelectedCampaign] = useState(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  const loadCampaigns = useCallback(async () => {
    if (!supabase) return
    setCampaignLoading(true)
    setCampaignError('')
    try {
      const { data, error } = await supabase.from('service_campaigns')
        .select('id, organization_id, title, service_type, description, starts_at, ends_at')
        .eq('status', 'open')
        .or(`ends_at.is.null,ends_at.gte.${new Date().toISOString()}`)
        .order('starts_at')
      if (error) throw error
      setCampaigns(data ?? [])
    } catch (loadError) {
      setCampaignError(`Could not load service announcements: ${loadError instanceof Error ? loadError.message : 'Unknown database error.'}`)
    } finally {
      setCampaignLoading(false)
    }
  }, [])

  useEffect(() => {
    if (!supabase) return undefined
    let cancelled = false
    Promise.resolve().then(() => loadCampaigns())
    supabase.rpc('list_public_organizations').then(({ data, error }) => {
      if (cancelled) return
      if (error) setOrganizationError(`Could not load clinic locations: ${error.message}`)
      else setOrganizations(data ?? [])
    }).catch((loadError) => {
      if (cancelled) return
      setOrganizationError(`Could not load clinic locations: ${loadError instanceof Error ? loadError.message : 'Unknown database error.'}`)
    })
    return () => { cancelled = true }
  }, [loadCampaigns])

  function navigateTo(nextSection) {
    if (nextSection === 'services') loadCampaigns()
    setSection(nextSection)
  }

  async function submitPublicAction(event, action) {
    event.preventDefault()
    if (!supabase) return
    const form = event.currentTarget
    const values = new FormData(form)
    const organizationId = String(values.get('organization_id') ?? '')
    const fullName = String(values.get('full_name') ?? '').trim()
    const pin = String(values.get('pin') ?? '')
    setBusy(true)
    setError('')
    setNotice('')
    try {
      const body = action === 'register'
        ? {
          action,
          organization_id: organizationId,
          full_name: fullName,
          email: String(values.get('email') ?? '').trim(),
          pin,
          phone: String(values.get('phone') ?? '').trim(),
          address: String(values.get('address') ?? '').trim(),
          birth_date: String(values.get('birth_date') ?? ''),
          email_notifications: values.get('email_notifications') === 'on',
        }
        : {
          action,
          organization_id: selectedCampaign.organization_id,
          campaign_id: selectedCampaign.id,
          full_name: fullName,
          pin,
        }
      const { data, error: invokeError } = await supabase.functions.invoke('public-client-portal', { body })
      if (invokeError) {
        if (invokeError.context instanceof Response) {
          const responseData = await invokeError.context.json().catch(() => null)
          if (typeof responseData?.error === 'string') throw new Error(responseData.error)
        }
        if (invokeError.name === 'FunctionsFetchError') {
          throw new Error('The client registration service is unavailable. Ask the Supabase project admin to deploy the public-client-portal Edge Function, then try again.')
        }
        throw invokeError
      }
      if (data?.error) throw new Error(data.error)
      if (action === 'register') {
        form.reset()
        setNotice('Your client account is registered. Use this exact full name and four-digit PIN when joining a service.')
        setSection('dashboard')
      } else {
        setNotice(data?.already_joined
          ? `You are already in this service queue as number ${data?.queue_number}.`
          : `You joined the service. Your queue number is ${data?.queue_number}.`)
        navigateTo('services')
        setSelectedCampaign(null)
      }
    } catch (actionError) {
      const task = action === 'register' ? 'register your account' : 'join the service'
      setError(`Could not ${task}: ${actionError instanceof Error ? actionError.message : 'Unknown service error.'}`)
    } finally {
      setBusy(false)
    }
  }

  const navigation = [
    { id: 'dashboard', label: 'Dashboard' },
    { id: 'services', label: 'Services' },
    { id: 'register', label: 'Register account' },
  ]
  const title = navigation.find((item) => item.id === section)?.label ?? 'Join a service'

  return <main className="portal-page">
    <header className="portal-header">
      <a className="portal-brand" href="#" onClick={(event) => { event.preventDefault(); navigateTo('dashboard') }}>
        <span className="brand-mark">+</span><span>CareCircle <small>COMMUNITY HEALTH</small></span>
      </a>
      <button className="portal-text-button" type="button" onClick={() => onStaffLogin ? setSection('staff') : undefined}>Admin login</button>
    </header>
    {!supabaseConfigured && <section className="portal-setup-warning" role="alert">Service requests and announcements are unavailable: {supabaseConfigurationError}</section>}
    <div className="client-dashboard public-client-dashboard">
      <aside className="client-sidebar">
        <div className="client-sidebar-label">CLIENT MENU</div>
        <nav aria-label="Client navigation">
          {navigation.map((item) => <button key={item.id} type="button" className={`client-nav-item${section === item.id ? ' client-nav-active' : ''}`} onClick={() => { navigateTo(item.id); setError(''); setNotice('') }}>{item.label}</button>)}
        </nav>
        <div className="client-sidebar-help"><strong>Welcome</strong><p>Browse available services without signing in. Register once, then enter your registered name and PIN to join a service.</p></div>
      </aside>
      <div className="client-dashboard-main">
        {section === 'staff' ? <section className="portal-auth-card">
          <button className="portal-back-link" type="button" onClick={() => setSection('dashboard')}>← Back to client dashboard</button>
          <div className="eyebrow">STAFF WORKSPACE</div><h1>Staff sign in</h1>
          <p className="auth-description">Staff accounts are created by an administrator. Use your organization email and password.</p>
          <StaffLoginForm onStaffLogin={onStaffLogin} />
        </section> : <>
          <section className="portal-welcome client-dashboard-welcome">
            <div className="eyebrow">PUBLIC CLIENT DASHBOARD</div>
            <h1>{section === 'dashboard' ? 'Health services, closer to home.' : title}</h1>
            <p>{section === 'dashboard' ? 'Find local checkups and medicine services. Browse freely, register your client record, and use your registered details when joining a service.' : 'Browse available community health services and join the ones you need.'}</p>
          </section>
          {error && <p className="auth-error" role="alert">{error}</p>}
          {organizationError && <p className="auth-error" role="alert">{organizationError}</p>}
          {notice && <p className="portal-success" role="status">{notice}</p>}
          {section === 'dashboard' && <>
            <section className="client-stat-grid" aria-label="Public dashboard">
              <article className="client-stat-card"><span>Open services</span><strong>{campaignLoading ? '—' : campaigns.length}</strong><button type="button" onClick={() => navigateTo('services')}>Browse services</button></article>
              <article className="client-stat-card"><span>Client record</span><strong>Optional</strong><button type="button" onClick={() => setSection('register')}>Register account</button></article>
            </section>
            <section className="portal-section client-dashboard-section">
              <div className="portal-section-heading"><div><div className="eyebrow">COMMUNITY HEALTH</div><h2>Upcoming services</h2></div><button className="portal-text-button" type="button" onClick={() => navigateTo('services')}>View all</button></div>
              <PublicCampaignList campaigns={campaigns.slice(0, 3)} organizations={organizations} loading={campaignLoading} error={campaignError} onJoin={(campaign) => { setSelectedCampaign(campaign); setSection('join') }} />
            </section>
          </>}
          {section === 'services' && <section className="portal-section client-dashboard-section">
            <div className="portal-section-heading"><div><div className="eyebrow">COMMUNITY HEALTH</div><h2>Available services</h2></div><button className="portal-text-button" type="button" onClick={loadCampaigns} disabled={campaignLoading}>{campaignLoading ? 'Refreshing…' : 'Refresh services'}</button></div>
            <PublicCampaignList campaigns={campaigns} organizations={organizations} loading={campaignLoading} error={campaignError} onJoin={(campaign) => { setSelectedCampaign(campaign); setSection('join') }} />
          </section>}
          {section === 'register' && <section className="portal-section client-dashboard-section">
            <p>Register your details once so the clinic can keep your client record. When you join a service later, enter the same registered full name and four-digit PIN to verify your account.</p>
            <form className="auth-form portal-form public-registration-form" onSubmit={(event) => submitPublicAction(event, 'register')}>
              <label>Clinic or organization<select name="organization_id" required defaultValue=""><option value="" disabled>Select your clinic</option>{organizations.map((organization) => <option key={organization.organization_id} value={organization.organization_id}>{organization.organization_name}</option>)}</select></label>
              <label>Full name<input name="full_name" required minLength="2" maxLength="120" autoComplete="name" /></label>
              <label>Email address<input name="email" type="email" required maxLength="254" autoComplete="email" /></label>
              <label>Choose a 4-digit clinic PIN<input name="pin" required inputMode="numeric" pattern="[0-9]{4}" maxLength="4" autoComplete="new-password" /></label>
              <small className="portal-muted">Use this same name and PIN to verify your identity when joining services.</small>
              <label>Phone number<input name="phone" required minLength="5" maxLength="40" autoComplete="tel" /></label>
              <label>Home address<textarea name="address" required minLength="2" maxLength="240" autoComplete="street-address" /></label>
              <label>Date of birth<input name="birth_date" type="date" required /></label>
              <label className="portal-checkbox"><input name="email_notifications" type="checkbox" /> Email me general community-service announcements (optional).</label>
              <button className="primary-button" type="submit" disabled={busy || !supabaseConfigured || !organizations.length}>{busy ? 'Registering…' : 'Register client account'}</button>
            </form>
          </section>}
          {section === 'join' && selectedCampaign && <section className="portal-section client-dashboard-section">
            <button className="portal-back-link" type="button" onClick={() => { setSelectedCampaign(null); navigateTo('services') }}>← Back to services</button>
            <h2>{selectedCampaign.title}</h2><p>{selectedCampaign.description || 'Community health service'}</p>
            <p>Enter your registered full name and four-digit PIN to verify your client record and join this service queue. You will receive a queue number in the order you join. If you do not have an account yet, register first using the sidebar.</p>
            <form className="auth-form portal-form public-registration-form" onSubmit={(event) => submitPublicAction(event, 'join')}>
              <label>Registered full name<input name="full_name" required autoComplete="name" /></label>
              <label>4-digit clinic PIN<input name="pin" required inputMode="numeric" pattern="[0-9]{4}" maxLength="4" autoComplete="off" /></label>
              <p className="portal-muted">Joining assigns your place in line automatically. Keep your queue number for when the clinic calls you.</p>
              <button className="primary-button" type="submit" disabled={busy}>{busy ? 'Joining…' : 'Join service'}</button>
            </form>
          </section>}
        </>}
      </div>
    </div>
    <footer className="portal-footer">CareCircle · Community health services</footer>
  </main>
}

function PublicCampaignList({ campaigns, organizations, loading, error, onJoin }) {
  if (loading) return <p className="portal-muted">Loading community services…</p>
  if (error) return <p className="auth-error" role="alert">{error}</p>
  if (!campaigns.length) return <p className="portal-muted">There are no open service announcements right now. Check back for upcoming clinic services.</p>
  return <div className="portal-campaign-grid">{campaigns.map((campaign) => {
    const organization = organizations.find((item) => item.organization_id === campaign.organization_id)
    return <article className="portal-campaign-card" key={campaign.id}>
      <span className="portal-tag">{campaign.service_type.replace('_', ' ')}</span>
      <h3>{campaign.title}</h3>
      <p>{campaign.description || 'Community health service available to the community.'}</p>
      <small>{organization?.organization_name ?? 'Community clinic'} · {new Date(campaign.starts_at).toLocaleString()}</small>
      <button className="secondary-button public-request-button" type="button" onClick={() => onJoin(campaign)}>Join service</button>
    </article>
  })}</div>
}

function StaffLoginForm({ onStaffLogin }) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  async function submit(event) {
    event.preventDefault()
    if (!onStaffLogin) return
    setBusy(true)
    setError('')
    try {
      await onStaffLogin(email.trim(), password)
    } catch (signInError) {
      setError(`Staff sign-in failed: ${signInError instanceof Error ? signInError.message : 'Unknown authentication error.'}`)
    } finally {
      setBusy(false)
    }
  }
  return <>{error && <p className="auth-error" role="alert">{error}</p>}<form className="auth-form" onSubmit={submit}>
    <label>Email address<input type="email" required autoComplete="username" value={email} onChange={(event) => setEmail(event.target.value)} /></label>
    <label>Password<input type="password" required autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} /></label>
    <button className="primary-button" type="submit" disabled={busy || !supabaseConfigured}>{busy ? 'Signing in…' : 'Sign in to staff workspace'}</button>
  </form></>
}

function CampaignList({ campaigns, loading, error }) {
  if (loading) return <p className="portal-muted">Loading community services…</p>
  if (error) return <p className="auth-error" role="alert">{error}</p>
  if (!campaigns.length) return <p className="portal-muted">There are no open service announcements right now. Check back for upcoming clinic services.</p>
  return <div className="portal-campaign-grid">
    {campaigns.map((campaign) => (
      <article className="portal-campaign-card" key={campaign.id}>
        <span className="portal-tag">{campaign.service_type.replace('_', ' ')}</span>
        <h3>{campaign.title}</h3>
        <p>{campaign.description || 'Community health service available to registered clients.'}</p>
        <small>{new Date(campaign.starts_at).toLocaleString()}</small>
      </article>
    ))}
  </div>
}

function ClientQueue({ entries, loading, error }) {
  if (loading) return <p className="portal-muted">Loading your clinic visits…</p>
  if (error) return <p className="auth-error" role="alert">{error}</p>
  if (!entries.length) return <p className="portal-muted">No clinic visits yet. Joining a service automatically assigns your queue number.</p>
  return <div className="portal-queue-list">{entries.map((entry) => <article className="portal-queue-card" key={entry.id}>
    <div><span className="eyebrow">{entry.campaign?.title ?? 'Clinic service'}</span><strong>Queue #{entry.queue_number}</strong><small>{entry.campaign?.starts_at ? new Date(entry.campaign.starts_at).toLocaleString() : ''}</small></div>
    <span className={`portal-status portal-status-${entry.status}`}>{entry.status}</span>
  </article>)}</div>
}

export default function ClientPortal(props) {
  if (props.mode !== 'client' && props.mode !== 'client-setup') {
    return <PublicClientDashboard onStaffLogin={props.onStaffLogin} />
  }
  return <AuthenticatedClientPortal {...props} />
}

function AuthenticatedClientPortal({ mode = 'public', profile, onProfileCreated, onNotificationChange, onStaffLogin, onClientAuthStart, onSignOut, initialAuthError = '' }) {
  const [section, setSection] = useState('home')
  const [clientTab, setClientTab] = useState('dashboard')
  const [campaigns, setCampaigns] = useState([])
  const [campaignLoading, setCampaignLoading] = useState(supabaseConfigured)
  const [campaignError, setCampaignError] = useState('')
  const [portalEmail, setPortalEmail] = useState('')
  const [password, setPassword] = useState('')
  const [authBusy, setAuthBusy] = useState(false)
  const [authError, setAuthError] = useState('')
  const [authNotice, setAuthNotice] = useState('')
  const [organizations, setOrganizations] = useState([])
  const [organizationError, setOrganizationError] = useState('')
  const [profileError, setProfileError] = useState('')
  const [queueEntries, setQueueEntries] = useState([])
  const [queueError, setQueueError] = useState('')
  const [queueLoading, setQueueLoading] = useState(false)
  const [preferenceBusy, setPreferenceBusy] = useState(false)

  useEffect(() => {
    if (!supabase) {
      return undefined
    }
    let cancelled = false
    supabase.from('service_campaigns')
      .select('id, title, service_type, description, starts_at')
      .eq('status', 'open')
      .order('starts_at')
      .then(({ data, error }) => {
        if (cancelled) return
        if (error) setCampaignError(`Could not load service announcements: ${error.message}`)
        else setCampaigns(data ?? [])
        setCampaignLoading(false)
      })
      .catch((error) => {
        if (cancelled) return
        setCampaignError(`Could not load service announcements: ${error instanceof Error ? error.message : 'Unknown database error.'}`)
        setCampaignLoading(false)
      })
    return () => { cancelled = true }
  }, [])

  useEffect(() => {
    if (mode !== 'client-setup' || !supabase) return undefined
    let cancelled = false
    supabase.rpc('list_public_organizations').then(({ data, error }) => {
      if (cancelled) return
      if (error) setOrganizationError(`Could not load clinic locations: ${error.message}`)
      else setOrganizations(data ?? [])
    }).catch((error) => {
      if (!cancelled) setOrganizationError(`Could not load clinic locations: ${error instanceof Error ? error.message : 'Unknown database error.'}`)
    })
    return () => { cancelled = true }
  }, [mode])

  useEffect(() => {
    if (mode !== 'client' || !profile || !supabase) return undefined
    let cancelled = false
    const loadQueue = async () => {
      setQueueLoading(true)
      setQueueError('')
      const { data, error } = await supabase.from('queue_entries')
        .select('id, queue_number, status, checked_in_at, campaign:service_campaigns(title, starts_at)')
        .eq('client_profile_id', profile.id)
        .order('checked_in_at', { ascending: false })
      if (cancelled) return
      if (error) setQueueError(`Could not load your clinic queue: ${error.message}`)
      else setQueueEntries(data ?? [])
      setQueueLoading(false)
    }
    loadQueue()
    const channel = supabase.channel(`client-queue-${profile.id}`)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'queue_entries',
        filter: `client_profile_id=eq.${profile.id}`,
      }, loadQueue)
      .subscribe()
    return () => {
      cancelled = true
      supabase.removeChannel(channel)
    }
  }, [mode, profile])

  async function requestClientSignIn(event) {
    event.preventDefault()
    if (!supabase) return
    setAuthBusy(true)
    setAuthError('')
    setAuthNotice('')
    try {
      onClientAuthStart?.()
      const { error } = await supabase.auth.signInWithOtp({
        email: portalEmail.trim(),
        options: { emailRedirectTo: `${window.location.origin}/?portal=client` },
      })
      if (error) throw error
      setAuthNotice('Check your email for a secure sign-in link. You can finish registration after confirming it.')
    } catch (error) {
      setAuthError(`Could not send the sign-in email: ${error instanceof Error ? error.message : 'Unknown authentication error.'}`)
    } finally {
      setAuthBusy(false)
    }
  }

  async function registerClient(event) {
    event.preventDefault()
    if (!supabase) return
    const values = new FormData(event.currentTarget)
    setAuthBusy(true)
    setProfileError('')
    try {
      const { error } = await supabase.rpc('register_client_profile', {
        p_organization_id: values.get('organization_id'),
        p_full_name: String(values.get('full_name') ?? '').trim(),
        p_pin: String(values.get('pin') ?? ''),
        p_phone: String(values.get('phone') ?? '').trim(),
        p_address: String(values.get('address') ?? '').trim(),
        p_birth_date: values.get('birth_date'),
        p_email_notifications: values.get('email_notifications') === 'on',
      })
      if (error) throw error
      await onProfileCreated()
    } catch (error) {
      setProfileError(`Could not complete registration: ${error instanceof Error ? error.message : 'Unknown database error.'}`)
    } finally {
      setAuthBusy(false)
    }
  }

  async function updateEmailPreference(event) {
    if (!supabase) return
    const enabled = event.currentTarget.checked
    setPreferenceBusy(true)
    setProfileError('')
    try {
      const { error } = await supabase.rpc('set_client_email_notifications', { p_enabled: enabled })
      if (error) throw error
      await onNotificationChange()
    } catch (error) {
      setProfileError(`Could not update your email preference: ${error instanceof Error ? error.message : 'Unknown database error.'}`)
    } finally {
      setPreferenceBusy(false)
    }
  }

  async function staffSignIn(event) {
    event.preventDefault()
    setAuthBusy(true)
    setAuthError('')
    try {
      await onStaffLogin(portalEmail.trim(), password)
    } catch (error) {
      setAuthError(`Staff sign-in failed: ${error instanceof Error ? error.message : 'Unknown authentication error.'}`)
    } finally {
      setAuthBusy(false)
    }
  }

  const setupMode = mode === 'client-setup'
  const clientMode = mode === 'client'
  const clientNavigation = [
    { id: 'dashboard', label: 'Dashboard' },
    { id: 'services', label: 'Available services' },
    { id: 'profile', label: 'My profile' },
  ]

  return <main className="portal-page">
    <header className="portal-header">
      <a className="portal-brand" href="#" onClick={(event) => { event.preventDefault(); setSection('home') }}>
        <span className="brand-mark">+</span><span>CareCircle <small>COMMUNITY HEALTH</small></span>
      </a>
      {clientMode || setupMode
        ? <button className="portal-text-button" type="button" onClick={onSignOut}>Sign out</button>
        : <button className="portal-text-button" type="button" onClick={() => { setSection(section === 'staff' ? 'home' : 'staff'); setAuthError(''); setAuthNotice('') }}>{section === 'staff' ? 'Back to client portal' : 'Staff login'}</button>}
    </header>

    {initialAuthError && <p className="auth-error portal-auth-notice" role="alert">{initialAuthError}</p>}
    {!supabaseConfigured && <section className="portal-setup-warning" role="alert">Online registration and service announcements are unavailable: {supabaseConfigurationError}</section>}

    {clientMode ? <div className="client-dashboard">
      <aside className="client-sidebar">
        <div className="client-sidebar-label">CLIENT MENU</div>
        <nav aria-label="Client navigation">
          {clientNavigation.map((item) => <button key={item.id} type="button" className={`client-nav-item${clientTab === item.id ? ' client-nav-active' : ''}`} onClick={() => setClientTab(item.id)}>{item.label}</button>)}
        </nav>
        <div className="client-sidebar-help"><strong>Need help?</strong><p>Contact your registered community clinic for assistance with a service or request.</p></div>
      </aside>

      <div className="client-dashboard-main">
        <section className="portal-welcome client-dashboard-welcome">
          <div className="eyebrow">CLIENT DASHBOARD</div>
          <h1>{clientTab === 'dashboard' ? `Welcome, ${profile?.full_name}` : clientNavigation.find((item) => item.id === clientTab)?.label}</h1>
          <p>{clientTab === 'dashboard' ? 'Your community health services, clinic requests, and registered details in one place.' : 'Your private CareCircle client account.'}</p>
        </section>

        {clientTab === 'dashboard' && <>
          <section className="client-stat-grid" aria-label="Client dashboard summary">
            <article className="client-stat-card"><span>Open services</span><strong>{campaignLoading ? '—' : campaigns.length}</strong><button type="button" onClick={() => setClientTab('services')}>Browse services</button></article>
            <article className="client-stat-card"><span>Clinic visits</span><strong>{queueLoading ? '—' : queueEntries.length}</strong></article>
          </section>
          <section className="portal-section client-dashboard-section">
            <div className="portal-section-heading"><div><div className="eyebrow">YOUR CLINIC STATUS</div><h2>Recent visits</h2></div></div>
            <ClientQueue entries={queueEntries.slice(0, 3)} loading={queueLoading} error={queueError} />
          </section>
          <section className="portal-section client-dashboard-section"><div className="portal-section-heading"><div><div className="eyebrow">COMMUNITY HEALTH</div><h2>Available services</h2></div><button className="portal-text-button" type="button" onClick={() => setClientTab('services')}>View all</button></div>
            <CampaignList campaigns={campaigns.slice(0, 3)} loading={campaignLoading} error={campaignError} />
          </section>
        </>}

        {clientTab === 'services' && <section className="portal-section client-dashboard-section"><div className="portal-section-heading"><div><div className="eyebrow">COMMUNITY HEALTH</div><h2>Available services</h2></div></div><CampaignList campaigns={campaigns} loading={campaignLoading} error={campaignError} /><p className="portal-muted">To request or attend a service, contact your clinic. Clinic staff will verify your details and add you to the queue when you arrive.</p></section>}

        {clientTab === 'profile' && <section className="portal-section client-dashboard-section"><div className="portal-section-heading"><div><div className="eyebrow">YOUR INFORMATION</div><h2>Registered profile</h2></div></div>
          <dl className="client-profile-grid"><div><dt>Full name</dt><dd>{profile?.full_name || '—'}</dd></div><div><dt>Email address</dt><dd>{profile?.email || '—'}</dd></div><div><dt>Phone number</dt><dd>{profile?.phone || '—'}</dd></div><div><dt>Date of birth</dt><dd>{profile?.birth_date ? new Date(`${profile.birth_date}T00:00:00`).toLocaleDateString() : '—'}</dd></div><div className="client-profile-address"><dt>Home address</dt><dd>{profile?.address || '—'}</dd></div></dl>
          <section className="portal-preferences"><div className="eyebrow">EMAIL PREFERENCES</div><label className="portal-checkbox"><input type="checkbox" checked={Boolean(profile?.email_notifications)} disabled={preferenceBusy} onChange={updateEmailPreference} /> Email me about upcoming community services.</label>{profileError && <p className="auth-error" role="alert">{profileError}</p>}</section>
        </section>}
      </div>
    </div> : setupMode ? <div className="portal-content portal-narrow">
      <section className="portal-welcome"><div className="eyebrow">CLIENT REGISTRATION</div><h1>Complete your profile</h1><p>Signed in as <strong>{profile?.email}</strong>. Your profile is linked to your verified email and protected from other clients.</p></section>
      {profileError && <p className="auth-error" role="alert">{profileError}</p>}
      {organizationError && <p className="auth-error" role="alert">{organizationError}</p>}
      <form className="auth-form portal-form" onSubmit={registerClient}>
        <label>Clinic or organization<select name="organization_id" required defaultValue=""><option value="" disabled>Select your clinic</option>{organizations.map((organization) => <option key={organization.organization_id} value={organization.organization_id}>{organization.organization_name}</option>)}</select></label>
        <label>Full name<input name="full_name" required minLength="2" maxLength="120" autoComplete="name" /></label>
        <label>Email address<input type="email" value={profile?.email ?? ''} disabled /></label>
        <label>4-digit clinic PIN<input name="pin" required inputMode="numeric" pattern="[0-9]{4}" maxLength="4" autoComplete="off" /></label>
        <small className="portal-muted">Staff use this PIN only to verify you at the clinic. It cannot be used to sign in online.</small>
        <label>Phone number<input name="phone" required minLength="5" maxLength="40" autoComplete="tel" /></label>
        <label>Home address<textarea name="address" required minLength="2" maxLength="240" autoComplete="street-address" /></label>
        <label>Date of birth<input name="birth_date" type="date" required /></label>
        <label className="portal-checkbox"><input name="email_notifications" type="checkbox" /> Email me about upcoming community services (optional).</label>
        {!organizations.length && !organizationError && <p className="portal-muted">No clinic organizations are available yet. Please contact your local health office.</p>}
        <button className="primary-button" type="submit" disabled={authBusy || !organizations.length}>{authBusy ? 'Saving profile…' : 'Create client profile'}</button>
      </form>
    </div> : <div className="portal-content">
      {section === 'home' ? <>
        <section className="portal-hero">
          <div className="eyebrow">CARE FOR EVERY COMMUNITY</div>
          <h1>Health services, closer to home.</h1>
          <p>Register with your community clinic to keep your contact details together and receive updates about checkups, medicine, vaccines, and other local health services.</p>
          <div className="portal-actions"><button className="primary-button" type="button" onClick={() => { setSection('client'); setAuthError(''); setAuthNotice('') }}>Register or sign in</button></div>
        </section>
        <section className="portal-section"><div className="portal-section-heading"><div><div className="eyebrow">COMMUNITY HEALTH</div><h2>Open services</h2></div></div><CampaignList campaigns={campaigns} loading={campaignLoading} error={campaignError} /></section>
        <p className="portal-privacy">Your health information is private. Staff verify clinic visits in person; your 4-digit clinic PIN is never used to sign in online.</p>
      </> : section === 'client' ? <section className="portal-auth-card">
        <button className="portal-back-link" type="button" onClick={() => { setSection('home'); setAuthError(''); setAuthNotice('') }}>← Back to services</button>
        <div className="eyebrow">CLIENT ACCESS</div><h1>Register or sign in</h1>
        <p className="auth-description">Enter your email. We’ll send a secure sign-in link; new clients can complete their profile after confirming it.</p>
        {authError && <p className="auth-error" role="alert">{authError}</p>}
        {authNotice && <p className="portal-success" role="status">{authNotice}</p>}
        <form className="auth-form" onSubmit={requestClientSignIn}>
          <label>Email address<input type="email" required autoComplete="email" value={portalEmail} onChange={(event) => setPortalEmail(event.target.value)} /></label>
          <button className="primary-button" type="submit" disabled={authBusy || !supabaseConfigured}>{authBusy ? 'Sending…' : 'Email me a secure link'}</button>
        </form>
      </section> : <section className="portal-auth-card">
        <button className="portal-back-link" type="button" onClick={() => { setSection('home'); setAuthError('') }}>← Back to client portal</button>
        <div className="eyebrow">STAFF WORKSPACE</div><h1>Staff sign in</h1>
        <p className="auth-description">Use the email and password provided by your organization administrator. Staff accounts cannot register here.</p>
        {authError && <p className="auth-error" role="alert">{authError}</p>}
        <form className="auth-form" onSubmit={staffSignIn}>
          <label>Email address<input type="email" required autoComplete="username" value={portalEmail} onChange={(event) => setPortalEmail(event.target.value)} /></label>
          <label>Password<input type="password" required autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} /></label>
          <button className="primary-button" type="submit" disabled={authBusy || !supabaseConfigured}>{authBusy ? 'Signing in…' : 'Sign in to staff workspace'}</button>
        </form>
      </section>}
    </div>}
    {!clientMode && !setupMode && <footer className="portal-footer">CareCircle · Community health services</footer>}
  </main>
}
