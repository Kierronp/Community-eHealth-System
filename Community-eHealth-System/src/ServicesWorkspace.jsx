import { useCallback, useEffect, useState } from 'react'
import { supabase } from './lib/supabase.js'

export default function ServicesWorkspace({ organizationId, facilities = [], memberRole }) {
  const [campaigns, setCampaigns] = useState([])
  const [queue, setQueue] = useState([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [formError, setFormError] = useState('')
  const [notice, setNotice] = useState('')
  const [busy, setBusy] = useState(false)
  const [queueCampaignFilter, setQueueCampaignFilter] = useState('')

  const loadData = useCallback(async () => {
    if (!supabase || !organizationId) return
    const [campaignResult, queueResult] = await Promise.all([
      supabase.from('service_campaigns')
        .select('id, title, service_type, description, starts_at, ends_at, status, announced_at, facility_id, facility:facilities(name)')
        .eq('organization_id', organizationId)
        .order('starts_at', { ascending: false }),
      supabase.from('queue_entries')
        .select('id, campaign_id, queue_number, status, checked_in_at, client:client_profiles(full_name, phone), campaign:service_campaigns(title)')
        .eq('organization_id', organizationId)
        .order('queue_number')
        .order('campaign_id'),
    ])
    setLoadError('')
    const failure = campaignResult.error || queueResult.error
    if (failure) {
      setLoadError(`Could not load services and queue: ${failure.message}`)
      setLoading(false)
      return
    }
    setCampaigns(campaignResult.data ?? [])
    setQueue(queueResult.data ?? [])
    setLoading(false)
  }, [organizationId])

  useEffect(() => {
    Promise.resolve().then(() => loadData())
    if (!supabase || !organizationId) return undefined
    const channel = supabase.channel(`staff-queue-${organizationId}`)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'queue_entries',
        filter: `organization_id=eq.${organizationId}`,
      }, loadData)
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [loadData, organizationId])

  async function createCampaign(event) {
    event.preventDefault()
    if (!supabase) return
    const form = event.currentTarget
    const values = new FormData(event.currentTarget)
    setBusy(true)
    setFormError('')
    setNotice('')
    try {
      const record = {
        organization_id: organizationId,
        title: String(values.get('title') ?? '').trim(),
        service_type: values.get('service_type'),
        description: String(values.get('description') ?? '').trim(),
        facility_id: values.get('facility_id') || null,
        starts_at: new Date(String(values.get('starts_at'))).toISOString(),
        ends_at: values.get('ends_at') ? new Date(String(values.get('ends_at'))).toISOString() : null,
        status: 'open',
      }
      const { error } = await supabase.from('service_campaigns').insert(record)
      if (error) throw error
      form.reset()
      await loadData()
      setNotice('Service published to the client portal.')
    } catch (error) {
      setFormError(`Could not create service: ${error instanceof Error ? error.message : 'Unknown database error.'}`)
    } finally {
      setBusy(false)
    }
  }

  async function updateStatus(entryId, status) {
    if (!supabase) return
    setBusy(true)
    setFormError('')
    try {
      const { error } = await supabase.rpc('update_queue_entry_status', { p_entry_id: entryId, p_status: status })
      if (error) throw error
      await loadData()
    } catch (error) {
      setFormError(`Could not update queue status: ${error instanceof Error ? error.message : 'Unknown database error.'}`)
    } finally {
      setBusy(false)
    }
  }

  async function setCampaignStatus(campaign, status) {
    if (!supabase) return
    setBusy(true)
    setFormError('')
    try {
      const { error } = await supabase.from('service_campaigns').update({ status }).eq('id', campaign.id)
      if (error) throw error
      await loadData()
    } catch (error) {
      setFormError(`Could not update service status: ${error instanceof Error ? error.message : 'Unknown database error.'}`)
    } finally {
      setBusy(false)
    }
  }

  async function announceCampaign(campaign) {
    if (!supabase) return
    setBusy(true)
    setFormError('')
    setNotice('')
    try {
      const { data, error } = await supabase.functions.invoke('notify-campaign', { body: { campaign_id: campaign.id } })
      if (error) throw error
      setNotice(`Campaign email sent to ${data.sent} opted-in client${data.sent === 1 ? '' : 's'}.`)
      await loadData()
    } catch (error) {
      setFormError(`Could not send campaign email: ${error instanceof Error ? error.message : 'Unknown notification error.'}`)
    } finally {
      setBusy(false)
    }
  }

  const canManageCampaigns = ['owner', 'admin', 'clinician'].includes(memberRole)
  const canManageQueue = ['owner', 'admin', 'clinician', 'health_worker'].includes(memberRole)
  const canAnnounce = ['owner', 'admin'].includes(memberRole)
  const visibleQueue = queue
    .filter((entry) => (
      ['waiting', 'called'].includes(entry.status)
      && (!queueCampaignFilter || entry.campaign_id === queueCampaignFilter)
    ))
    .sort((left, right) => (
      left.queue_number - right.queue_number
      || (left.campaign?.title ?? '').localeCompare(right.campaign?.title ?? '')
    ))
  const nextQueueEntryIdByCampaign = new Map()
  for (const entry of visibleQueue) {
    if (entry.status === 'waiting' && !nextQueueEntryIdByCampaign.has(entry.campaign_id)) {
      nextQueueEntryIdByCampaign.set(entry.campaign_id, entry.id)
    }
  }

  return <div className="services-workspace">
    <div className="welcome-row"><div><div className="eyebrow">COMMUNITY SERVICES</div><h1>Services &amp; clinic queue</h1><p className="page-subtitle">Publish services and manage the queue in the order clients join.</p></div><button className="secondary-button" type="button" onClick={loadData} disabled={loading}>Refresh</button></div>
    {loadError && <p className="auth-error" role="alert">{loadError}</p>}
    {formError && <p className="auth-error" role="alert">{formError}</p>}
    {notice && <p className="portal-success" role="status">{notice}</p>}

    <div className="services-layout">
      {canManageCampaigns && <section className="connected-overview service-form-card">
        <h2>Publish a service</h2><p>Open services appear on the client portal. Only opted-in clients are emailed when an admin sends an announcement.</p>
        <form className="auth-form portal-form" onSubmit={createCampaign}>
          <label>Service title<input name="title" required minLength="2" maxLength="160" /></label>
          <label>Type<select name="service_type" required defaultValue="checkup"><option value="checkup">Checkup</option><option value="medicine">Medicine</option><option value="vaccination">Vaccination</option><option value="other">Other</option></select></label>
          <label>Details<textarea name="description" maxLength="2000" /></label>
          <label>Clinic facility<select name="facility_id" defaultValue=""><option value="">Not specified</option>{facilities.map((facility) => <option key={facility.id} value={facility.id}>{facility.name}</option>)}</select></label>
          <label>Starts at<input name="starts_at" type="datetime-local" required /></label>
          <label>Ends at (optional)<input name="ends_at" type="datetime-local" /></label>
          <button className="primary-button" type="submit" disabled={busy}>{busy ? 'Saving…' : 'Publish service'}</button>
        </form>
      </section>}

    </div>

    <section className="connected-overview service-campaign-list">
      <div className="portal-section-heading"><div><div className="eyebrow">STAFF MANAGEMENT</div><h2>Services</h2></div></div>
      {loading && !campaigns.length ? <p className="portal-muted">Loading services…</p> : !campaigns.length ? <p className="portal-muted">No services have been created yet.</p> : <div className="campaign-staff-list">
        {campaigns.map((campaign) => <article className="campaign-staff-row" key={campaign.id}>
          <div><strong>{campaign.title}</strong><small>{campaign.service_type} · {new Date(campaign.starts_at).toLocaleString()} · {campaign.facility?.name ?? 'Location not specified'}</small></div>
          <span className={`portal-status portal-status-${campaign.status}`}>{campaign.status}</span>
          <div className="campaign-row-actions">
            {canManageCampaigns && campaign.status !== 'closed' && <button className="secondary-button" type="button" disabled={busy} onClick={() => setCampaignStatus(campaign, 'closed')}>Close</button>}
            {canManageCampaigns && campaign.status === 'closed' && <button className="secondary-button" type="button" disabled={busy} onClick={() => setCampaignStatus(campaign, 'open')}>Reopen</button>}
            {canAnnounce && campaign.status === 'open' && !campaign.announced_at && <button className="secondary-button" type="button" disabled={busy} onClick={() => announceCampaign(campaign)}>Email opted-in clients</button>}
            {campaign.announced_at && <small>Announced {new Date(campaign.announced_at).toLocaleDateString()}</small>}
          </div>
        </article>)}
      </div>}
    </section>

    <section className="connected-overview service-queue-list">
      <div className="portal-section-heading"><div><div className="eyebrow">LIVE CLINIC QUEUE</div><h2>Queue</h2><p className="portal-muted">Clients are numbered automatically when they join a service.</p></div>
        <select aria-label="Filter queue by service" value={queueCampaignFilter} onChange={(event) => setQueueCampaignFilter(event.target.value)}><option value="">All services</option>{campaigns.map((campaign) => <option key={campaign.id} value={campaign.id}>{campaign.title}</option>)}</select>
      </div>
      {loading && !queue.length ? <p className="portal-muted">Loading queue…</p> : !visibleQueue.length ? <p className="portal-muted">No clients are waiting in this service queue.</p> : <div className="staff-queue-table">
        <div className="staff-queue-head"><span>Queue</span><span>Client</span><span>Service</span><span>Status</span><span>Action</span></div>
        {visibleQueue.map((entry) => <article className="staff-queue-row" key={entry.id}>
          <strong>#{entry.queue_number}{entry.id === nextQueueEntryIdByCampaign.get(entry.campaign_id) && <small>Next</small>}</strong><span>{entry.client?.full_name}<small>{entry.client?.phone}</small></span><span>{entry.campaign?.title}</span><span className={`portal-status portal-status-${entry.status}`}>{entry.status}</span>
          <span>{canManageQueue && entry.status === 'waiting' && entry.id === nextQueueEntryIdByCampaign.get(entry.campaign_id) ? <button className="secondary-button" type="button" disabled={busy} onClick={() => updateStatus(entry.id, 'called')}>Call next</button> : canManageQueue && entry.status === 'called' ? <button className="secondary-button" type="button" disabled={busy} onClick={() => updateStatus(entry.id, 'served')}>Finish &amp; remove</button> : entry.status === 'waiting' ? 'Waiting' : '—'}</span>
        </article>)}
      </div>}
    </section>
  </div>
}
