import { useCallback, useEffect, useState } from 'react'
import { supabase } from './lib/supabase.js'

const STAFF_ROLES = [
  ['admin', 'Administrator'],
  ['clinician', 'Clinician'],
  ['health_worker', 'Health worker'],
  ['inventory_manager', 'Inventory manager'],
  ['viewer', 'Viewer'],
]

const NEW_STAFF = {
  full_name: '',
  email: '',
  role: 'admin',
  status: 'active',
  method: 'invite',
}

function displayDate(value) {
  return value ? new Date(value).toLocaleDateString() : '—'
}

async function invokeStaffAction(body) {
  if (!supabase) throw new Error('Supabase is not configured.')
  const { data, error } = await supabase.functions.invoke('staff-account-admin', { body })
  if (error) {
    if (error.context instanceof Response) {
      const payload = await error.context.json().catch(() => null)
      if (typeof payload?.error === 'string') throw new Error(payload.error)
    }
    throw error
  }
  if (data?.error) throw new Error(data.error)
  return data
}

export default function StaffAccountsWorkspace({ organizationId, memberRole, currentUserId }) {
  const [staff, setStaff] = useState([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [editingStaff, setEditingStaff] = useState(null)
  const [accountMethod, setAccountMethod] = useState('invite')
  const canManage = memberRole === 'owner'

  const loadStaff = useCallback(async () => {
    if (!canManage) {
      setLoading(false)
      return false
    }
    setLoading(true)
    setError('')
    try {
      const data = await invokeStaffAction({ action: 'list', organization_id: organizationId })
      setStaff(data.staff ?? [])
      return true
    } catch (loadError) {
      setError(`Could not load staff accounts: ${loadError instanceof Error ? loadError.message : 'Unknown error.'}`)
      return false
    } finally {
      setLoading(false)
    }
  }, [canManage, organizationId])

  useEffect(() => {
    Promise.resolve().then(() => loadStaff())
  }, [loadStaff])

  function openCreate() {
    setError('')
    setNotice('')
    setAccountMethod('invite')
    setEditingStaff({ ...NEW_STAFF })
  }

  function openEdit(member) {
    setError('')
    setNotice('')
    setEditingStaff({ ...member, method: undefined })
  }

  async function saveStaff(event) {
    event.preventDefault()
    if (!canManage) return
    const values = new FormData(event.currentTarget)
    const fullName = String(values.get('full_name') ?? '').trim()
    const email = String(values.get('email') ?? '').trim()
    const role = String(values.get('role') ?? '')
    const password = String(values.get('password') ?? '')
    setBusy(true)
    setError('')
    setNotice('')
    try {
      if (editingStaff.user_id) {
        await invokeStaffAction({
          action: 'update',
          organization_id: organizationId,
          user_id: editingStaff.user_id,
          full_name: fullName,
          email,
          role,
          status: values.get('status'),
          password,
        })
      } else {
        await invokeStaffAction({
          action: 'create',
          organization_id: organizationId,
          full_name: fullName,
          email,
          role,
          method: values.get('method'),
          password: values.get('password'),
        })
      }
      const refreshed = await loadStaff()
      setEditingStaff(null)
      if (refreshed) setNotice(editingStaff.user_id
        ? 'Staff account updated.'
        : values.get('method') === 'invite'
          ? 'Staff account created and invitation email sent.'
          : 'Staff account created with the initial password.')
    } catch (saveError) {
      setError(`Could not save staff account: ${saveError instanceof Error ? saveError.message : 'Unknown error.'}`)
    } finally {
      setBusy(false)
    }
  }

  async function deleteStaff(member) {
    if (!canManage) return
    const confirmed = window.confirm(
      `Permanently delete ${member.email}'s Supabase login? This removes the account and access from every organization. Historical records they created will remain, but their creator attribution will be cleared. This cannot be undone.`,
    )
    if (!confirmed) return
    setBusy(true)
    setError('')
    setNotice('')
    try {
      await invokeStaffAction({
        action: 'delete',
        organization_id: organizationId,
        user_id: member.user_id,
      })
      const refreshed = await loadStaff()
      if (refreshed) setNotice(`${member.email}'s Supabase login was permanently deleted.`)
    } catch (deleteError) {
      setError(`Could not delete staff account: ${deleteError instanceof Error ? deleteError.message : 'Unknown error.'}`)
    } finally {
      setBusy(false)
    }
  }

  if (!canManage) {
    return <section className="form-note staff-owner-note">Only organization owners can create, edit, suspend, or permanently delete staff accounts.</section>
  }

  return <section className="panel data-panel staff-accounts-panel">
    <div className="table-toolbar">
      <div><h2>Organization staff <span className="row-count">{staff.length}</span></h2><p>Manage accounts and roles for staff in this organization.</p></div>
      <div className="table-actions">
        <button className="secondary-button" type="button" disabled={loading || busy} onClick={loadStaff}>Refresh</button>
        <button className="primary-button" type="button" disabled={busy} onClick={openCreate}>Create staff account</button>
      </div>
    </div>
    {error && <p className="auth-error" role="alert">{error}</p>}
    {notice && <p className="portal-success" role="status">{notice}</p>}
    <div className="table-scroll"><table><thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Status</th><th>Joined</th><th>Actions</th></tr></thead>
      <tbody>{staff.map((member) => <tr key={member.user_id}>
        <td><strong>{member.full_name || '—'}</strong></td>
        <td>{member.email}</td>
        <td>{member.role.replaceAll('_', ' ')}</td>
        <td><span className={`portal-status portal-status-${member.status}`}>{member.status}</span></td>
        <td>{displayDate(member.created_at)}</td>
        <td><div className="table-actions">
          {member.role !== 'owner' && <button className="secondary-button" type="button" disabled={busy} onClick={() => openEdit(member)}>Edit</button>}
          {member.user_id !== currentUserId && member.role !== 'owner' && <button className="secondary-button danger-button" type="button" disabled={busy} onClick={() => deleteStaff(member)}>Delete login</button>}
        </div></td>
      </tr>)}</tbody>
    </table>
      {!loading && staff.length === 0 && <div className="empty-state">No staff accounts are assigned to this organization.</div>}
      {loading && <div className="empty-state">Loading staff accounts…</div>}
    </div>
    <div className="table-footer">Staff login deletion is permanent and removes the account from all organizations.</div>

    {editingStaff && <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !busy) setEditingStaff(null) }}>
      <section className="modal staff-account-modal" role="dialog" aria-modal="true" aria-labelledby="staff-modal-title">
        <div className="modal-heading"><div><div className="eyebrow">TEAM ACCESS</div><h2 id="staff-modal-title">{editingStaff.user_id ? 'Edit staff account' : 'Create staff account'}</h2></div>
          <button className="icon-button" type="button" aria-label="Close dialog" disabled={busy} onClick={() => setEditingStaff(null)}>×</button>
        </div>
        <p className="modal-description">{editingStaff.user_id ? 'Update the staff member’s login email, name, organization role, access status, or password.' : 'Create a Supabase login and assign it to this organization.'}</p>
        <form className="patient-form" onSubmit={saveStaff}>
          <label>Full name<input name="full_name" required minLength="2" maxLength="120" defaultValue={editingStaff.full_name} /></label>
          <label>Email address<input name="email" type="email" required maxLength="254" defaultValue={editingStaff.email} /></label>
          <label>Organization role<select name="role" defaultValue={editingStaff.role}>
            {STAFF_ROLES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select></label>
          {editingStaff.user_id
            ? <>
              <label>Access status<select name="status" defaultValue={editingStaff.status}><option value="active">Active</option><option value="suspended">Suspended</option></select></label>
              <label className="staff-password-field">Set new password (optional)<input name="password" type="password" minLength="10" maxLength="128" autoComplete="new-password" /></label>
              <p className="form-note staff-password-note">Leave blank to keep the current password. If you change it, share the new password securely. Email changes are confirmed immediately.</p>
            </>
            : <>
              <label>Account setup<select name="method" value={accountMethod} onChange={(event) => setAccountMethod(event.target.value)}><option value="invite">Email invitation</option><option value="password">Set initial password</option></select></label>
              {accountMethod === 'password'
                ? <label className="staff-password-field">Initial password<input name="password" type="password" required minLength="10" maxLength="128" autoComplete="new-password" /></label>
                : <p className="form-note staff-password-note">The staff member will receive an email invitation to set their password. Configure Supabase Auth email delivery and redirect URLs.</p>}
            </>}
          <div className="form-note staff-security-note">Only organization owners can manage staff. Owner accounts cannot be edited or deleted here. Deleting a staff login permanently deletes it across all organizations. Share any owner-set password securely.</div>
          {error && <p className="auth-error" role="alert">{error}</p>}
          <div className="modal-actions"><button className="secondary-button" type="button" disabled={busy} onClick={() => setEditingStaff(null)}>Cancel</button><button className="primary-button" type="submit" disabled={busy}>{busy ? 'Saving…' : editingStaff.user_id ? 'Save changes' : 'Create account'}</button></div>
        </form>
      </section>
    </div>}
  </section>
}
