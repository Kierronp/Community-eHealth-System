import { useCallback, useEffect, useState } from 'react'
import { supabase } from './lib/supabase.js'

const STAFF_ROLES = [
  ['admin', 'Administrator'],
  ['clinician', 'Clinician'],
  ['health_worker', 'Health worker'],
  ['inventory_manager', 'Inventory manager'],
  ['viewer', 'Viewer'],
]

export function AccessRequestForm({ onAccessGranted }) {
  const [organizations, setOrganizations] = useState([])
  const [requests, setRequests] = useState([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  const loadRequestOptions = useCallback(async () => {
    if (!supabase) return false
    setLoading(true)
    setError('')
    try {
      const [organizationResult, requestResult] = await Promise.all([
        supabase.rpc('list_public_organizations'),
        supabase.rpc('my_organization_access_requests'),
      ])
      if (organizationResult.error) throw organizationResult.error
      if (requestResult.error) throw requestResult.error
      setOrganizations(organizationResult.data ?? [])
      setRequests(requestResult.data ?? [])
      return true
    } catch (loadError) {
      setError(`Could not load access request options: ${loadError instanceof Error ? loadError.message : 'Unknown database error.'}`)
      return false
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    Promise.resolve().then(() => loadRequestOptions())
  }, [loadRequestOptions])

  async function submitRequest(event) {
    event.preventDefault()
    if (!supabase) return
    const values = new FormData(event.currentTarget)
    setBusy(true)
    setError('')
    setNotice('')
    try {
      const { error: requestError } = await supabase.rpc('request_organization_access', {
        p_organization_id: values.get('organization_id'),
        p_requested_role: values.get('requested_role'),
      })
      if (requestError) throw requestError
      if (await loadRequestOptions()) {
        setNotice('Your access request was sent to the organization administrators.')
      }
    } catch (requestError) {
      setError(`Could not submit access request: ${requestError instanceof Error ? requestError.message : 'Unknown database error.'}`)
    } finally {
      setBusy(false)
    }
  }

  async function checkAccess() {
    if (!supabase) return
    setBusy(true)
    setError('')
    setNotice('')
    try {
      const { data, error: accessError } = await supabase.rpc('my_organizations')
      if (accessError) throw accessError
      if (data?.length) {
        onAccessGranted(data)
      } else {
        if (await loadRequestOptions()) setNotice('No access has been approved yet. You can check again later.')
      }
    } catch (accessError) {
      setError(`Could not check organization access: ${accessError instanceof Error ? accessError.message : 'Unknown database error.'}`)
    } finally {
      setBusy(false)
    }
  }

  return <section className="access-request-card">
    <p className="auth-description">If you are new staff, request access to your clinic. An organization owner or administrator must review it before you can enter the workspace.</p>
    {error && <p className="auth-error" role="alert">{error}</p>}
    {notice && <p className="portal-success" role="status">{notice}</p>}
    {requests.length > 0 && <div className="access-request-status-list">
      {requests.map((request) => <div className="access-request-status" key={request.organization_id}>
        <span><strong>{request.organization_name}</strong><small>{request.requested_role.replaceAll('_', ' ')} · {new Date(request.requested_at).toLocaleDateString()}</small></span>
        <span className={`portal-status portal-status-${request.request_status}`}>{request.request_status}</span>
      </div>)}
    </div>}
    <button className="secondary-button" type="button" disabled={busy || loading} onClick={checkAccess}>Check for approval</button>
    <form className="patient-form access-request-form" onSubmit={submitRequest}>
      <label>Clinic or organization<select name="organization_id" required defaultValue="" disabled={loading || busy || organizations.length === 0}>
        <option value="" disabled>{loading ? 'Loading organizations…' : 'Select your clinic'}</option>
        {organizations.map((organization) => <option key={organization.organization_id} value={organization.organization_id}>{organization.organization_name}</option>)}
      </select></label>
      <label>Requested staff role<select name="requested_role" defaultValue="admin" disabled={busy}>
        {STAFF_ROLES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
      </select></label>
      <p className="form-note">Owner access cannot be requested here; it must be assigned directly by an organization owner.</p>
      <button className="primary-button" type="submit" disabled={busy || loading || organizations.length === 0}>{busy ? 'Sending request…' : 'Request access'}</button>
    </form>
  </section>
}

export function AccessRequestsPanel({ organizationId, memberRole }) {
  const [requests, setRequests] = useState([])
  const [roles, setRoles] = useState({})
  const [loading, setLoading] = useState(true)
  const [busyId, setBusyId] = useState('')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const canReview = ['owner', 'admin'].includes(memberRole)
  const assignableRoles = memberRole === 'owner'
    ? STAFF_ROLES
    : STAFF_ROLES.filter(([value]) => value !== 'admin')

  const loadRequests = useCallback(async () => {
    if (!supabase || !organizationId || !canReview) return false
    setLoading(true)
    setError('')
    try {
      const { data, error: loadError } = await supabase.rpc('pending_organization_access_requests', {
        p_organization_id: organizationId,
      })
      if (loadError) throw loadError
      setRequests(data ?? [])
      setRoles(Object.fromEntries((data ?? []).map((request) => [
        request.request_id,
        memberRole !== 'owner' && request.requested_role === 'admin'
          ? 'clinician'
          : request.requested_role,
      ])))
      return true
    } catch (loadError) {
      setError(`Could not load pending access requests: ${loadError instanceof Error ? loadError.message : 'Unknown database error.'}`)
      return false
    } finally {
      setLoading(false)
    }
  }, [canReview, memberRole, organizationId])

  useEffect(() => {
    Promise.resolve().then(() => loadRequests())
  }, [loadRequests])

  async function reviewRequest(request, decision) {
    if (!supabase) return
    setBusyId(request.request_id)
    setError('')
    setNotice('')
    try {
      const { error: reviewError } = await supabase.rpc('review_organization_access_request', {
        p_request_id: request.request_id,
        p_decision: decision,
        p_role: roles[request.request_id] ?? request.requested_role,
      })
      if (reviewError) throw reviewError
      const refreshed = await loadRequests()
      if (refreshed) setNotice(decision === 'approve'
        ? `Access approved for ${request.user_email}.`
        : `Access request rejected for ${request.user_email}.`)
    } catch (reviewError) {
      setError(`Could not ${decision} access request: ${reviewError instanceof Error ? reviewError.message : 'Unknown database error.'}`)
    } finally {
      setBusyId('')
    }
  }

  if (!canReview) return <div className="form-note">Only organization owners and administrators can review staff access requests.</div>

  return <section className="panel data-panel access-requests-panel">
    <div className="table-toolbar">
      <div><h2>Pending staff access <span className="row-count">{requests.length}</span></h2><p>Review staff accounts requesting access to this organization.</p></div>
      <button className="secondary-button" type="button" disabled={loading || Boolean(busyId)} onClick={loadRequests}>Refresh</button>
    </div>
    {error && <p className="auth-error" role="alert">{error}</p>}
    {notice && <p className="portal-success" role="status">{notice}</p>}
    <div className="table-scroll"><table><thead><tr><th>Staff account</th><th>Requested role</th><th>Requested</th><th>Approve as</th><th>Actions</th></tr></thead>
      <tbody>{requests.map((request) => <tr key={request.request_id}>
        <td><strong>{request.display_name || request.user_email}</strong><br /><small>{request.user_email}</small></td>
        <td>{request.requested_role.replaceAll('_', ' ')}</td>
        <td>{new Date(request.requested_at).toLocaleString()}</td>
        <td><select aria-label={`Role for ${request.user_email}`} value={roles[request.request_id] ?? request.requested_role} disabled={Boolean(busyId)} onChange={(event) => setRoles((current) => ({ ...current, [request.request_id]: event.target.value }))}>
          {assignableRoles.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select></td>
        <td><div className="table-actions">
          <button className="primary-button" type="button" disabled={Boolean(busyId)} onClick={() => reviewRequest(request, 'approve')}>{busyId === request.request_id ? 'Saving…' : 'Approve'}</button>
          <button className="secondary-button danger-button" type="button" disabled={Boolean(busyId)} onClick={() => reviewRequest(request, 'reject')}>Reject</button>
        </div></td>
      </tr>)}</tbody>
    </table>
      {memberRole !== 'owner' && requests.length > 0 && <p className="form-note access-review-note">Only an organization owner can approve a staff member as an administrator.</p>}
      {!loading && requests.length === 0 && <div className="empty-state">There are no pending staff access requests.</div>}
      {loading && <div className="empty-state">Loading access requests…</div>}
    </div>
  </section>
}
