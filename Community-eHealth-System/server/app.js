import express from 'express'

const allowedCommunities = new Set(['Northside', 'Riverside', 'East Ward', 'Hillview'])
const allowedPrograms = new Set(['General care', 'Maternal care', 'Child wellness', 'Hypertension', 'Diabetes care'])
const patientColumns = `id, patient_id, full_name, age, sex, community, program, status, initials, avatar_color, created_at`

export function createApp(pool, { databaseConfigured = Boolean(process.env.DATABASE_URL?.trim()) } = {}) {
  const app = express()
  app.disable('x-powered-by')
  app.use(express.json({ limit: '16kb' }))

  app.get('/api/health', async (_request, response) => {
    if (!databaseConfigured) {
      response.json({ configured: false })
      return
    }

    try {
      await pool.query('select 1')
      response.json({ configured: true })
    } catch (error) {
      console.error('PostgreSQL health check failed:', error)
      response.status(503).json({ error: 'PostgreSQL is configured but unavailable.' })
    }
  })

  app.get('/api/patients', async (_request, response) => {
    try {
      const { rows } = await pool.query(
        `select ${patientColumns} from public.demo_patients order by created_at desc, patient_id desc`,
      )
      response.json(rows)
    } catch (error) {
      console.error('Patient list query failed:', error)
      response.status(500).json({ error: 'Could not load patient records.' })
    }
  })

  app.post('/api/patients', async (request, response) => {
    const fullName = typeof request.body?.full_name === 'string' ? request.body.full_name.trim() : ''
    const community = typeof request.body?.community === 'string' ? request.body.community : ''
    const program = typeof request.body?.program === 'string' ? request.body.program : ''

    if (!fullName || fullName.length > 120) {
      response.status(400).json({ error: 'Enter a patient name between 1 and 120 characters.' })
      return
    }
    if (!allowedCommunities.has(community)) {
      response.status(400).json({ error: 'Choose a valid community.' })
      return
    }
    if (!allowedPrograms.has(program)) {
      response.status(400).json({ error: 'Choose a valid care program.' })
      return
    }

    const initials = fullName.split(/\s+/).slice(0, 2).map((part) => part[0]).join('').toUpperCase()

    try {
      const { rows } = await pool.query(
        `insert into public.demo_patients (full_name, community, program, initials, avatar_color)
         values ($1, $2, $3, $4, 'mint')
         returning ${patientColumns}`,
        [fullName, community, program, initials],
      )
      response.status(201).json(rows[0])
    } catch (error) {
      console.error('Patient insert failed:', error)
      response.status(500).json({ error: 'Could not save patient record.' })
    }
  })

  app.use((error, _request, response, _next) => {
    if (error instanceof SyntaxError && 'body' in error) {
      response.status(400).json({ error: 'Request body must contain valid JSON.' })
      return
    }
    console.error('Unhandled API error:', error)
    response.status(500).json({ error: 'An unexpected server error occurred.' })
  })

  return app
}
