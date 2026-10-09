import 'dotenv/config'
import pg from 'pg'
import { createApp } from './app.js'

const { Pool } = pg
const databaseUrl = process.env.DATABASE_URL?.trim()
const pool = new Pool({
  connectionString: databaseUrl,
  ssl: process.env.DATABASE_SSL === 'true' ? { rejectUnauthorized: true } : undefined,
})

pool.on('error', (error) => {
  console.error('Unexpected PostgreSQL pool error:', error)
})

const port = Number(process.env.API_PORT) || 3001
const server = createApp(pool).listen(port, () => {
  console.log(`Community eHealth API listening on http://localhost:${port}`)
  if (!databaseUrl) {
    console.warn('DATABASE_URL is not set. API is running in preview mode without database access.')
  }
})

async function shutdown() {
  server.close(async (error) => {
    if (error) console.error('Error closing API server:', error)
    await pool.end()
    process.exitCode = error ? 1 : 0
  })
}

process.on('SIGINT', shutdown)
process.on('SIGTERM', shutdown)
