# CareCircle Community Health

CareCircle is a React/Vite community-health application using Supabase PostgreSQL. The Supabase schema defines organization, facility, community, family, patient, visit, care-program, vaccination, inventory, referral, QR ID, alert, report, and audit-log records with row-level security.

## Connect Supabase

1. Back up any existing data in your Supabase project before applying the schema. The migration immediately disables public access to the old `demo_patients` table, if it exists.
2. Open the Supabase project **SQL Editor**, paste the contents of [`supabase/schema.sql`](./supabase/schema.sql), and run it. It creates the system tables, organization-scoped access policies, audit triggers, and the `create_my_organization` setup function. It does not create real patient records.
3. In Supabase **Authentication → Settings**, turn off public sign-ups. Then, in **Authentication → Users**, invite or create a user for yourself. Public sign-up is not implemented in the app. Use the invited account's email and password to sign in.
4. Copy `.env.example` to `.env.local` and fill in the project URL and **publishable/anon** key from Supabase project settings:

   ```env
   VITE_SUPABASE_URL=https://your-project.supabase.co
   VITE_SUPABASE_ANON_KEY=your-supabase-publishable-or-anon-key
   ```

5. Restart the Vite server. Sign in; a user without an active organization can create one. Organization setup creates no facilities, communities, patients, or other records. Add facilities and communities in Supabase before linking records to them.

Never put a Supabase `service_role` or secret key in a `VITE_` variable or frontend code. The SQL uses organization membership and role checks with row-level security; the browser's organization filter is not a substitute for those database controls.

## Run locally

```powershell
npm install
npm run dev
```

Supabase configuration is required; without both environment values, the app shows setup instructions and does not open a sample-data preview.

## Connected workspaces

The dashboard and Patients, Families, Vaccination, Inventory items, Referrals, Reports, Alerts, QR ID, and Users workspaces load organization-scoped Supabase records. Forms can create patient, family, vaccination, inventory-item, referral, report-request, and alert records. QR IDs and memberships are read-only in the app: QR token issuance needs a secure server-side flow, and user accounts should be created through Supabase Authentication. Report requests are saved, but report files are not generated. The workspace helper only provides navigation support and does not call an AI service.

The app does not delete or import records from your Supabase project. The migration disables public access to the legacy `demo_patients` table if it exists; it does not delete that table or its rows.

This is not a production-ready or compliance-certified clinical system. Do not use it for real patient care until the UI workflows, role assignments, identity and access lifecycle, security review, privacy and data-residency obligations, backups, monitoring, and operational recovery are fully implemented and validated for your jurisdiction and organization. Test the SQL migration in a disposable project and review it before using it with any existing data.

The app does not import or synchronize from another eHealth system. Such integration requires an approved source API or export, appropriate access credentials, and a reviewed field mapping.
