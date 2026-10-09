import { lazy, Suspense, useCallback, useEffect, useMemo, useState } from 'react'
import ClientPortal from './ClientPortal.jsx'
import { supabase, supabaseConfigurationError, supabaseConfigured } from './lib/supabase.js'
import './App.css'

const ServicesWorkspace = lazy(() => import('./ServicesWorkspace.jsx'))

const navigation = [
  { label: 'Dashboard', icon: 'grid' },
  { label: 'AI Assistant', icon: 'sparkles' },
  { label: 'Patients', icon: 'users' },
  { label: 'Families', icon: 'family' },
  { label: 'Vaccination', icon: 'shield' },
  { label: 'Inventory', icon: 'box' },
  { label: 'Reports', icon: 'chart' },
  { label: 'Alerts', icon: 'bell' },
  { label: 'Services & Queue', icon: 'calendar' },
  { label: 'Users', icon: 'user' },
]

function patientFromRow(row) {
  const age = row.birth_date
    ? Math.floor((Date.now() - new Date(`${row.birth_date}T00:00:00`).getTime()) / 31557600000)
    : null
  return {
    name: row.full_name,
    id: row.patient_number,
    databaseId: row.id,
    age: age ?? '—',
    sex: row.sex ? row.sex[0].toUpperCase() + row.sex.slice(1) : '—',
    community: row.community?.name ?? '—',
    program: row.care_program,
    status: row.status ? row.status[0].toUpperCase() + row.status.slice(1) : '—',
    initials: row.initials || row.full_name.split(/\s+/).slice(0, 2).map((part) => part[0]).join('').toUpperCase(),
    color: row.avatar_color || 'mint',
  }
}

const workspaceConfig = {
  Families: {
    table: 'families',
    select: 'id, household_name, family_number, community_id, status, created_at, community:communities(name)',
    eyebrow: 'COMMUNITY CARE',
    description: 'Households and their linked patient records.',
    columns: ['Family', 'Family ID', 'Community', 'Status'],
    fields: [
      { name: 'household_name', label: 'Household name', required: true },
      { name: 'community_id', label: 'Community', type: 'select', source: 'communities' },
    ],
    map: (row) => [row.household_name, row.family_number, row.community?.name, row.status],
  },
  Vaccination: {
    table: 'vaccination_records',
    select: 'id, vaccine_name, dose_name, due_date, status, patient_id, patient:patients(full_name)',
    eyebrow: 'IMMUNIZATION',
    description: 'Track vaccination schedules and administered doses.',
    columns: ['Patient', 'Vaccine', 'Dose', 'Due date', 'Status'],
    fields: [
      { name: 'patient_id', label: 'Patient', type: 'select', source: 'patients', required: true },
      { name: 'vaccine_name', label: 'Vaccine', required: true },
      { name: 'dose_name', label: 'Dose', required: true },
      { name: 'due_date', label: 'Due date', type: 'date' },
    ],
    map: (row) => [row.patient?.full_name, row.vaccine_name, row.dose_name, row.due_date, row.status],
  },
  Inventory: {
    table: 'inventory_items',
    select: 'id, item_code, name, category, unit, reorder_level, is_active',
    eyebrow: 'SUPPLY MANAGEMENT',
    description: 'Manage inventory items and their reorder levels.',
    columns: ['Item', 'Code', 'Category', 'Unit', 'Reorder level', 'Status'],
    fields: [
      { name: 'name', label: 'Item name', required: true },
      { name: 'item_code', label: 'Item code' },
      { name: 'category', label: 'Category' },
      { name: 'unit', label: 'Unit' },
      { name: 'reorder_level', label: 'Reorder level', type: 'number' },
    ],
    map: (row) => [row.name, row.item_code, row.category, row.unit, row.reorder_level, row.is_active ? 'Active' : 'Inactive'],
  },
  Reports: {
    table: 'report_runs',
    select: 'id, report_type, period_start, period_end, status, created_at',
    eyebrow: 'INSIGHTS & REPORTS',
    description: 'Request and track organization reports.',
    columns: ['Report', 'Period start', 'Period end', 'Status', 'Requested'],
    fields: [
      { name: 'report_type', label: 'Report type', required: true },
      { name: 'period_start', label: 'Period start', type: 'date' },
      { name: 'period_end', label: 'Period end', type: 'date' },
    ],
    map: (row) => [row.report_type, row.period_start, row.period_end, row.status, row.created_at],
  },
  Alerts: {
    table: 'alerts',
    select: 'id, title, category, priority, due_at, status',
    eyebrow: 'ATTENTION NEEDED',
    description: 'Manage organization alerts and follow-up reminders.',
    columns: ['Alert', 'Category', 'Priority', 'Due', 'Status'],
    fields: [
      { name: 'title', label: 'Alert title', required: true },
      { name: 'category', label: 'Category', required: true },
      { name: 'priority', label: 'Priority', type: 'select', options: ['low', 'medium', 'high', 'urgent'] },
      { name: 'due_at', label: 'Due date', type: 'date' },
      { name: 'description', label: 'Description', type: 'textarea' },
    ],
    map: (row) => [row.title, row.category, row.priority, row.due_at, row.status],
  },
  Users: {
    table: 'organization_memberships',
    select: 'user_id, role, status, created_at',
    eyebrow: 'TEAM ACCESS',
    description: 'Organization membership and access roles.',
    columns: ['User ID', 'Role', 'Status', 'Joined'],
    map: (row) => [row.user_id, row.role, row.status, row.created_at],
  },
}

function Icon({ name, size = 18 }) {
  const common = { width: size, height: size, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true }
  const paths = {
    grid: <><rect x="3.5" y="3.5" width="7" height="7" rx="1.5" /><rect x="13.5" y="3.5" width="7" height="7" rx="1.5" /><rect x="3.5" y="13.5" width="7" height="7" rx="1.5" /><rect x="13.5" y="13.5" width="7" height="7" rx="1.5" /></>,
    sparkles: <><path d="m12 3 1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8L12 3Z" /><path d="m19 14 .9 2.1L22 17l-2.1.9L19 20l-.9-2.1L16 17l2.1-.9L19 14Z" /></>,
    users: <><path d="M16 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="10" cy="7" r="4" /><path d="M20 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" /></>,
    family: <><circle cx="9" cy="7" r="3" /><circle cx="17" cy="8" r="2.5" /><path d="M3.5 20v-1.5A4.5 4.5 0 0 1 8 14h2a4.5 4.5 0 0 1 4.5 4.5V20ZM15 14.5a4 4 0 0 1 5.5 3.7V20h-3" /></>,
    qr: <><rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" /><rect x="3" y="14" width="7" height="7" rx="1" /><path d="M14 14h3v3h-3zM20 14v2M14 20h2M20 19v2M19 17h2" /></>,
    shield: <><path d="M12 22s8-4 8-11V5l-8-3-8 3v6c0 7 8 11 8 11Z" /><path d="m9 12 2 2 4-4" /></>,
    box: <><path d="m12 3 9 5-9 5-9-5 9-5Z" /><path d="M3 8v9l9 5 9-5V8M12 13v9M7.5 5.5l9 5" /></>,
    arrow: <><path d="M7 7h10a4 4 0 0 1 0 8h-1" /><path d="m10 4-3 3 3 3M17 20l3-3-3-3" /><path d="M17 17H7a4 4 0 0 1 0-8h1" /></>,
    chart: <><path d="M3 3v18h18" /><path d="m19 9-5 5-4-4-5 5" /></>,
    bell: <><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4" /></>,
    user: <><circle cx="12" cy="8" r="4" /><path d="M5 21v-2a7 7 0 0 1 14 0v2" /></>,
    search: <><circle cx="10.8" cy="10.8" r="6.3" /><path d="m16 16 4.3 4.3" /></>,
    plus: <><path d="M12 5v14M5 12h14" /></>,
    chevron: <path d="m9 18 6-6-6-6" />,
    clock: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
    calendar: <><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M16 3v4M8 3v4M3 10h18" /></>,
    close: <><path d="m18 6-12 12M6 6l12 12" /></>,
    menu: <><path d="M4 6h16M4 12h16M4 18h16" /></>,
    arrowUp: <><path d="m7 14 5-5 5 5" /><path d="M12 9v10" /></>,
  }
  return <svg {...common}>{paths[name] || paths.grid}</svg>
}

function Avatar({ initials, color = 'mint', small = false }) {
  return <span className={`avatar avatar-${color}${small ? ' avatar-small' : ''}`}>{initials}</span>
}

function StatusPill({ children }) {
  const text = String(children).toLowerCase()
  const kind = text.includes('active') || text.includes('issued') || text.includes('in stock') || text.includes('completed') || text.includes('ready') ? 'good' : text.includes('low') || text.includes('high') || text.includes('review') || text.includes('due') || text.includes('awaiting') ? 'warning' : 'neutral'
  return <span className={`status-pill status-${kind}`}><span />{children}</span>
}

function AuthFrame({ children }) {
  return (
    <main className="auth-page">
      <section className="auth-card">
        <a className="brand auth-brand" href="#" onClick={(event) => event.preventDefault()}>
          <span className="brand-mark"><Icon name="shield" size={21} /></span>
          <span className="brand-copy"><strong>care<span>circle</span></strong><small>COMMUNITY HEALTH</small></span>
        </a>
        {children}
      </section>
    </main>
  )
}

function App() {
  const [active, setActive] = useState('Dashboard')
  const [query, setQuery] = useState('')
  const [showNotifications, setShowNotifications] = useState(false)
  const [mobileNav, setMobileNav] = useState(false)
  const [chatInput, setChatInput] = useState('')
  const [messages, setMessages] = useState([{ from: 'assistant', text: 'I can help you navigate the workspaces. Choose a section from the sidebar to get started.' }])
  const [patientModal, setPatientModal] = useState(false)
  const [patientEditingRecord, setPatientEditingRecord] = useState(null)
  const [recordModal, setRecordModal] = useState(false)
  const [editingRecord, setEditingRecord] = useState(null)
  const [workspaceData, setWorkspaceData] = useState({})
  const [isSavingRecord, setIsSavingRecord] = useState(false)
  const [recordError, setRecordError] = useState('')
  const [databaseStatus, setDatabaseStatus] = useState(supabaseConfigured ? 'connecting' : 'configuration-error')
  const [databaseMessage, setDatabaseMessage] = useState(supabaseConfigurationError)
  const [session, setSession] = useState(null)
  const [authLoading, setAuthLoading] = useState(supabaseConfigured)
  const [authError, setAuthError] = useState('')
  const [authMode, setAuthMode] = useState(() => {
    const portal = new URLSearchParams(window.location.search).get('portal')
    return portal === 'client' || portal === 'staff' ? portal : 'public'
  })
  const [accountType, setAccountType] = useState('unknown')
  const [clientProfile, setClientProfile] = useState(null)
  const [organizations, setOrganizations] = useState([])
  const [organizationId, setOrganizationId] = useState('')
  const [communities, setCommunities] = useState([])
  const [facilities, setFacilities] = useState([])
  const [toast, setToast] = useState('')

  const patientList = useMemo(() => (workspaceData.patients ?? []).map(patientFromRow), [workspaceData.patients])
  const matchingPatients = useMemo(() => patientList.filter((patient) => Object.values(patient).some((value) => String(value).toLowerCase().includes(query.toLowerCase()))), [patientList, query])
  const activeModule = workspaceConfig[active]
  const activeRows = workspaceData[activeModule?.table] ?? []
  const patientOptions = workspaceData.patients ?? []

  const loadOrganizationData = useCallback(async (isCurrent = () => true) => {
    if (!supabase || !organizationId) return
    const [patientResult, communityResult, facilityResult, ...moduleResults] = await Promise.all([
      supabase.from('patients')
        .select('id, patient_number, full_name, birth_date, sex, care_program, status, initials, avatar_color, community:communities(name)')
        .eq('organization_id', organizationId)
        .order('created_at', { ascending: false }),
      supabase.from('communities')
        .select('id, name')
        .eq('organization_id', organizationId)
        .eq('is_active', true)
        .order('name'),
      supabase.from('facilities')
        .select('id, name')
        .eq('organization_id', organizationId)
        .eq('is_active', true)
        .order('name'),
      ...Object.values(workspaceConfig).map(({ table, select, order = 'created_at' }) => supabase.from(table)
        .select(select)
        .eq('organization_id', organizationId)
        .order(order, { ascending: false })),
    ])
    const results = [patientResult, communityResult, facilityResult, ...moduleResults]
    const failedResult = results.find((result) => result.error)
    if (failedResult?.error) throw failedResult.error
    if (!isCurrent()) return
    const nextData = { patients: patientResult.data ?? [] }
    Object.values(workspaceConfig).forEach(({ table }, index) => {
      nextData[table] = moduleResults[index].data ?? []
    })
    setWorkspaceData(nextData)
    setCommunities(communityResult.data ?? [])
    setFacilities(facilityResult.data ?? [])
    setDatabaseStatus('connected')
    setDatabaseMessage('')
  }, [organizationId])

  useEffect(() => {
    if (!supabaseConfigured || !supabase) return undefined

    let cancelled = false
    supabase.auth.getSession().then(({ data, error }) => {
      if (cancelled) return
      if (error) {
        setAuthError(`Could not restore your sign-in: ${error.message}`)
        setAuthLoading(false)
        return
      }
      setSession(data.session)
      setDatabaseStatus(data.session ? 'connecting' : 'authentication-required')
      setAuthLoading(false)
    }).catch((error) => {
      if (cancelled) return
      setAuthError(`Could not restore your sign-in: ${error instanceof Error ? error.message : 'Unknown authentication error.'}`)
      setAuthLoading(false)
    })
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession)
      setDatabaseStatus(nextSession ? 'connecting' : 'authentication-required')
      setAuthLoading(false)
      setAuthError('')
      if (!nextSession) {
        setAccountType('unknown')
        setClientProfile(null)
        setOrganizations([])
        setOrganizationId('')
        setCommunities([])
        setFacilities([])
        setWorkspaceData({})
      }
    })

    return () => {
      cancelled = true
      subscription.unsubscribe()
    }
  }, [])

  useEffect(() => {
    if (!supabaseConfigured || !supabase || authLoading || !session || authMode === 'public') return undefined
    let cancelled = false
    async function identifyAccount() {
      const { data, error } = await supabase.rpc('my_organizations')
      if (cancelled) return
      if (error) {
        setDatabaseStatus('error')
        setDatabaseMessage(`Could not load your organization access: ${error.message}`)
        return
      }
      const rows = data ?? []
      if (authMode === 'client') {
        if (rows.length) {
          setAccountType('client-blocked')
          setDatabaseStatus('authentication-required')
          return
        }
        const { data: profile, error: profileError } = await supabase.from('client_profiles')
          .select('id, full_name, email, phone, address, birth_date, email_notifications, status')
          .maybeSingle()
        if (cancelled) return
        if (profileError) {
          setDatabaseStatus('error')
          setDatabaseMessage(`Could not load your client profile: ${profileError.message}`)
          return
        }
        setClientProfile(profile)
        setAccountType(profile ? profile.status === 'active' ? 'client' : 'client-inactive' : 'client-registration')
        setDatabaseStatus('connected')
        return
      }
      setOrganizations(rows)
      if (rows.length === 0) {
        setOrganizationId('')
        setDatabaseStatus('no-organization')
        setAccountType('staff')
        return
      }
      setAccountType('staff')
      setOrganizationId((current) => rows.some((organization) => organization.organization_id === current)
        ? current
        : rows[0].organization_id)
    }
    identifyAccount().catch((error) => {
      if (cancelled) return
      setDatabaseStatus('error')
      setDatabaseMessage(`Could not load your organization access: ${error instanceof Error ? error.message : 'Unknown connection error.'}`)
    })
    return () => {
      cancelled = true
    }
  }, [session, authLoading, authMode])

  useEffect(() => {
    if (!supabaseConfigured || !supabase || !session || !organizationId) return undefined

    let cancelled = false
    Promise.resolve().then(() => loadOrganizationData(() => !cancelled)).catch((error) => {
      if (cancelled) return
      setDatabaseStatus('error')
      setDatabaseMessage(`Could not load organization data: ${error instanceof Error ? error.message : 'Unknown connection error.'}`)
    })
    return () => {
      cancelled = true
    }
  }, [loadOrganizationData, organizationId, session])

  function navigate(label) {
    setActive(label)
    setMobileNav(false)
    setQuery('')
    setRecordModal(false)
    setPatientModal(false)
    setEditingRecord(null)
    setPatientEditingRecord(null)
  }

  async function submitPatient(event) {
    event.preventDefault()
    if (!supabase || !organizationId || databaseStatus !== 'connected') return
    const formData = new FormData(event.currentTarget)
    const name = String(formData.get('full_name') ?? '').trim()
    if (!name) return
    const initials = name.split(/\s+/).slice(0, 2).map((part) => part[0]).join('').toUpperCase()
    const record = {
      organization_id: organizationId,
      full_name: name,
      birth_date: formData.get('birth_date') || null,
      sex: formData.get('sex') || null,
      community_id: formData.get('community_id') || null,
      care_program: String(formData.get('care_program') || 'General care').trim(),
      initials,
    }
    setIsSavingRecord(true)
    setRecordError('')
    try {
      const result = patientEditingRecord
        ? await supabase.from('patients').update(record).eq('id', patientEditingRecord.id).eq('organization_id', organizationId).select('id').maybeSingle()
        : await supabase.from('patients').insert(record)
      if (result.error) throw result.error
      if (patientEditingRecord && !result.data) throw new Error('Patient was not updated. Confirm your organization access and try again.')
      await loadOrganizationData()
      setPatientModal(false)
      setPatientEditingRecord(null)
      setToast(patientEditingRecord ? 'Patient updated in Supabase' : 'Patient saved to Supabase')
      window.setTimeout(() => setToast(''), 3200)
    } catch (error) {
      setRecordError(`Could not save patient: ${error instanceof Error ? error.message : 'Unknown database error.'}`)
    } finally {
      setIsSavingRecord(false)
    }
  }

  async function submitWorkspaceRecord(event) {
    event.preventDefault()
    if (!supabase || !organizationId || !activeModule || databaseStatus !== 'connected') return
    const formData = new FormData(event.currentTarget)
    const record = { organization_id: organizationId }
    for (const field of activeModule.fields ?? []) {
      const value = formData.get(field.name)
      if (value === null || value === '') {
        if (editingRecord) record[field.name] = null
        continue
      }
      record[field.name] = field.type === 'number' ? Number(value) : value
    }
    setIsSavingRecord(true)
    setRecordError('')
    try {
      const result = editingRecord
        ? await supabase.from(activeModule.table).update(record).eq('id', editingRecord.id).eq('organization_id', organizationId).select('id').maybeSingle()
        : await supabase.from(activeModule.table).insert(record)
      if (result.error) throw result.error
      if (editingRecord && !result.data) throw new Error('Record was not updated. Confirm your organization access and try again.')
      await loadOrganizationData()
      setRecordModal(false)
      setEditingRecord(null)
      setToast(editingRecord ? 'Record updated in Supabase' : `${active.slice(0, -1) || active} saved to Supabase`)
      window.setTimeout(() => setToast(''), 3200)
    } catch (error) {
      setRecordError(`Could not save record: ${error instanceof Error ? error.message : 'Unknown database error.'}`)
    } finally {
      setIsSavingRecord(false)
    }
  }

  function openRecordModal() {
    setRecordError('')
    if (active === 'Patients') {
      setPatientEditingRecord(null)
      setPatientModal(true)
    } else {
      setEditingRecord(null)
      setRecordModal(true)
    }
  }

  function editRecord(record) {
    setRecordError('')
    setEditingRecord(record)
  }

  async function deleteRecord(record) {
    if (!supabase || !activeModule || !window.confirm('Delete this record? This cannot be undone.')) return
    setRecordError('')
    try {
      const { data, error } = await supabase.from(activeModule.table).delete()
        .eq('id', record.id)
        .eq('organization_id', organizationId)
        .select('id').maybeSingle()
      if (error) throw error
      if (!data) throw new Error('Record was not deleted. Confirm your organization access and try again.')
      await loadOrganizationData()
      setToast('Record deleted from Supabase')
      window.setTimeout(() => setToast(''), 3200)
    } catch (error) {
      setRecordError(`Could not delete record: ${error instanceof Error ? error.message : 'Unknown database error.'}`)
    }
  }

  async function deletePatient(patient) {
    if (!supabase || !window.confirm(`Delete the patient record for ${patient.name}? This cannot be undone.`)) return
    setRecordError('')
    try {
      const { data, error } = await supabase.from('patients').delete()
        .eq('id', patient.databaseId)
        .eq('organization_id', organizationId)
        .select('id').maybeSingle()
      if (error) throw error
      if (!data) throw new Error('Patient was not deleted. Confirm your organization access and try again.')
      await loadOrganizationData()
      setToast('Patient deleted from Supabase')
      window.setTimeout(() => setToast(''), 3200)
    } catch (error) {
      setRecordError(`Could not delete patient: ${error instanceof Error ? error.message : 'Unknown database error.'}`)
    }
  }

  function editPatient(databaseId) {
    const patient = workspaceData.patients?.find((record) => record.id === databaseId)
    if (!patient) return
    setPatientEditingRecord(patient)
    setRecordError('')
  }

  function sendMessage(event) {
    event.preventDefault()
    const text = chatInput.trim()
    if (!text) return
    const question = text.toLowerCase()
    const destination = navigation.find((item) => question.includes(item.label.toLowerCase()))
    const response = destination
      ? `Open ${destination.label} from the sidebar to view its organization records.`
      : 'I can help you find a workspace. Use the sidebar to open patients, families, vaccination, inventory, reports, alerts, services, or users.'
    setMessages((current) => [...current, { from: 'user', text }, { from: 'assistant', text: response }])
    setChatInput('')
  }

  function handlePrimaryAction() {
    openRecordModal()
  }

  async function signIn(email, password) {
    if (!supabase) throw new Error('Supabase is not configured.')
    setAuthMode('staff')
    setAccountType('unknown')
    setAuthError('')
    window.history.replaceState({}, '', `${window.location.pathname}?portal=staff`)
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) throw error
  }

  function beginClientSignIn() {
    setAuthMode('client')
    setAccountType('unknown')
    window.history.replaceState({}, '', `${window.location.pathname}?portal=client`)
  }

  async function completeClientProfile() {
    const { data, error } = await supabase.from('client_profiles')
      .select('id, full_name, email, phone, address, birth_date, email_notifications, status')
      .single()
    if (error) throw error
    setClientProfile(data)
    setAccountType('client')
    setDatabaseStatus('connected')
  }

  async function reloadClientProfile() {
    const { data, error } = await supabase.from('client_profiles')
      .select('id, full_name, email, phone, address, birth_date, email_notifications, status')
      .single()
    if (error) throw error
    setClientProfile(data)
  }

  async function signOut() {
    if (!supabase) return
    try {
      const { error } = await supabase.auth.signOut()
      if (error) {
        setAuthError(`Could not sign out: ${error.message}`)
        setToast(`Could not sign out: ${error.message}`)
      }
      else {
        setAccountType('unknown')
        setClientProfile(null)
        setAuthMode('public')
        window.history.replaceState({}, '', window.location.pathname)
      }
    } catch (error) {
      setAuthError(`Could not sign out: ${error instanceof Error ? error.message : 'Unknown authentication error.'}`)
      setToast(`Could not sign out: ${error instanceof Error ? error.message : 'Unknown authentication error.'}`)
    }
  }

  if (!supabaseConfigured) {
    return <ClientPortal />
  }

  if (authMode !== 'staff') {
    return <ClientPortal onStaffLogin={signIn} onClientAuthStart={beginClientSignIn} />
  }

  if (authLoading) {
    return <AuthFrame><p>Restoring your secure session…</p></AuthFrame>
  }
  if (!session) {
    return <ClientPortal onStaffLogin={signIn} onClientAuthStart={beginClientSignIn} initialAuthError={authError} />
  }
  if (accountType === 'client' || accountType === 'client-registration') {
    return <ClientPortal mode={accountType === 'client' ? 'client' : 'client-setup'} profile={clientProfile} onProfileCreated={completeClientProfile} onNotificationChange={reloadClientProfile} onSignOut={signOut} />
  }
  if (accountType === 'client-inactive') {
    return <AuthFrame><div className="eyebrow">CLIENT ACCOUNT</div><h1>Account inactive</h1><p className="auth-description">Please contact your clinic to restore access to your client portal.</p><button className="auth-link" type="button" onClick={signOut}>Sign out</button></AuthFrame>
  }
  if (accountType === 'client-blocked') {
    return <AuthFrame><div className="eyebrow">STAFF ACCOUNT</div><h1>Use staff sign-in</h1><p className="auth-description">Staff accounts cannot use client email sign-in. Sign out, then use the password login from the staff login button.</p><button className="auth-link" type="button" onClick={signOut}>Sign out</button></AuthFrame>
  }
  if ((accountType === 'unknown' && databaseStatus !== 'error') || databaseStatus === 'connecting' || databaseStatus === 'authentication-required' || (!organizationId && databaseStatus !== 'no-organization' && databaseStatus !== 'error')) {
    return <AuthFrame><p>Loading your organization data…</p></AuthFrame>
  }
  if (databaseStatus === 'no-organization') {
    return <AuthFrame>
      <div className="eyebrow">STAFF ACCESS</div>
      <h1>No organization access</h1>
      <p className="auth-description">Ask your organization head to create or invite your staff account and assign the correct organization role in Supabase.</p>
      <button className="auth-link" type="button" onClick={signOut}>Sign out</button>
    </AuthFrame>
  }
  if (databaseStatus === 'error') {
    return <AuthFrame>
      <div className="eyebrow">WORKSPACE UNAVAILABLE</div>
      <h1>Could not load your data</h1>
      <p className="auth-error" role="alert">{databaseMessage}</p>
      <p className="auth-description">Confirm that the database schema has been applied and your account has active organization access.</p>
      <button className="auth-link" type="button" onClick={signOut}>Sign out</button>
    </AuthFrame>
  }

  const databaseBannerText = databaseStatus === 'connected'
    ? 'Supabase connected · Workspace records are scoped to the selected organization.'
    : databaseStatus === 'connecting'
      ? 'Connecting to Supabase…'
      : databaseStatus === 'error'
        ? databaseMessage
        : databaseStatus === 'configuration-error'
          ? supabaseConfigurationError
          : 'Connect Supabase to load your organization records.'
  const memberRole = organizations.find((organization) => organization.organization_id === organizationId)?.member_role
  const canManageActiveModule = active === 'Patients'
    ? ['owner', 'admin', 'clinician', 'health_worker'].includes(memberRole)
    : activeModule && (
      activeModule.table === 'inventory_items'
        ? ['owner', 'admin', 'inventory_manager'].includes(memberRole)
        : activeModule.table === 'report_runs'
          ? ['owner', 'admin'].includes(memberRole)
          : ['owner', 'admin', 'clinician', 'health_worker'].includes(memberRole)
    )
  const canDeleteActiveModule = ['owner', 'admin'].includes(memberRole)

  return (
    <div className="app-shell">
      <aside className={`sidebar${mobileNav ? ' sidebar-open' : ''}`}>
        <a className="brand" href="#" onClick={(event) => { event.preventDefault(); navigate('Dashboard') }}>
          <span className="brand-mark"><Icon name="shield" size={21} /></span>
          <span className="brand-copy"><strong>care<span>circle</span></strong><small>COMMUNITY HEALTH</small></span>
        </a>
        <div className="workspace-label">WORKSPACE</div>
        <nav className="side-nav" aria-label="Main navigation">
          {navigation.map((item) => (
            <button key={item.label} type="button" className={`nav-item${active === item.label ? ' nav-active' : ''}`} onClick={() => navigate(item.label)}>
              <Icon name={item.icon} size={18} /><span>{item.label}</span>
              {item.badge && <span className="nav-badge">{item.badge}</span>}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="help-card"><div className="help-icon"><Icon name="sparkles" size={16} /></div><strong>Need a hand?</strong><p>Visit the help center for tips and guides.</p><button type="button" onClick={() => navigate('AI Assistant')}>Get support <Icon name="chevron" size={14} /></button></div>
          <button className="profile-button" type="button" onClick={() => navigate('Users')}><Avatar initials={session?.user?.email?.slice(0, 2).toUpperCase() ?? 'U'} color="mint" small /><span className="profile-copy"><strong>{session?.user?.email}</strong><small>{organizations.find((organization) => organization.organization_id === organizationId)?.member_role}</small></span><span className="profile-dots">···</span></button>
        </div>
      </aside>

      <main className="main-area">
        <header className="topbar">
          <button className="mobile-menu icon-button" aria-label="Open navigation" type="button" onClick={() => setMobileNav(!mobileNav)}><Icon name="menu" /></button>
          <div className="breadcrumbs"><span>Workspace</span><Icon name="chevron" size={14} /><strong>{active}</strong></div>
          <div className="topbar-actions">
            <label className="search-box"><Icon name="search" size={17} /><input aria-label={`Search ${active.toLowerCase()}`} placeholder="Search records..." value={query} onChange={(event) => setQuery(event.target.value)} /><kbd>⌘ K</kbd></label>
            <div className="notification-wrap">
              <button className={`icon-button notification-button${showNotifications ? ' icon-button-active' : ''}`} type="button" aria-label="Show notifications" onClick={() => setShowNotifications(!showNotifications)}><Icon name="bell" size={19} />{(workspaceData.alerts ?? []).some((alert) => alert.status === 'open') && <span className="notification-dot" />}</button>
              {showNotifications && <div className="notification-popover"><div className="popover-heading"><strong>Open alerts</strong><span>{(workspaceData.alerts ?? []).filter((alert) => alert.status === 'open').length}</span></div>{(workspaceData.alerts ?? []).filter((alert) => alert.status === 'open').slice(0, 5).map((alert) => <p key={alert.id}><b>{alert.title}</b><br />{alert.category} · {alert.priority}</p>)}{!(workspaceData.alerts ?? []).some((alert) => alert.status === 'open') && <p>No open alerts.</p>}</div>}
            </div>
            <span className="topbar-divider" />
            {supabaseConfigured && organizations.length > 1 && <select className="organization-switcher" aria-label="Select organization" value={organizationId} onChange={(event) => { setDatabaseStatus('connecting'); setWorkspaceData({}); setCommunities([]); setFacilities([]); setRecordModal(false); setPatientModal(false); setEditingRecord(null); setPatientEditingRecord(null); setOrganizationId(event.target.value) }}>{organizations.map((organization) => <option key={organization.organization_id} value={organization.organization_id}>{organization.organization_name}</option>)}</select>}
            <button className="secondary-button client-portal-switch" type="button" onClick={signOut}>Client portal</button>
            {supabaseConfigured ? <button className="sign-out-button" type="button" onClick={signOut}>Sign out</button> : <Avatar initials="EW" color="mint" small />}
          </div>
        </header>

        <div className={`database-banner database-${databaseStatus}`} role={databaseStatus === 'error' || databaseStatus === 'configuration-error' ? 'alert' : 'status'}><span className="database-indicator" />{databaseBannerText}</div>
        <div className="page-content">
          {active === 'Dashboard' && <>
            <div className="welcome-row"><div><div className="eyebrow">ORGANIZATION OVERVIEW</div><h1>{organizations.find((organization) => organization.organization_id === organizationId)?.organization_name ?? 'Workspace'}</h1><p className="page-subtitle">Live records from your selected organization.</p></div><button className="primary-button" type="button" onClick={() => navigate('Patients')}><Icon name="users" size={17} /> View patients</button></div>
            <section className="stats-grid" aria-label="Organization records">
              {[['Patients', patientList.length], ['Families', (workspaceData.families ?? []).length], ['Open alerts', (workspaceData.alerts ?? []).filter((row) => row.status === 'open').length]].map(([label, count]) => <article className="stat-card" key={label}><p>{label}</p><strong>{count.toLocaleString()}</strong></article>)}
            </section>
            <section className="connected-overview"><h2>Your organization data</h2><p>Records entered in each workspace are saved in Supabase and protected by organization-level access policies.</p></section>
          </>}

          {active === 'Services & Queue' && <Suspense fallback={<p className="page-subtitle">Loading service tools…</p>}><ServicesWorkspace organizationId={organizationId} facilities={facilities} memberRole={organizations.find((organization) => organization.organization_id === organizationId)?.member_role} /></Suspense>}

          {active === 'Patients' && <><div className="welcome-row"><div><div className="eyebrow">PATIENT DIRECTORY</div><h1>Patients</h1><p className="page-subtitle">Manage and follow up with people in your community.</p></div>{canManageActiveModule && <button className="primary-button" type="button" onClick={openRecordModal}><Icon name="plus" size={17} /> Add a patient</button>}</div><div className="module-stats"><div className="module-stat"><span>Total patients</span><strong>{patientList.length.toLocaleString()}</strong><small>In this organization</small></div></div>{recordError && <p className="auth-error" role="alert">{recordError}</p>}<PatientTable patients={matchingPatients} query={query} canManage={canManageActiveModule} canDelete={canDeleteActiveModule} onEdit={editPatient} onDelete={deletePatient} /></>}

          {active === 'AI Assistant' && <><div className="welcome-row"><div><div className="eyebrow">WORKSPACE SUPPORT</div><h1>Workspace helper</h1><p className="page-subtitle">Navigation support only; this screen does not use an AI service.</p></div></div><div className="assistant-layout"><section className="panel chat-panel"><div className="chat-header"><span className="assistant-avatar"><Icon name="sparkles" size={20} /></span><div><strong>CareCircle workspace helper</strong><small>Navigation support</small></div></div><div className="chat-messages">{messages.map((message, index) => <div className={`chat-message message-${message.from}`} key={`${message.from}-${index}`}><p>{message.text}</p></div>)}</div><div className="suggestions"><span>Try asking</span>{['Open patients', 'Open inventory'].map((suggestion) => <button type="button" key={suggestion} onClick={() => setChatInput(suggestion)}>{suggestion}</button>)}</div><form className="chat-form" onSubmit={sendMessage}><input aria-label="Message the workspace helper" placeholder="Ask where to find a workspace..." value={chatInput} onChange={(event) => setChatInput(event.target.value)} /><button aria-label="Send message" type="submit"><Icon name="arrowUp" size={17} /></button></form></section></div></>}

          {activeModule && <><div className="welcome-row"><div><div className="eyebrow">{activeModule.eyebrow}</div><h1>{active}</h1><p className="page-subtitle">{activeModule.description}</p></div>{activeModule.fields && canManageActiveModule && <button className="primary-button" type="button" onClick={handlePrimaryAction}><Icon name="plus" size={17} />{active === 'Reports' ? 'Request report' : `Add ${active === 'Families' ? 'a family' : active === 'Inventory' ? 'an item' : active === 'Alerts' ? 'an alert' : 'record'}`}</button>}</div><div className="module-stats"><div className="module-stat"><span>Total records</span><strong>{activeRows.length.toLocaleString()}</strong><small>In this organization</small></div></div>{!activeModule.fields && <div className="form-note">Invite and manage accounts from Supabase Authentication. This screen shows organization memberships only.</div>}{recordError && <p className="auth-error" role="alert">{recordError}</p>}<ModuleTable module={activeModule} rows={activeRows} query={query} canManage={canManageActiveModule} canDelete={canDeleteActiveModule} onEdit={editRecord} onDelete={deleteRecord} /></>}
        </div>
      </main>

      {mobileNav && <button className="mobile-scrim" type="button" aria-label="Close navigation" onClick={() => setMobileNav(false)} />}
      {patientModal && <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setPatientModal(false) }}><section className="modal" role="dialog" aria-modal="true" aria-labelledby="patient-modal-title"><div className="modal-heading"><div><div className="eyebrow">PATIENT DIRECTORY</div><h2 id="patient-modal-title">Add a patient</h2></div><button className="icon-button" type="button" aria-label="Close dialog" onClick={() => setPatientModal(false)}><Icon name="close" /></button></div><p className="modal-description">Create a patient record in this organization.</p><form className="patient-form" onSubmit={submitPatient}><label>Full name<input autoFocus required name="full_name" maxLength={120} placeholder="Enter full name" /></label><label>Date of birth<input name="birth_date" type="date" /></label><label>Sex<select name="sex" defaultValue=""><option value="">Not recorded</option><option value="female">Female</option><option value="male">Male</option><option value="intersex">Intersex</option><option value="unknown">Unknown</option><option value="not_recorded">Not recorded</option></select></label><label>Community<select name="community_id" defaultValue=""><option value="">No community</option>{communities.map((community) => <option key={community.id} value={community.id}>{community.name}</option>)}</select></label><label>Care program<input name="care_program" maxLength={120} defaultValue="General care" /></label>{recordError && <p className="auth-error" role="alert">{recordError}</p>}<div className="form-note"><Icon name="shield" size={15} />Patient records are stored in your organization’s Supabase database.</div><div className="modal-actions"><button className="secondary-button" type="button" onClick={() => setPatientModal(false)}>Cancel</button><button className="primary-button" type="submit" disabled={isSavingRecord || databaseStatus !== 'connected'}><Icon name="plus" size={16} />{isSavingRecord ? 'Saving…' : 'Create patient'}</button></div></form></section></div>}
      {recordModal && activeModule?.fields && <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setRecordModal(false) }}><section className="modal" role="dialog" aria-modal="true" aria-labelledby="record-modal-title"><div className="modal-heading"><div><div className="eyebrow">{activeModule.eyebrow}</div><h2 id="record-modal-title">Add {active.toLowerCase()} record</h2></div><button className="icon-button" type="button" aria-label="Close dialog" onClick={() => setRecordModal(false)}><Icon name="close" /></button></div><p className="modal-description">This record will be saved to the selected organization.</p><form className="patient-form" onSubmit={submitWorkspaceRecord}>{activeModule.fields.map((field) => { const options = field.source === 'communities' ? communities.map((item) => ({ id: item.id, label: item.name })) : field.source === 'patients' ? patientOptions.map((item) => ({ id: item.id, label: item.full_name })) : facilities.map((item) => ({ id: item.id, label: item.name })); return <label key={field.name}>{field.label}{field.type === 'select' ? <select name={field.name} required={field.required} defaultValue=""><option value="">Select {field.label.toLowerCase()}</option>{(field.options ?? options.map((item) => item.label)).map((item, index) => <option key={field.options ? item : options[index].id} value={field.options ? item : options[index].id}>{item}</option>)}</select> : field.type === 'textarea' ? <textarea name={field.name} required={field.required} rows="3" /> : <input name={field.name} type={field.type ?? 'text'} required={field.required} min={field.type === 'number' ? 0 : undefined} />}</label> })}{recordError && <p className="auth-error" role="alert">{recordError}</p>}{active === 'Reports' && <p className="form-note">Report requests are recorded in Supabase; file generation is not configured.</p>}<div className="modal-actions"><button className="secondary-button" type="button" onClick={() => setRecordModal(false)}>Cancel</button><button className="primary-button" type="submit" disabled={isSavingRecord || databaseStatus !== 'connected'}>{isSavingRecord ? 'Saving…' : 'Save record'}</button></div></form></section></div>}
      {patientEditingRecord && <PatientEditModal patient={patientEditingRecord} communities={communities} saving={isSavingRecord} error={recordError} onSubmit={submitPatient} onClose={() => setPatientEditingRecord(null)} />}
      {editingRecord && activeModule?.fields && <WorkspaceRecordModal module={activeModule} record={editingRecord} communities={communities} patients={patientOptions} facilities={facilities} saving={isSavingRecord} error={recordError} onSubmit={submitWorkspaceRecord} onClose={() => setEditingRecord(null)} />}
      {toast && <div className="toast-message"><span>✓</span>{toast}</div>}
    </div>
  )
}

function formatCell(value) {
  if (value === null || value === undefined || value === '') return '—'
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(value)) return new Date(value).toLocaleString()
  return typeof value === 'string' ? value.replaceAll('_', ' ') : String(value)
}

function PatientTable({ patients: rows, query, canManage, canDelete, onEdit, onDelete }) {
  return <section className="panel data-panel"><div className="table-toolbar"><div><h2>Patients <span className="row-count">{rows.length}</span></h2><p>Patient records from this organization</p></div></div><div className="table-scroll"><table><thead><tr><th>Patient</th><th>Patient ID</th><th>Age / sex</th><th>Community</th><th>Care program</th><th>Status</th>{canManage && <th>Actions</th>}</tr></thead><tbody>{rows.map((patient) => <tr key={patient.databaseId}><td><div className="patient-cell"><Avatar initials={patient.initials} color={patient.color} small /><strong>{patient.name}</strong></div></td><td className="muted-cell">{patient.id}</td><td className="muted-cell">{patient.age}{patient.sex !== '—' ? ` · ${patient.sex}` : ''}</td><td>{patient.community}</td><td>{patient.program}</td><td><StatusPill>{patient.status}</StatusPill></td>{canManage && <td><div className="table-actions"><button className="secondary-button" type="button" onClick={() => onEdit(patient.databaseId)}>Edit</button>{canDelete && <button className="secondary-button danger-button" type="button" onClick={() => onDelete(patient)}>Delete</button>}</div></td>}</tr>)}</tbody></table>{rows.length === 0 && <div className="empty-state">{query ? `No patients match “${query}”.` : 'No patient records yet. Add your first patient to get started.'}</div>}</div><div className="table-footer">Showing <strong>{rows.length}</strong> of <strong>{rows.length}</strong> patients</div></section>
}

function ModuleTable({ module, rows, query, canManage, canDelete, onEdit, onDelete }) {
  const filteredRows = rows.filter((record) => module.map(record).some((cell) => formatCell(cell).toLowerCase().includes(query.toLowerCase())))
  return <section className="panel data-panel"><div className="table-toolbar"><div><h2>{activeTitle(module)} <span className="row-count">{filteredRows.length}</span></h2><p>Records from this organization</p></div></div><div className="table-scroll"><table><thead><tr>{module.columns.map((column) => <th key={column}>{column}</th>)}{canManage && module.fields && <th>Actions</th>}</tr></thead><tbody>{filteredRows.map((record, index) => <tr key={record.id ?? record.user_id ?? index}>{module.map(record).map((cell, cellIndex) => <td key={module.columns[cellIndex]}>{/status|priority/i.test(module.columns[cellIndex]) && cell ? <StatusPill>{formatCell(cell)}</StatusPill> : cellIndex === 0 ? <strong className="table-primary-text">{formatCell(cell)}</strong> : <span className="muted-cell">{formatCell(cell)}</span>}</td>)}{canManage && module.fields && <td><div className="table-actions"><button className="secondary-button" type="button" onClick={() => onEdit(record)}>Edit</button>{canDelete && <button className="secondary-button danger-button" type="button" onClick={() => onDelete(record)}>Delete</button>}</div></td>}</tr>)}</tbody></table>{filteredRows.length === 0 && <div className="empty-state">{query ? `No records match “${query}”.` : `No ${activeTitle(module).toLowerCase()} yet.`}</div>}</div><div className="table-footer">Showing <strong>{filteredRows.length}</strong> of <strong>{rows.length}</strong> records</div></section>
}

function PatientEditModal({ patient, communities, saving, error, onSubmit, onClose }) {
  return <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}><section className="modal" role="dialog" aria-modal="true" aria-labelledby="patient-edit-title"><div className="modal-heading"><div><div className="eyebrow">PATIENT DIRECTORY</div><h2 id="patient-edit-title">Edit patient</h2></div><button className="icon-button" type="button" aria-label="Close dialog" onClick={onClose}><Icon name="close" /></button></div><p className="modal-description">Update this patient record.</p><form className="patient-form" onSubmit={onSubmit}><label>Full name<input autoFocus required name="full_name" maxLength={120} defaultValue={patient.full_name} /></label><label>Date of birth<input name="birth_date" type="date" defaultValue={patient.birth_date ?? ''} /></label><label>Sex<select name="sex" defaultValue={patient.sex ?? ''}><option value="">Not recorded</option><option value="female">Female</option><option value="male">Male</option><option value="intersex">Intersex</option><option value="unknown">Unknown</option><option value="not_recorded">Not recorded</option></select></label><label>Community<select name="community_id" defaultValue={patient.community_id ?? ''}><option value="">No community</option>{communities.map((community) => <option key={community.id} value={community.id}>{community.name}</option>)}</select></label><label>Care program<input name="care_program" maxLength={120} defaultValue={patient.care_program ?? 'General care'} /></label>{error && <p className="auth-error" role="alert">{error}</p>}<div className="form-note"><Icon name="shield" size={15} />Patient information is stored in your organization’s Supabase database.</div><div className="modal-actions"><button className="secondary-button" type="button" onClick={onClose}>Cancel</button><button className="primary-button" type="submit" disabled={saving}>{saving ? 'Saving…' : 'Update patient'}</button></div></form></section></div>
}

function WorkspaceRecordModal({ module, record, communities, patients, facilities, saving, error, onSubmit, onClose }) {
  return <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}><section className="modal" role="dialog" aria-modal="true" aria-labelledby="record-edit-title"><div className="modal-heading"><div><div className="eyebrow">{module.eyebrow}</div><h2 id="record-edit-title">Edit {activeTitle(module).toLowerCase()}</h2></div><button className="icon-button" type="button" aria-label="Close dialog" onClick={onClose}><Icon name="close" /></button></div><p className="modal-description">Changes are saved to the selected organization.</p><form className="patient-form" onSubmit={onSubmit}>{module.fields.map((field) => {
    const options = field.source === 'communities'
      ? communities.map((item) => ({ id: item.id, label: item.name }))
      : field.source === 'patients'
        ? patients.map((item) => ({ id: item.id, label: item.full_name }))
        : facilities.map((item) => ({ id: item.id, label: item.name }))
    return <label key={field.name}>{field.label}{field.type === 'select'
      ? <select name={field.name} required={field.required} defaultValue={record[field.name] ?? ''}><option value="">Select {field.label.toLowerCase()}</option>{(field.options ?? options.map((item) => item.label)).map((item, index) => <option key={field.options ? item : options[index].id} value={field.options ? item : options[index].id}>{item}</option>)}</select>
      : field.type === 'textarea'
        ? <textarea name={field.name} required={field.required} rows="3" defaultValue={record[field.name] ?? ''} />
        : <input name={field.name} type={field.type ?? 'text'} required={field.required} min={field.type === 'number' ? 0 : undefined} defaultValue={record[field.name] ?? ''} />}</label>
  })}{error && <p className="auth-error" role="alert">{error}</p>}<div className="modal-actions"><button className="secondary-button" type="button" onClick={onClose}>Cancel</button><button className="primary-button" type="submit" disabled={saving}>{saving ? 'Saving…' : 'Update record'}</button></div></form></section></div>
}

function activeTitle(module) {
  if (module.eyebrow === 'TEAM ACCESS') return 'Team members'
  if (module.eyebrow === 'PATIENT IDENTIFICATION') return 'Issued IDs'
  return module.eyebrow === 'COMMUNITY CARE' ? 'Families' : module.eyebrow === 'IMMUNIZATION' ? 'Vaccination records' : module.eyebrow === 'SUPPLY MANAGEMENT' ? 'Inventory items' : module.eyebrow === 'INSIGHTS & REPORTS' ? 'Report requests' : 'Alerts'
}

export default App
