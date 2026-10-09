import assert from 'node:assert/strict'
import { once } from 'node:events'
import { createServer } from 'node:http'
import test from 'node:test'
import { createApp } from './app.js'

async function withApi(pool, run, options) {
  const server = createServer(createApp(pool, options))
  server.listen(0, '127.0.0.1')
  await once(server, 'listening')
  const { port } = server.address()
  try {
    await run(`http://127.0.0.1:${port}`)
  } finally {
    server.close()
    await once(server, 'close')
  }
}

test('GET /api/health reports a working database connection', async () => {
  const pool = { query: async () => ({ rows: [{ '?column?': 1 }] }) }
  await withApi(pool, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/health`)
    assert.equal(response.status, 200)
    assert.deepEqual(await response.json(), { configured: true })
  }, { databaseConfigured: true })
})

test('GET /api/patients returns database records', async () => {
  const expected = [{ patient_id: 'P-2048', full_name: 'Demo Patient' }]
  const pool = { query: async () => ({ rows: expected }) }
  await withApi(pool, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/patients`)
    assert.equal(response.status, 200)
    assert.deepEqual(await response.json(), expected)
  })
})

test('POST /api/patients validates input and uses parameterized SQL', async () => {
  let queryArgs
  const expected = { patient_id: 'P-2049', full_name: 'Demo Patient' }
  const pool = {
    query: async (...args) => {
      queryArgs = args
      return { rows: [expected] }
    },
  }
  await withApi(pool, async (baseUrl) => {
    const invalid = await fetch(`${baseUrl}/api/patients`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ full_name: 'Demo Patient', community: 'Unknown', program: 'General care' }),
    })
    assert.equal(invalid.status, 400)

    const response = await fetch(`${baseUrl}/api/patients`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ full_name: 'Demo Patient', community: 'Northside', program: 'General care' }),
    })
    assert.equal(response.status, 201)
    assert.deepEqual(await response.json(), expected)
    assert.match(queryArgs[0], /values \(\$1, \$2, \$3, \$4, 'mint'\)/)
    assert.deepEqual(queryArgs[1], ['Demo Patient', 'Northside', 'General care', 'DP'])
  })
})

test('POST /api/patients rejects malformed JSON', async () => {
  const pool = { query: async () => ({ rows: [] }) }
  await withApi(pool, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/patients`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{invalid json',
    })
    assert.equal(response.status, 400)
    assert.deepEqual(await response.json(), { error: 'Request body must contain valid JSON.' })
  })
})
