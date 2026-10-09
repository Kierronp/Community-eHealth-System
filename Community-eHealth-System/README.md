# CareCircle Community Health

A React/Vite community health demo with a standalone PostgreSQL database and a Node.js/Express API. The current API-backed workflow loads and creates patient demo records. Other module screens still display sample data.

## Requirements

- Node.js 20 or later
- PostgreSQL 13 or later, running on your computer or on a PostgreSQL host you control

## Create the local PostgreSQL database

In `psql` as a PostgreSQL administrator, create an application user and database. Replace the example password with your own:

```sql
CREATE USER community_app WITH PASSWORD 'replace-with-a-strong-local-password';
CREATE DATABASE community_ehealth OWNER community_app;
```

In PowerShell, from this project folder, apply the schema:

```powershell
psql -h localhost -U community_app -d community_ehealth -f .\database\schema.sql
```

The schema creates a demo patient table and inserts synthetic preview records.

## Configure and run

Copy `.env.example` to `.env` and set `DATABASE_URL` to match the PostgreSQL user, password, host, and database you created:

```env
DATABASE_URL=postgresql://community_app:your-password@localhost:5432/community_ehealth
API_PORT=3001
DATABASE_SSL=false
```

Keep `.env` private; it is ignored by Git. Do not put database credentials in a `VITE_` variable or frontend code.
Set `DATABASE_SSL=true` only when your PostgreSQL host requires TLS.

Open two terminals in the project folder:

```powershell
npm install
npm run dev:api
```

```powershell
npm run dev
```

Open the Vite URL printed in the second terminal. Vite proxies `/api` requests to the Node API. The API health banner shows whether it is connected to PostgreSQL. Without `DATABASE_URL`, the interface can still be previewed, but patient additions stay in browser memory and disappear on refresh.

API endpoints:

- `GET /api/health` — PostgreSQL connection status
- `GET /api/patients` — list demo patient rows
- `POST /api/patients` — validate and save a demo patient row

## Safety and integration limits

This is a **demo, not a clinical system**. Its patient records are synthetic. Do not store real patient names, identifiers, clinical notes, or information exported from another eHealth system. The API does not yet implement sign-in, user roles, audit trails, facility-level access controls, encryption/backup policies, or production hardening.

The API uses parameterized SQL and validates patient input, but that is not a replacement for authentication and authorization. Before handling real health information, design and review those controls and confirm the applicable privacy, security, residency, and operational requirements.

This app does not yet import or synchronize data from an existing eHealth system. That integration requires an approved source API or export, access credentials, and a reviewed field mapping.
