# CareCircle Community Health

CareCircle is a React/Vite community-health application using Supabase PostgreSQL. It provides a public client portal and a separate staff workspace, with organization-scoped data protected by row-level security.

## Connect Supabase

1. Back up any existing data in your Supabase project before applying the schema. The migration disables public access to the old `demo_patients` table if it exists; it does not delete existing records.
2. Open the Supabase project **SQL Editor**, review and run [`supabase/schema.sql`](./supabase/schema.sql). It creates the client profiles, service campaigns, clinic queue, row-level security policies, and database functions. It does not create sample client or patient records. The PIN functions expect `pgcrypto` functions in Supabase's `extensions` schema.
3. Enable email authentication and client sign-ups in Supabase **Authentication → Providers**. The app uses verified email-link sign-in for clients. Add the local development URL and the deployed Render URL to **Authentication → URL Configuration → Redirect URLs** (including `http://localhost:5175/?portal=client` if that is your local port).
4. Create staff accounts yourself in **Authentication → Users**. Staff sign in with email and password only; no staff registration is available in the app. Assign staff to an organization and set their role in `organization_memberships`. Do not give organization membership to client accounts.
5. Copy `.env.example` to `.env.local` and fill in the project URL and **publishable/anon** key from Supabase project settings:

   ```env
   VITE_SUPABASE_URL=https://your-project.supabase.co
   VITE_SUPABASE_ANON_KEY=your-supabase-publishable-or-anon-key
   ```

6. Restart the Vite server. The signed-out home page is the client portal. Clients confirm their email, choose a clinic, and provide their own profile information. Their four-digit clinic PIN is hashed in the database and is used only by authorized staff to check them in at the clinic. Clients cannot add themselves to the queue.

## Services, queue, and email announcements

Staff with an owner, admin, or clinician role can publish open services in **Services & Queue**. Open services appear on the client portal. Staff verify a client's full name and PIN in person; the database serializes queue allocation and returns the same queue number if the client is checked in twice for one service. Staff can call and mark queue entries served, and the client portal shows the client's own live queue status. Clients can enable or withdraw email-notice consent from their portal.

Campaign email is optional and only sent to clients who explicitly checked the email-notifications option during registration. It is sent by the Supabase Edge Function, not by browser code:

```powershell
supabase secrets set RESEND_API_KEY=your-resend-api-key RESEND_FROM="CareCircle <notices@your-verified-domain>"
supabase functions deploy notify-campaign
```

Verify the sender domain with Resend first. The function also requires the standard `SUPABASE_URL` and `SUPABASE_ANON_KEY` Edge Function environment values; it never uses a service-role key. Only organization owners/admins can send an announcement. Configure Auth email delivery, CAPTCHA, and rate limits before public launch. Review Resend delivery logs before retrying a partially failed announcement.

Never put a Supabase `service_role` or secret key in a `VITE_` variable or frontend code. The SQL uses organization membership and role checks with row-level security; the browser's organization filter is not a substitute for those database controls.

## Run locally

```powershell
npm install
npm run dev
```

Supabase configuration is required for registration, sign-in, and live service announcements. Without both environment values, the public portal explains that online features are unavailable; no sample-data preview is shown.

## Connected workspaces

The staff dashboard and Patients, Families, Vaccination, Inventory items, Referrals, Reports, Alerts, QR ID, Users, and Services & Queue workspaces load organization-scoped Supabase records. Authorized roles can add and edit records, with deletion limited to owners/admins and blocked by database relationships when a record is still referenced. QR IDs and memberships remain read-only in the app. Staff accounts without active organization access are not allowed to create an organization from the app; ask the organization head to assign access.

The app does not delete or import records from your Supabase project. The migration disables public access to the legacy `demo_patients` table if it exists; it does not delete that table or its rows.

This is not a production-ready or compliance-certified clinical system. Do not use it for real patient care until the UI workflows, role assignments, identity and access lifecycle, security review, privacy and data-residency obligations, backups, monitoring, and operational recovery are fully implemented and validated for your jurisdiction and organization. Test the SQL migration in a disposable project and review it before using it with any existing data.

The app does not import or synchronize from another eHealth system. Such integration requires an approved source API or export, appropriate access credentials, and a reviewed field mapping.
