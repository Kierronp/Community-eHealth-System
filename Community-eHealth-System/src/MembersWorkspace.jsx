import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from './lib/supabase.js'

const EMPTY_MEMBER = {
  full_name: '',
  email: '',
  phone: '',
  address: '',
  birth_date: '',
  status: 'active',
  email_notifications: false,
}

function formatDate(value) {
  if (!value) return '—'
  const dateOnly = /^\d{4}-\d{2}-\d{2}$/.test(value)
  return (dateOnly
    ? new Date(`${value}T00:00:00`)
    : new Date(value)).toLocaleDateString()
}

export default function MembersWorkspace({ organizationId, memberRole, query = '' }) {
  const [members, setMembers] = useState([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [editingMember, setEditingMember] = useState(null)
  const [view, setView] = useState('members')

  const loadMembers = useCallback(async () => {
    if (!supabase || !organizationId) return false
    setLoading(true)
    setError('')
    try {
      const { data, error: loadError } = await supabase.from('client_profiles')
        .select('id, member_number, full_name, email, phone, address, birth_date, email_notifications, status, created_at')
        .eq('organization_id', organizationId)
        .order('created_at', { ascending: false })
      if (loadError) throw loadError
      setMembers(data ?? [])
      return true
    } catch (loadError) {
      setError(`Could not load registered members: ${loadError instanceof Error ? loadError.message : 'Unknown database error.'}`)
      return false
    } finally {
      setLoading(false)
    }
  }, [organizationId])

  useEffect(() => {
    Promise.resolve().then(() => loadMembers())
  }, [loadMembers])

  const canManage = ['owner', 'admin'].includes(memberRole)
  const pendingCount = members.filter((member) => member.status === 'pending').length
  const filteredMembers = useMemo(() => {
    const term = query.trim().toLowerCase()
    const visibleMembers = members.filter((member) => view === 'applications'
      ? member.status === 'pending'
      : member.status !== 'pending')
    if (!term) return visibleMembers
    return visibleMembers.filter((member) => [
      member.member_number,
      member.full_name,
      member.email,
      member.phone,
      member.address,
      member.status,
    ].some((value) => String(value ?? '').toLowerCase().includes(term)))
  }, [members, query, view])

  async function saveMember(event) {
    event.preventDefault()
    if (!supabase || !canManage) return
    const values = new FormData(event.currentTarget)
    const record = {
      p_organization_id: organizationId,
      p_full_name: String(values.get('full_name') ?? '').trim(),
      p_email: String(values.get('email') ?? '').trim(),
      p_pin: String(values.get('pin') ?? ''),
      p_phone: String(values.get('phone') ?? '').trim(),
      p_address: String(values.get('address') ?? '').trim(),
      p_birth_date: String(values.get('birth_date') ?? ''),
      p_email_notifications: values.get('email_notifications') === 'on',
    }
    setBusy(true)
    setError('')
    setNotice('')
    try {
      if (editingMember?.id) {
        const { error: updateError } = await supabase.rpc('admin_update_client_profile', {
          ...record,
          p_profile_id: editingMember.id,
          p_status: values.get('status'),
        })
        if (updateError) throw updateError
      } else {
        const { error: createError } = await supabase.rpc('admin_create_client_profile', record)
        if (createError) throw createError
      }
      const refreshed = await loadMembers()
      setEditingMember(null)
      if (refreshed) setNotice(editingMember ? 'Member record updated.' : 'Member added and PIN securely saved.')
    } catch (saveError) {
      setError(`Could not save member: ${saveError instanceof Error ? saveError.message : 'Unknown database error.'}`)
    } finally {
      setBusy(false)
    }
  }

  async function deleteMember(member) {
    if (!supabase || !canManage) return
    const confirmed = window.confirm(
      `Delete ${member.full_name}'s member record permanently? Their service sign-ups and queue history will also be deleted.`,
    )
    if (!confirmed) return
    setBusy(true)
    setError('')
    setNotice('')
    try {
      const { error: deleteError } = await supabase.rpc('admin_delete_client_profile', {
        p_organization_id: organizationId,
        p_profile_id: member.id,
      })
      if (deleteError) throw deleteError
      const refreshed = await loadMembers()
      if (refreshed) setNotice(`${member.full_name}'s member record was deleted.`)
    } catch (deleteError) {
      setError(`Could not delete member: ${deleteError instanceof Error ? deleteError.message : 'Unknown database error.'}`)
    } finally {
      setBusy(false)
    }
  }

  async function reviewApplication(member, decision) {
    if (!supabase || !canManage) return
    if (decision === 'reject' && !window.confirm(`Reject ${member.full_name}'s application? The application will be kept as an inactive member record.`)) return
    setBusy(true)
    setError('')
    setNotice('')
    try {
      const { error: reviewError } = await supabase.rpc('admin_review_client_profile', {
        p_organization_id: organizationId,
        p_profile_id: member.id,
        p_decision: decision,
      })
      if (reviewError) throw reviewError
      const refreshed = await loadMembers()
      if (refreshed) setNotice(decision === 'approve'
        ? `${member.full_name}'s application was approved.`
        : `${member.full_name}'s application was rejected.`)
    } catch (reviewError) {
      setError(`Could not ${decision} application: ${reviewError instanceof Error ? reviewError.message : 'Unknown database error.'}`)
    } finally {
      setBusy(false)
    }
  }

  return <section className="panel data-panel members-panel">
    <div className="table-toolbar">
      <div><h2>{view === 'applications' ? 'Pending applications' : 'Registered members'} <span className="row-count">{view === 'applications' ? pendingCount : members.length - pendingCount}</span></h2><p>Client accounts registered at this clinic. PINs are never displayed.</p></div>
      <div className="table-actions">
        <button className="secondary-button" type="button" onClick={loadMembers} disabled={loading || busy}>Refresh</button>
        {canManage && view === 'members' && <button className="primary-button" type="button" disabled={busy} onClick={() => { setEditingMember({ ...EMPTY_MEMBER }); setError(''); setNotice('') }}>Add member</button>}
      </div>
    </div>
    <div className="member-tabs" role="tablist" aria-label="Member directory views">
      <button className={`member-tab${view === 'members' ? ' member-tab-active' : ''}`} type="button" role="tab" aria-selected={view === 'members'} onClick={() => setView('members')}>Members</button>
      <button className={`member-tab${view === 'applications' ? ' member-tab-active' : ''}`} type="button" role="tab" aria-selected={view === 'applications'} onClick={() => setView('applications')}>Pending applications <span>{pendingCount}</span></button>
    </div>
    {error && <p className="auth-error" role="alert">{error}</p>}
    {notice && <p className="portal-success" role="status">{notice}</p>}
    <div className="table-scroll"><table><thead><tr><th>Member ID</th><th>Full name</th><th>Email</th><th>Phone</th><th>Date of birth</th>{view === 'members' && <th>Status</th>}<th>Registered</th>{canManage && <th>Actions</th>}</tr></thead>
      <tbody>{filteredMembers.map((member) => <tr key={member.id}>
        <td><strong>{member.member_number}</strong></td>
        <td><strong>{member.full_name}</strong></td>
        <td>{member.email || '—'}</td>
        <td>{member.phone || '—'}</td>
        <td>{formatDate(member.birth_date)}</td>
        {view === 'members' && <td><span className={`portal-status portal-status-${member.status}`}>{member.status}</span></td>}
        <td>{formatDate(member.created_at)}</td>
        {canManage && <td><div className="table-actions">
          {view === 'applications' && <><button className="primary-button" type="button" disabled={busy} onClick={() => reviewApplication(member, 'approve')}>Approve</button><button className="secondary-button danger-button" type="button" disabled={busy} onClick={() => reviewApplication(member, 'reject')}>Reject</button></>}
          <button className="secondary-button" type="button" disabled={busy} onClick={() => { setEditingMember(member); setError('') }}>Edit</button>
          <button className="secondary-button danger-button" type="button" disabled={busy} onClick={() => deleteMember(member)}>Delete</button>
        </div></td>}
      </tr>)}</tbody>
    </table>
      {!loading && filteredMembers.length === 0 && <div className="empty-state">{query ? `No ${view === 'applications' ? 'pending applications' : 'members'} match “${query}”.` : view === 'applications' ? 'There are no pending applications to review.' : 'No approved or inactive members are listed yet.'}</div>}
      {loading && <div className="empty-state">Loading registered members…</div>}
    </div>
    <div className="table-footer">Showing <strong>{filteredMembers.length}</strong> of <strong>{view === 'applications' ? pendingCount : members.length - pendingCount}</strong> {view === 'applications' ? 'applications' : 'members'}</div>

    {editingMember && <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !busy) setEditingMember(null) }}>
      <section className="modal member-modal" role="dialog" aria-modal="true" aria-labelledby="member-modal-title">
        <div className="modal-heading"><div><div className="eyebrow">CLIENT DIRECTORY</div><h2 id="member-modal-title">{editingMember.id ? 'Edit member' : 'Add member'}</h2></div>
          <button className="icon-button" type="button" aria-label="Close dialog" disabled={busy} onClick={() => setEditingMember(null)}>×</button>
        </div>
        <p className="modal-description">{editingMember.id ? 'Update the registered client details. Leave PIN blank to keep the current PIN.' : 'Create a registered client account for this clinic.'}</p>
        <form className="patient-form" onSubmit={saveMember}>
          <label>Full name<input name="full_name" required minLength="2" maxLength="120" defaultValue={editingMember.full_name} /></label>
          <label>Email address<input name="email" type="email" required maxLength="254" defaultValue={editingMember.email} /></label>
          <label>{editingMember.id ? 'Change 4-digit PIN (optional)' : '4-digit clinic PIN'}<input name="pin" type="password" inputMode="numeric" pattern={editingMember.id ? '([0-9]{4})?' : '[0-9]{4}'} maxLength="4" required={!editingMember.id} autoComplete="new-password" /></label>
          <label>Phone number<input name="phone" required minLength="5" maxLength="40" defaultValue={editingMember.phone} /></label>
          <label>Home address<textarea name="address" required minLength="2" maxLength="240" defaultValue={editingMember.address} rows="2" /></label>
          <label>Date of birth<input name="birth_date" type="date" required defaultValue={editingMember.birth_date} /></label>
          {editingMember.id && <label>Status<select name="status" defaultValue={editingMember.status}><option value="pending">Pending</option><option value="active">Active</option><option value="inactive">Inactive</option></select></label>}
          <label className="portal-checkbox"><input name="email_notifications" type="checkbox" defaultChecked={editingMember.email_notifications} /> Opt in to general service announcements by email.</label>
          {error && <p className="auth-error" role="alert">{error}</p>}
          <div className="form-note">The PIN is hashed in the database and is never shown in this directory.</div>
          <div className="modal-actions"><button className="secondary-button" type="button" disabled={busy} onClick={() => setEditingMember(null)}>Cancel</button><button className="primary-button" type="submit" disabled={busy}>{busy ? 'Saving…' : editingMember.id ? 'Save changes' : 'Create member'}</button></div>
        </form>
      </section>
    </div>}
  </section>
}
