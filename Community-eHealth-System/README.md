# CareCircle Community Health

CareCircle is a React/Vite community-health application using Supabase PostgreSQL. It provides a public client portal and a separate staff workspace, with organization-scoped data protected by row-level security.

## Connect Supabase

1. Back up any existing data in your Supabase project before applying the schema. The migration disables public access to the old `demo_patients` table if it exists; it does not delete existing records.
2. Open the Supabase project **SQL Editor**, review and run [`supabase/schema.sql`](./supabase/schema.sql). It creates the client profiles, public service sign-ups, service campaigns, clinic queue, row-level security policies, and database functions. It does not create sample client or patient records. The PIN functions expect `pgcrypto` functions in Supabase's `extensions` schema.
3. The public client dashboard does not require client sign-in or email-link authentication. Staff continue to sign in with email and password through **Admin login**.
4. Create staff accounts yourself in **Authentication → Users**. Staff sign in with email and password only; no staff registration is available in the app. Assign staff to an organization and set their role in `organization_memberships`. Do not give organization membership to client accounts.
5. Copy `.env.example` to `.env.local` and fill in the project URL and **publishable/anon** key from Supabase project settings:

   ```env
   VITE_SUPABASE_URL=https://your-project.supabase.co
   VITE_SUPABASE_ANON_KEY=your-supabase-publishable-or-anon-key
   ```

6. Restart the Vite server. The public client dashboard is the default. Clients can browse services without signing in. Clients who need a clinic record can register from the sidebar with their profile details and choose a four-digit PIN. To join any available service, they enter the full name and PIN already registered at that clinic; unregistered clients must register first. A successful join automatically assigns the next queue number for that service. The PIN is hashed in the database; it is never returned to the browser or accepted by a directly callable anonymous database function.
7. Deploy the public client portal Edge Function. It uses the Supabase `service_role` key only on the server to validate registrations and service sign-ups, enforces connection and account rate limits, and never returns profile or PIN-hash data:

   ```powershell
   supabase functions deploy public-client-portal --project-ref uuwcgoejxtispnemglxr
   ```

   The function is configured with JWT verification disabled because client users have no auth session; Supabase's API gateway still requires the project API key. Confirm the project URL, API key, and deployment configuration before making the portal public.

## Services, queue, and email announcements

Staff with an owner, admin, or clinician role can publish open services in **Services & Queue**. Only available services appear on the public client dashboard. Clients register their profile separately if they need a clinic record; joining a service requires matching registered full name and PIN. Each successful join receives the next queue number for that service and appears in the staff queue in number order. Staff can call waiting clients and use **Finish & remove** after serving a client; completed entries are hidden from the active queue while their queue numbers remain reserved.

Campaign email is optional and only sent to clients who explicitly checked the email-notifications option during registration. Since public registration does not verify email ownership, notices must contain only general service information and no sensitive health information. Email is sent by the Supabase Edge Function, not by browser code:

```powershell
supabase secrets set RESEND_API_KEY=your-resend-api-key RESEND_FROM="CareCircle <notices@your-verified-domain>"
supabase functions deploy notify-campaign
```

Verify the sender domain with Resend first. The campaign function requires the standard `SUPABASE_URL` and `SUPABASE_ANON_KEY` Edge Function environment values. Only organization owners/admins can send an announcement. Configure CAPTCHA or another bot mitigation, review rate-limit behavior, and confirm your privacy and email-consent requirements before public launch. The public portal's built-in limits are a baseline, not a substitute for a WAF or production abuse monitoring. Review Resend delivery logs before retrying a partially failed announcement.

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

This is not a production-ready or compliance-certified clinical system. A four-digit PIN is low-entropy; do not use it as a high-assurance identity check. Before using this public portal with real client data, add CAPTCHA or equivalent bot mitigation, review rate limits and recovery procedures, verify email ownership if required, and validate privacy, consent, data-residency, backup, monitoring, and operational requirements for your jurisdiction. Test the SQL migration in a disposable project and review it before using it with any existing data.

The app does not import or synchronize from another eHealth system. Such integration requires an approved source API or export, appropriate access credentials, and a reviewed field mapping.
