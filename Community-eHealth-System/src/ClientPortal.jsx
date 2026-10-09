import { useEffect, useState } from 'react'
import { supabase, supabaseConfigurationError, supabaseConfigured } from './lib/supabase.js'

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

export default function ClientPortal({ mode = 'public', profile, onProfileCreated, onNotificationChange, onStaffLogin, onClientAuthStart, onSignOut, initialAuthError = '' }) {
  const [section, setSection] = useState('home')
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

    {clientMode ? <div className="portal-content">
      <section className="portal-welcome">
        <div className="eyebrow">YOUR CLIENT PORTAL</div>
        <h1>Welcome, {profile?.full_name}</h1>
        <p>View community services and follow your clinic check-in status. Staff will add you to a queue when you arrive.</p>
      </section>
      <section className="portal-section">
        <div className="portal-section-heading"><div><div className="eyebrow">CLINIC VISITS</div><h2>Your queue updates</h2></div></div>
        {queueError && <p className="auth-error" role="alert">{queueError}</p>}
        {queueLoading && !queueEntries.length && <p className="portal-muted">Loading your queue…</p>}
        {!queueLoading && !queueEntries.length && !queueError && <p className="portal-muted">You are not in a clinic queue. Staff will check you in when you arrive for a service.</p>}
        {queueEntries.length > 0 && <div className="portal-queue-list">{queueEntries.map((entry) => <article className="portal-queue-card" key={entry.id}>
          <div><span className="eyebrow">{entry.campaign?.title ?? 'Clinic service'}</span><strong>Queue #{entry.queue_number}</strong><small>{entry.campaign?.starts_at ? new Date(entry.campaign.starts_at).toLocaleString() : ''}</small></div>
          <span className={`portal-status portal-status-${entry.status}`}>{entry.status}</span>
        </article>)}</div>}
      </section>
      <section className="portal-section portal-preferences">
        <div className="eyebrow">EMAIL PREFERENCES</div>
        <label className="portal-checkbox"><input type="checkbox" checked={Boolean(profile?.email_notifications)} disabled={preferenceBusy} onChange={updateEmailPreference} /> Email me about upcoming community services.</label>
        {profileError && <p className="auth-error" role="alert">{profileError}</p>}
      </section>
      <section className="portal-section"><div className="portal-section-heading"><div><div className="eyebrow">COMMUNITY HEALTH</div><h2>Open services</h2></div></div>
        <CampaignList campaigns={campaigns} loading={campaignLoading} error={campaignError} />
      </section>
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
          <div className="portal-actions"><button className="primary-button" type="button" onClick={() => { setSection('client'); setAuthError(''); setAuthNotice('') }}>Register or sign in</button><button className="portal-secondary-button" type="button" onClick={() => { setSection('client'); setAuthError(''); setAuthNotice('') }}>View my requests</button></div>
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
