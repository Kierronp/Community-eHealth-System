import { useEffect, useMemo, useState } from 'react'
import './App.css'

const navigation = [
  { label: 'Dashboard', icon: 'grid' },
  { label: 'AI Assistant', icon: 'sparkles' },
  { label: 'Patients', icon: 'users' },
  { label: 'Families', icon: 'family' },
  { label: 'QR ID', icon: 'qr' },
  { label: 'Vaccination', icon: 'shield' },
  { label: 'Inventory', icon: 'box' },
  { label: 'Referrals', icon: 'arrow' },
  { label: 'Reports', icon: 'chart' },
  { label: 'Alerts', icon: 'bell', badge: '3' },
  { label: 'Users', icon: 'user' },
]

const patients = [
  { name: 'Amara Okafor', id: 'P-2048', age: '34', sex: 'Female', community: 'Northside', program: 'Maternal care', status: 'Active', initials: 'AO', color: 'lavender' },
  { name: 'Daniel Mensah', id: 'P-2047', age: '58', sex: 'Male', community: 'Riverside', program: 'Hypertension', status: 'Follow-up', initials: 'DM', color: 'blue' },
  { name: 'Grace Ndlovu', id: 'P-2046', age: '7', sex: 'Female', community: 'East Ward', program: 'Child wellness', status: 'Active', initials: 'GN', color: 'peach' },
  { name: 'Joseph Kamau', id: 'P-2045', age: '42', sex: 'Male', community: 'Hillview', program: 'Diabetes care', status: 'Review due', initials: 'JK', color: 'mint' },
  { name: 'Fatima Abdi', id: 'P-2044', age: '26', sex: 'Female', community: 'Northside', program: 'Antenatal care', status: 'Active', initials: 'FA', color: 'rose' },
]

function patientFromRow(row) {
  return {
    name: row.full_name,
    id: row.patient_id,
    age: row.age ?? '—',
    sex: row.sex ?? '—',
    community: row.community,
    program: row.program,
    status: row.status,
    initials: row.initials,
    color: row.avatar_color,
  }
}

const moduleDetails = {
  Families: {
    eyebrow: 'COMMUNITY CARE',
    description: 'Households and their linked patient records.',
    stats: [['Registered families', '428', '+12 this month'], ['Members', '1,206', 'Across 6 communities'], ['Home visits due', '18', 'This week']],
    columns: ['Family', 'Family ID', 'Community', 'Members', 'Last visit'],
    rows: [['The Okafor household', 'F-0108', 'Northside', '4 members', 'Oct 08, 2026'], ['Mensah family', 'F-0107', 'Riverside', '3 members', 'Oct 07, 2026'], ['Ndlovu household', 'F-0106', 'East Ward', '5 members', 'Oct 05, 2026'], ['Kamau family', 'F-0105', 'Hillview', '2 members', 'Oct 04, 2026']],
  },
  'QR ID': {
    eyebrow: 'PATIENT IDENTIFICATION',
    description: 'Find a patient record and prepare a community health ID.',
    stats: [['IDs issued', '1,084', '82% of registered patients'], ['Ready to print', '12', 'New this week'], ['Replacements', '6', 'Awaiting review']],
    columns: ['Patient', 'Patient ID', 'Community', 'ID status', 'Issued'],
    rows: [['Amara Okafor', 'P-2048', 'Northside', 'Ready', 'Oct 09, 2026'], ['Daniel Mensah', 'P-2047', 'Riverside', 'Issued', 'Oct 08, 2026'], ['Grace Ndlovu', 'P-2046', 'East Ward', 'Issued', 'Oct 07, 2026'], ['Joseph Kamau', 'P-2045', 'Hillview', 'Needs review', '—']],
  },
  Vaccination: {
    eyebrow: 'IMMUNIZATION',
    description: 'Track schedules, upcoming doses, and community coverage.',
    stats: [['Coverage', '87.4%', '+3.2% this quarter'], ['Doses this month', '246', 'Across 4 clinics'], ['Upcoming doses', '32', 'Next 7 days']],
    columns: ['Patient', 'Vaccine', 'Dose', 'Due date', 'Status'],
    rows: [['Grace Ndlovu', 'Measles (MCV1)', 'Dose 1', 'Oct 10, 2026', 'Due soon'], ['Amina Yusuf', 'Penta', 'Dose 3', 'Oct 11, 2026', 'Scheduled'], ['Peter Otieno', 'Polio (OPV)', 'Dose 2', 'Oct 12, 2026', 'Scheduled'], ['Lina Banda', 'Measles (MCV2)', 'Dose 2', 'Oct 14, 2026', 'Scheduled']],
  },
  Inventory: {
    eyebrow: 'SUPPLY MANAGEMENT',
    description: 'Keep track of essential medicines and clinic supplies.',
    stats: [['Items in stock', '184', 'Across 3 facilities'], ['Low stock', '8', 'Needs attention'], ['Expiring soon', '3', 'Within 30 days']],
    columns: ['Item', 'Category', 'Facility', 'Quantity', 'Stock status'],
    rows: [['Amoxicillin 250mg', 'Antibiotics', 'Northside Clinic', '24 packs', 'Low stock'], ['Malaria rapid tests', 'Diagnostics', 'Riverside Clinic', '120 kits', 'In stock'], ['Paracetamol 500mg', 'Essential medicines', 'East Ward Clinic', '18 packs', 'Low stock'], ['ORS sachets', 'Essential medicines', 'Northside Clinic', '340 sachets', 'In stock']],
  },
  Referrals: {
    eyebrow: 'CARE COORDINATION',
    description: 'Follow referrals from community outreach to facility care.',
    stats: [['Open referrals', '24', 'Across 5 facilities'], ['Completed this month', '38', '+8 from last month'], ['Awaiting follow-up', '9', 'Needs attention']],
    columns: ['Patient', 'Referred to', 'Reason', 'Referred on', 'Status'],
    rows: [['Daniel Mensah', 'Central Health Centre', 'Blood pressure review', 'Oct 08, 2026', 'Awaiting visit'], ['Joseph Kamau', 'County Hospital', 'Diabetes review', 'Oct 07, 2026', 'In progress'], ['Lina Banda', 'East Ward Clinic', 'Antenatal check', 'Oct 06, 2026', 'Completed'], ['Peter Otieno', 'Central Health Centre', 'Child wellness', 'Oct 04, 2026', 'Follow-up due']],
  },
  Reports: {
    eyebrow: 'INSIGHTS & REPORTS',
    description: 'A snapshot of community health activity and outcomes.',
    stats: [['Patients reached', '1,284', '+8.4% this quarter'], ['Visits completed', '936', 'This quarter'], ['Follow-ups on time', '78%', '+5% this month']],
    columns: ['Report', 'Category', 'Reporting period', 'Last updated', 'Format'],
    rows: [['Monthly patient summary', 'Patient care', 'September 2026', 'Oct 01, 2026', 'PDF'], ['Vaccination coverage', 'Immunization', 'Q3 2026', 'Oct 02, 2026', 'PDF'], ['Medicine stock report', 'Inventory', 'October 2026', 'Oct 09, 2026', 'CSV'], ['Referral outcomes', 'Care coordination', 'Q3 2026', 'Oct 03, 2026', 'PDF']],
  },
  Alerts: {
    eyebrow: 'ATTENTION NEEDED',
    description: 'Important reminders for your community health team.',
    stats: [['Open alerts', '3', 'Requires attention'], ['Resolved today', '8', 'Good work, team'], ['All alerts this month', '42', 'Across 6 communities']],
    columns: ['Alert', 'Related to', 'Community', 'Created', 'Priority'],
    rows: [['Low stock: Amoxicillin 250mg', 'Inventory', 'Northside', 'Today, 09:20', 'High'], ['Missed follow-up visit', 'Daniel Mensah · P-2047', 'Riverside', 'Today, 08:45', 'Medium'], ['Vaccine dose due in 2 days', 'Grace Ndlovu · P-2046', 'East Ward', 'Yesterday', 'Medium'], ['Referral confirmation received', 'Lina Banda · P-2038', 'East Ward', 'Oct 07, 2026', 'Resolved']],
  },
  Users: {
    eyebrow: 'TEAM ACCESS',
    description: 'Manage the people supporting your community health programs.',
    stats: [['Team members', '18', 'Across 4 roles'], ['Active today', '12', 'Of 18 members'], ['Invitations pending', '2', 'Awaiting response']],
    columns: ['Team member', 'Role', 'Community', 'Last active', 'Access'],
    rows: [['Esther Wanjiku', 'Community health worker', 'Northside', 'Today, 09:14', 'Active'], ['Samuel Boateng', 'Nurse', 'Riverside', 'Today, 08:52', 'Active'], ['Miriam Phiri', 'Program coordinator', 'All communities', 'Yesterday', 'Active'], ['David Osei', 'Community health worker', 'East Ward', 'Oct 07, 2026', 'Active']],
  },
}

const activities = [
  { icon: 'users', text: 'New patient registered', detail: 'Amara Okafor · Northside', time: '9:42 AM', color: 'mint' },
  { icon: 'shield', text: 'Vaccination completed', detail: 'Grace Ndlovu · MCV1', time: '9:18 AM', color: 'blue' },
  { icon: 'arrow', text: 'Referral updated', detail: 'Daniel Mensah · Riverside', time: '8:56 AM', color: 'peach' },
  { icon: 'box', text: 'Stock running low', detail: 'Amoxicillin 250mg · Northside', time: '8:30 AM', color: 'rose' },
]

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

function App() {
  const [active, setActive] = useState('Dashboard')
  const [query, setQuery] = useState('')
  const [showNotifications, setShowNotifications] = useState(false)
  const [mobileNav, setMobileNav] = useState(false)
  const [chatInput, setChatInput] = useState('')
  const [messages, setMessages] = useState([{ from: 'assistant', text: 'Hi Esther! I can help you find patient records, summarize your community activity, or navigate the system. What would you like to work on?' }])
  const [patientModal, setPatientModal] = useState(false)
  const [newPatient, setNewPatient] = useState({ name: '', community: 'Northside', program: 'General care' })
  const [patientList, setPatientList] = useState(patients)
  const [isSavingPatient, setIsSavingPatient] = useState(false)
  const [databaseStatus, setDatabaseStatus] = useState('connecting')
  const [databaseMessage, setDatabaseMessage] = useState('')
  const [toast, setToast] = useState('')

  const matchingPatients = useMemo(() => patientList.filter((patient) => Object.values(patient).some((value) => String(value).toLowerCase().includes(query.toLowerCase()))), [patientList, query])
  const activeModule = moduleDetails[active]

  useEffect(() => {
    let cancelled = false
    async function loadPatients() {
      try {
        const healthResponse = await fetch('/api/health')
        if (!healthResponse.ok) throw new Error(`API health check failed (${healthResponse.status}).`)
        const health = await healthResponse.json()
        if (cancelled) return
        if (!health.configured) {
          setDatabaseStatus('local')
          return
        }

        const patientsResponse = await fetch('/api/patients')
        const patientsResult = await patientsResponse.json()
        if (!patientsResponse.ok) throw new Error(patientsResult.error || `Could not load patients (${patientsResponse.status}).`)
        if (cancelled) return
        setPatientList(patientsResult.map(patientFromRow))
        setDatabaseStatus('connected')
        setDatabaseMessage('')
      } catch (error) {
        if (cancelled) return
        setDatabaseStatus('error')
        setDatabaseMessage(`Could not connect to the PostgreSQL API: ${error instanceof Error ? error.message : 'Unknown connection error.'}`)
      }
    }

    loadPatients()

    return () => {
      cancelled = true
    }
  }, [])

  function navigate(label) {
    setActive(label)
    setMobileNav(false)
    setQuery('')
  }

  async function submitPatient(event) {
    event.preventDefault()
    if (databaseStatus === 'connecting' || databaseStatus === 'error') return
    const name = newPatient.name.trim()
    if (!name) return
    const parts = name.split(/\s+/)
    const initials = parts.slice(0, 2).map((part) => part[0]).join('').toUpperCase()
    const nextId = patientList.reduce((highest, patient) => Math.max(highest, Number(patient.id.replace('P-', '')) || 0), 2048) + 1
    const record = { name, id: `P-${nextId}`, age: '—', sex: '—', community: newPatient.community, program: newPatient.program, status: 'Active', initials, color: 'mint' }
    if (databaseStatus === 'connected') {
      setIsSavingPatient(true)
      try {
        const response = await fetch('/api/patients', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            full_name: record.name,
            community: record.community,
            program: record.program,
          }),
        })
        const result = await response.json()
        if (!response.ok) throw new Error(result.error || `Could not save patient (${response.status}).`)
        setPatientList((current) => [patientFromRow(result), ...current])
      } catch (error) {
        setDatabaseStatus('error')
        setDatabaseMessage(`Could not save patient: ${error instanceof Error ? error.message : 'Unknown connection error.'}`)
        return
      } finally {
        setIsSavingPatient(false)
      }
    } else {
      setPatientList((current) => [record, ...current])
    }
    setPatientModal(false)
    setNewPatient({ name: '', community: 'Northside', program: 'General care' })
    setToast(databaseStatus === 'connected' ? `${name} saved to PostgreSQL` : `${name} added to this browser preview only`)
    window.setTimeout(() => setToast(''), 3200)
  }

  function sendMessage(event) {
    event.preventDefault()
    const text = chatInput.trim()
    if (!text) return
    const question = text.toLowerCase()
    let response = 'I can help you navigate this demo workspace, find a section, or summarize the sample dashboard. For patient-specific care decisions, please consult a qualified health professional and verify information in the official patient record.'
    if (/how many|total patients|registered patients/.test(question)) {
      response = `The dashboard shows 1,284 total patients in its sample data. The patient directory currently contains ${patientList.length} demo records.`
    } else if (/attention|today|follow.?up|alerts/.test(question)) {
      response = 'The dashboard highlights three sample items: low Amoxicillin stock at Northside Clinic, a referral follow-up for Daniel Mensah, and an upcoming vaccine dose for Grace Ndlovu.'
    } else if (/vaccin/.test(question)) {
      response = 'The dashboard sample shows 87.4% vaccination coverage, up 3.2%. Open Vaccination in the sidebar to review example upcoming doses.'
    } else if (/inventory|stock|medicine/.test(question)) {
      response = 'The demo inventory shows 8 low-stock items and 3 items expiring soon. Open Inventory to review the sample stock list.'
    }
    setMessages((current) => [...current, { from: 'user', text }, { from: 'assistant', text: response }])
    setChatInput('')
  }

  function handlePrimaryAction() {
    if (active === 'Patients') setPatientModal(true)
    else if (active === 'Dashboard') setPatientModal(true)
    else setToast(`${active} workspace is ready to explore`)
    if (active !== 'Patients' && active !== 'Dashboard') window.setTimeout(() => setToast(''), 2800)
  }

  const databaseBannerText = databaseStatus === 'connected'
    ? 'PostgreSQL connected · Demo records only. Do not enter real patient information.'
    : databaseStatus === 'connecting'
      ? 'Connecting to the PostgreSQL API…'
      : databaseStatus === 'error'
        ? databaseMessage
        : 'PostgreSQL is not configured. Patient changes stay in browser memory and are lost on refresh.'

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
          <button className="profile-button" type="button" onClick={() => navigate('Users')}><Avatar initials="EW" color="mint" small /><span className="profile-copy"><strong>Esther Wanjiku</strong><small>Community health worker</small></span><span className="profile-dots">···</span></button>
        </div>
      </aside>

      <main className="main-area">
        <header className="topbar">
          <button className="mobile-menu icon-button" aria-label="Open navigation" type="button" onClick={() => setMobileNav(!mobileNav)}><Icon name="menu" /></button>
          <div className="breadcrumbs"><span>Workspace</span><Icon name="chevron" size={14} /><strong>{active}</strong></div>
          <div className="topbar-actions">
            <label className="search-box"><Icon name="search" size={17} /><input aria-label="Search patients" placeholder="Search anything..." value={query} onChange={(event) => setQuery(event.target.value)} /><kbd>⌘ K</kbd></label>
            <div className="notification-wrap">
              <button className={`icon-button notification-button${showNotifications ? ' icon-button-active' : ''}`} type="button" aria-label="Show notifications" onClick={() => setShowNotifications(!showNotifications)}><Icon name="bell" size={19} /><span className="notification-dot" /></button>
              {showNotifications && <div className="notification-popover"><div className="popover-heading"><strong>Notifications</strong><span>3 new</span></div><p><b>Low stock alert</b><br />Amoxicillin is running low at Northside Clinic.</p><p><b>Follow-up due</b><br />Daniel Mensah is due for a visit.</p><p><b>Vaccine reminder</b><br />Grace Ndlovu’s next dose is coming up.</p></div>}
            </div>
            <span className="topbar-divider" /><Avatar initials="EW" color="mint" small />
          </div>
        </header>

        <div className={`database-banner database-${databaseStatus}`} role={databaseStatus === 'error' ? 'alert' : 'status'}><span className="database-indicator" />{databaseBannerText}</div>
        <div className="page-content">
          {active === 'Dashboard' && <>
            <div className="welcome-row"><div><div className="eyebrow"><span className="eyebrow-dot" /> FRIDAY, OCTOBER 9, 2026</div><h1>Good morning, Esther <span className="wave">✳</span></h1><p className="page-subtitle">Here’s what’s happening in your community today.</p></div><button className="primary-button" type="button" onClick={() => setPatientModal(true)}><Icon name="plus" size={17} /> Add a patient</button></div>
            <section className="stats-grid" aria-label="Community health overview">
              <article className="stat-card"><div className="stat-top"><span className="stat-icon stat-icon-green"><Icon name="users" size={18} /></span><span className="stat-trend"><Icon name="arrowUp" size={13} /> 8.2%</span></div><p>Total patients</p><strong>1,284</strong><small>vs. last month</small><div className="sparkline spark-green"><i /><i /><i /><i /><i /><i /><i /><i /><i /><i /></div></article>
              <article className="stat-card"><div className="stat-top"><span className="stat-icon stat-icon-blue"><Icon name="calendar" size={18} /></span><span className="stat-trend"><Icon name="arrowUp" size={13} /> 12.5%</span></div><p>Visits this month</p><strong>936</strong><small>vs. last month</small><div className="sparkline spark-blue"><i /><i /><i /><i /><i /><i /><i /><i /><i /><i /></div></article>
              <article className="stat-card"><div className="stat-top"><span className="stat-icon stat-icon-purple"><Icon name="shield" size={18} /></span><span className="stat-trend"><Icon name="arrowUp" size={13} /> 3.2%</span></div><p>Vaccination coverage</p><strong>87.4<span className="stat-unit">%</span></strong><small>Across your communities</small><div className="sparkline spark-purple"><i /><i /><i /><i /><i /><i /><i /><i /><i /><i /></div></article>
              <article className="stat-card"><div className="stat-top"><span className="stat-icon stat-icon-orange"><Icon name="arrow" size={18} /></span><span className="stat-neutral">5 need follow-up</span></div><p>Active referrals</p><strong>24</strong><small>9 awaiting follow-up</small><div className="sparkline spark-orange"><i /><i /><i /><i /><i /><i /><i /><i /><i /><i /></div></article>
            </section>
            <section className="dashboard-grid">
              <article className="panel coverage-panel"><div className="panel-heading"><div><h2>Community overview</h2><p>Patient reach across your communities</p></div><button className="select-button" type="button">This month <Icon name="chevron" size={14} /></button></div><div className="chart-summary"><strong>1,284 <span>patients reached</span></strong><span className="chart-change"><Icon name="arrowUp" size={13} /> 8.2% <span>vs last month</span></span></div><div className="chart-wrap"><div className="chart-y-labels"><span>1,500</span><span>1,000</span><span>500</span><span>0</span></div><div className="chart-area"><div className="chart-gridline grid-one" /><div className="chart-gridline grid-two" /><div className="chart-gridline grid-three" /><div className="chart-gridline grid-four" /><svg className="chart-svg" viewBox="0 0 650 160" preserveAspectRatio="none" role="img" aria-label="Patient reach increased steadily over the last six months"><defs><linearGradient id="chart-fill" x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stopColor="#45ad82" stopOpacity=".2" /><stop offset="100%" stopColor="#45ad82" stopOpacity="0" /></linearGradient></defs><path d="M0 132 C45 124 48 118 88 120 S145 104 174 109 S226 88 260 96 S318 81 350 84 S407 60 435 69 S495 50 522 55 S580 35 610 42 S638 24 650 22 L650 160 L0 160 Z" fill="url(#chart-fill)" /><path d="M0 132 C45 124 48 118 88 120 S145 104 174 109 S226 88 260 96 S318 81 350 84 S407 60 435 69 S495 50 522 55 S580 35 610 42 S638 24 650 22" fill="none" stroke="#3a9b73" strokeWidth="3" vectorEffect="non-scaling-stroke" /><circle cx="650" cy="22" r="5" fill="#fff" stroke="#3a9b73" strokeWidth="3" vectorEffect="non-scaling-stroke" /></svg><div className="chart-x-labels"><span>May</span><span>Jun</span><span>Jul</span><span>Aug</span><span>Sep</span><span>Oct</span></div></div></div><div className="chart-legend"><span><i className="legend-dot" /> Patients reached</span><span>Updated today at 9:00 AM</span></div></article>
              <article className="panel tasks-panel"><div className="panel-heading"><div><h2>Needs your attention</h2><p>A few things to follow up on</p></div><span className="attention-count">3</span></div><button className="task-item" type="button" onClick={() => navigate('Inventory')}><span className="task-icon task-orange"><Icon name="box" size={17} /></span><span className="task-copy"><strong>Low medicine stock</strong><small>Amoxicillin · Northside Clinic</small></span><Icon name="chevron" size={16} /></button><button className="task-item" type="button" onClick={() => navigate('Referrals')}><span className="task-icon task-blue"><Icon name="arrow" size={17} /></span><span className="task-copy"><strong>Referral follow-up due</strong><small>Daniel Mensah · Riverside</small></span><Icon name="chevron" size={16} /></button><button className="task-item" type="button" onClick={() => navigate('Vaccination')}><span className="task-icon task-purple"><Icon name="shield" size={17} /></span><span className="task-copy"><strong>Vaccination coming up</strong><small>Grace Ndlovu · in 2 days</small></span><Icon name="chevron" size={16} /></button><button className="view-all-button" type="button" onClick={() => navigate('Alerts')}>View all alerts <Icon name="chevron" size={14} /></button></article>
            </section>
            <section className="panel activity-panel"><div className="panel-heading"><div><h2>Recent activity</h2><p>The latest updates from your community team</p></div><button className="text-button" type="button" onClick={() => navigate('Reports')}>View reports <Icon name="chevron" size={14} /></button></div><div className="activity-list">{activities.map((activity) => <div className="activity-row" key={activity.text}><span className={`activity-icon activity-${activity.color}`}><Icon name={activity.icon} size={16} /></span><div className="activity-copy"><strong>{activity.text}</strong><small>{activity.detail}</small></div><span className="activity-time"><Icon name="clock" size={13} />{activity.time}</span></div>)}</div></section>
            <div className="demo-note"><span className="demo-indicator" /> Demo workspace <span>Sample data for preview only · Not for clinical decision-making</span></div>
          </>}

          {active === 'Patients' && <><div className="welcome-row"><div><div className="eyebrow">PATIENT DIRECTORY</div><h1>Patients</h1><p className="page-subtitle">Manage and follow up with people in your community.</p></div><button className="primary-button" type="button" onClick={() => setPatientModal(true)}><Icon name="plus" size={17} /> Add a patient</button></div><div className="module-stats">{[['Total patients', patientList.length.toLocaleString(), 'Registered in workspace'], ['Active care plans', '842', 'Across all programs'], ['Follow-ups due', '18', 'In the next 7 days']].map(([label, value, note]) => <div className="module-stat" key={label}><span>{label}</span><strong>{value}</strong><small>{note}</small></div>)}</div><PatientTable patients={matchingPatients} query={query} onSelect={(patient) => setToast(`${patient.name} · ${patient.id}`)} /></>}

          {active === 'AI Assistant' && <><div className="welcome-row"><div><div className="eyebrow">YOUR COMMUNITY HEALTH COPILOT</div><h1>AI Assistant</h1><p className="page-subtitle">A helpful guide to your workspace and community health data.</p></div></div><div className="assistant-layout"><section className="panel chat-panel"><div className="chat-header"><span className="assistant-avatar"><Icon name="sparkles" size={20} /></span><div><strong>CareCircle Assistant</strong><small><span className="online-dot" /> Ready to help</small></div><span className="demo-tag">DEMO</span></div><div className="chat-messages">{messages.map((message, index) => <div className={`chat-message message-${message.from}`} key={`${message.from}-${index}`}>{message.from === 'assistant' && <span className="message-avatar"><Icon name="sparkles" size={14} /></span>}<p>{message.text}</p></div>)}</div><div className="suggestions"><span>Try asking</span>{['How many patients are registered?', 'What needs attention today?'].map((suggestion) => <button type="button" key={suggestion} onClick={() => setChatInput(suggestion)}>{suggestion}</button>)}</div><form className="chat-form" onSubmit={sendMessage}><input aria-label="Message the AI assistant" placeholder="Ask a question about your workspace..." value={chatInput} onChange={(event) => setChatInput(event.target.value)} /><button aria-label="Send message" type="submit"><Icon name="arrowUp" size={17} /></button></form><p className="chat-disclaimer">AI responses are for navigation support only. Verify health information with a qualified professional.</p></section><aside className="assistant-side"><div className="panel assistant-info"><span className="info-icon"><Icon name="sparkles" /></span><h3>What I can help with</h3><p>Get quick summaries, find the right workspace, or understand your dashboard at a glance.</p><div className="capability"><Icon name="search" size={16} /><span>Find patient records</span></div><div className="capability"><Icon name="chart" size={16} /><span>Summarize community activity</span></div><div className="capability"><Icon name="grid" size={16} /><span>Navigate your workspace</span></div></div><div className="safety-note"><Icon name="shield" size={17} /><p><strong>Care comes first.</strong><br />This assistant does not diagnose, prescribe, or replace clinical judgment.</p></div></aside></div></>}

          {activeModule && <><div className="welcome-row"><div><div className="eyebrow">{activeModule.eyebrow}</div><h1>{active}</h1><p className="page-subtitle">{activeModule.description}</p></div><button className="primary-button" type="button" onClick={handlePrimaryAction}><Icon name={active === 'Reports' ? 'chart' : active === 'QR ID' ? 'qr' : 'plus'} size={17} />{active === 'Reports' ? 'Generate report' : active === 'QR ID' ? 'Issue an ID' : active === 'Users' ? 'Invite a user' : active === 'Alerts' ? 'Manage alerts' : `Add ${active === 'Families' ? 'a family' : active === 'Inventory' ? 'stock item' : active === 'Referrals' ? 'a referral' : 'record'}`}</button></div><div className="module-stats">{activeModule.stats.map(([label, value, note]) => <div className="module-stat" key={label}><span>{label}</span><strong>{value}</strong><small>{note}</small></div>)}</div>{active === 'QR ID' && <div className="qr-info-banner"><span className="qr-banner-icon"><Icon name="qr" size={20} /></span><p><strong>Community health IDs</strong><br />Search for a patient below to view their ID record. QR codes are a prototype preview and are not scannable.</p></div>}<ModuleTable module={activeModule} query={query} />{active === 'Reports' && <div className="report-footnote">Reports in this workspace use sample data. Confirm figures in your official reporting system before sharing.</div>}</>}
        </div>
      </main>

      {mobileNav && <button className="mobile-scrim" type="button" aria-label="Close navigation" onClick={() => setMobileNav(false)} />}
      {patientModal && <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setPatientModal(false) }}><section className="modal" role="dialog" aria-modal="true" aria-labelledby="patient-modal-title"><div className="modal-heading"><div><div className="eyebrow">PATIENT DIRECTORY</div><h2 id="patient-modal-title">Add a patient</h2></div><button className="icon-button" type="button" aria-label="Close dialog" onClick={() => setPatientModal(false)}><Icon name="close" /></button></div><p className="modal-description">Create a new patient record for your community.</p><form className="patient-form" onSubmit={submitPatient}><label>Full name<input autoFocus required placeholder="e.g. Amina Yusuf" value={newPatient.name} onChange={(event) => setNewPatient({ ...newPatient, name: event.target.value })} /></label><label>Community<select value={newPatient.community} onChange={(event) => setNewPatient({ ...newPatient, community: event.target.value })}><option>Northside</option><option>Riverside</option><option>East Ward</option><option>Hillview</option></select></label><label>Care program<select value={newPatient.program} onChange={(event) => setNewPatient({ ...newPatient, program: event.target.value })}><option>General care</option><option>Maternal care</option><option>Child wellness</option><option>Hypertension</option><option>Diabetes care</option></select></label>      <div className="form-note"><Icon name="shield" size={15} /> Demo only. Do not enter real patient or health information.</div><div className="modal-actions"><button className="secondary-button" type="button" onClick={() => setPatientModal(false)}>Cancel</button><button className="primary-button" type="submit" disabled={isSavingPatient || databaseStatus === 'connecting' || databaseStatus === 'error'}><Icon name="plus" size={16} />{isSavingPatient ? 'Saving…' : databaseStatus === 'connecting' ? 'Connecting…' : 'Create patient'}</button></div></form></section></div>}
      {toast && <div className="toast-message"><span>✓</span>{toast}</div>}
    </div>
  )
}

function PatientTable({ patients: rows, query, onSelect }) {
  return <section className="panel data-panel"><div className="table-toolbar"><div><h2>All patients <span className="row-count">{rows.length}</span></h2><p>Patient records across your communities</p></div><div className="table-tools"><button type="button" className="filter-button"><Icon name="calendar" size={15} /> All programs <Icon name="chevron" size={13} /></button><button type="button" className="filter-button"><Icon name="grid" size={15} /> Filter <span className="filter-count">2</span></button></div></div><div className="table-scroll"><table><thead><tr><th>Patient</th><th>Patient ID</th><th>Age / sex</th><th>Community</th><th>Care program</th><th>Status</th><th /></tr></thead><tbody>{rows.map((patient) => <tr key={patient.id} onClick={() => onSelect(patient)}><td><div className="patient-cell"><Avatar initials={patient.initials} color={patient.color} small /><strong>{patient.name}</strong></div></td><td className="muted-cell">{patient.id}</td><td className="muted-cell">{patient.age}{patient.sex !== '—' ? ` · ${patient.sex}` : ''}</td><td>{patient.community}</td><td>{patient.program}</td><td><StatusPill>{patient.status}</StatusPill></td><td><button className="row-action" type="button" aria-label={`View ${patient.name}`} onClick={(event) => { event.stopPropagation(); onSelect(patient) }}><Icon name="chevron" size={16} /></button></td></tr>)}</tbody></table>{rows.length === 0 && <div className="empty-state">{query ? `No patients match “${query}”.` : 'No patient records yet.'}</div>}</div><div className="table-footer">Showing <strong>{rows.length ? 1 : 0}–{rows.length}</strong> of <strong>{rows.length}</strong> patients<span>Page 1 of 1</span></div></section>
}

function ModuleTable({ module, query }) {
  const filteredRows = module.rows.filter((row) => row.some((cell) => String(cell).toLowerCase().includes(query.toLowerCase())))
  const finalColumnIsStatus = /status|priority|access|format/i.test(module.columns[module.columns.length - 1])
  return <section className="panel data-panel"><div className="table-toolbar"><div><h2>{module.eyebrow === 'INSIGHTS & REPORTS' ? 'Available reports' : module.eyebrow === 'ATTENTION NEEDED' ? 'Recent alerts' : module.eyebrow === 'TEAM ACCESS' ? 'Team directory' : `All ${module.eyebrow === 'SUPPLY MANAGEMENT' ? 'stock items' : module.eyebrow === 'IMMUNIZATION' ? 'upcoming vaccinations' : module.eyebrow === 'CARE COORDINATION' ? 'referrals' : module.eyebrow === 'PATIENT IDENTIFICATION' ? 'patient IDs' : 'families'}`} <span className="row-count">{filteredRows.length}</span></h2><p>Records across your community workspace</p></div><div className="table-tools"><button type="button" className="filter-button"><Icon name="calendar" size={15} /> This month <Icon name="chevron" size={13} /></button><button type="button" className="filter-button"><Icon name="grid" size={15} /> Filter</button></div></div><div className="table-scroll"><table><thead><tr>{module.columns.map((column) => <th key={column}>{column}</th>)}<th /></tr></thead><tbody>{filteredRows.map((row, index) => <tr key={`${row[0]}-${index}`}>{row.map((cell, cellIndex) => <td key={`${cell}-${cellIndex}`}>{cellIndex === row.length - 1 && finalColumnIsStatus ? <StatusPill>{cell}</StatusPill> : cellIndex === 0 ? <strong className="table-primary-text">{cell}</strong> : <span className="muted-cell">{cell}</span>}</td>)}<td><button className="row-action" type="button" aria-label={`View ${row[0]}`}><Icon name="chevron" size={16} /></button></td></tr>)}</tbody></table>{filteredRows.length === 0 && <div className="empty-state">No records match “{query}”.</div>}</div><div className="table-footer">Showing <strong>{filteredRows.length ? 1 : 0}–{filteredRows.length}</strong> of <strong>{filteredRows.length}</strong> records<span>Page 1 of 1</span></div></section>
}

export default App
