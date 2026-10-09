# CareCircle Community Health

A React/Vite community health demo backed by Supabase PostgreSQL. The current database integration loads and adds patient demo records. Other module screens still display sample data.

## Connect Supabase

1. Create a Supabase project. The Free plan can be used for a small prototype, subject to its storage, usage, and availability limits.
2. In the Supabase project, open **SQL Editor** and run [`supabase/schema.sql`](./supabase/schema.sql). It creates and seeds the `demo_patients` table, enables row-level security, and sets up demo-only read/insert policies.
3. Copy `.env.example` to `.env.local`. From the Supabase project settings/API keys, fill in your project URL and publishable/anon key:

   ```env
   VITE_SUPABASE_URL=https://your-project.supabase.co
   VITE_SUPABASE_ANON_KEY=your-supabase-publishable-or-anon-key
   ```

4. Restart the Vite dev server. The Patients page will load sample records from Supabase and save newly added demo records there.

The publishable/anon key is intended for browser use with Row Level Security enabled. Never put a Supabase `service_role` or secret key in a `VITE_` variable or frontend code.

## Run locally

```powershell
npm install
npm run dev
```

Without Supabase credentials, the app still opens in preview mode; patient additions stay in browser memory and are lost on refresh.

## Safety and integration limits

This is a **demo, not a clinical system**. The SQL intentionally allows anyone with the project URL and public key to read and add rows to the demo patient table so the unauthenticated prototype works. Use synthetic data only—never enter real patient names, identifiers, clinical notes, or data exported from another eHealth system.

Supabase Free has quotas and may pause inactive projects; it is not a production availability guarantee. Before handling real health information, add authentication, authorization, and organization/facility-scoped access policies, then confirm the privacy, security, residency, backup, and uptime requirements that apply to your deployment.

The app does not yet import or synchronize data from an existing eHealth system. That integration requires an approved source API or export, access credentials, and a reviewed field mapping.
