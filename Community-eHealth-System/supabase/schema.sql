-- Immediately remove the public demo access configured by the earlier prototype.
do $$
begin
  if to_regclass('public.demo_patients') is not null then
    execute 'alter table public.demo_patients enable row level security';
    execute 'revoke all on table public.demo_patients from public, anon, authenticated';
    execute 'drop policy if exists "Public can read demo patients" on public.demo_patients';
    execute 'drop policy if exists "Public can add demo patients" on public.demo_patients';
  end if;
end;
$$;

begin;

create schema if not exists extensions;
do $$
declare
  extension_schema text;
begin
  select n.nspname into extension_schema
  from pg_extension e
  join pg_namespace n on n.oid = e.extnamespace
  where e.extname = 'pgcrypto';
  if extension_schema is null then
    execute 'create extension pgcrypto with schema extensions';
  elsif extension_schema <> 'extensions' then
    execute 'alter extension pgcrypto set schema extensions';
  end if;
end;
$$;

create table if not exists public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(trim(name)) between 2 and 120),
  created_at timestamptz not null default now()
);

create table if not exists public.profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.organization_memberships (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('owner', 'admin', 'clinician', 'health_worker', 'inventory_manager', 'viewer')),
  status text not null default 'active' check (status in ('active', 'suspended')),
  created_at timestamptz not null default now(),
  primary key (organization_id, user_id)
);

create table if not exists public.facilities (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null check (char_length(trim(name)) between 1 and 120),
  code text,
  address text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (organization_id, id),
  unique (organization_id, code)
);

create table if not exists public.communities (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  facility_id uuid,
  name text not null check (char_length(trim(name)) between 1 and 120),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (organization_id, id),
  unique (organization_id, name),
  foreign key (organization_id, facility_id)
    references public.facilities(organization_id, id) on delete restrict
);

create table if not exists public.families (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  community_id uuid,
  family_number text not null default ('F-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8))),
  household_name text not null check (char_length(trim(household_name)) between 1 and 120),
  primary_contact text,
  contact_phone text,
  address text,
  notes text,
  status text not null default 'active' check (status in ('active', 'inactive')),
  created_by uuid not null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, id),
  unique (organization_id, family_number),
  foreign key (organization_id, created_by)
    references public.organization_memberships(organization_id, user_id),
  foreign key (organization_id, community_id)
    references public.communities(organization_id, id) on delete restrict
);

create table if not exists public.patients (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  facility_id uuid,
  community_id uuid,
  family_id uuid,
  patient_number text not null default ('P-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8))),
  full_name text not null check (char_length(trim(full_name)) between 1 and 120),
  birth_date date,
  sex text check (sex is null or sex in ('female', 'male', 'intersex', 'unknown', 'not_recorded')),
  contact_phone text,
  address text,
  care_program text not null default 'General care',
  status text not null default 'active' check (status in ('active', 'inactive', 'deceased', 'transferred')),
  initials text not null default '',
  avatar_color text not null default 'mint',
  created_by uuid not null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, id),
  unique (organization_id, patient_number),
  foreign key (organization_id, created_by)
    references public.organization_memberships(organization_id, user_id),
  foreign key (organization_id, facility_id)
    references public.facilities(organization_id, id) on delete restrict,
  foreign key (organization_id, community_id)
    references public.communities(organization_id, id) on delete restrict,
  foreign key (organization_id, family_id)
    references public.families(organization_id, id) on delete restrict
);

create table if not exists public.family_members (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  family_id uuid not null,
  patient_id uuid not null,
  relationship text not null default 'member',
  is_primary_contact boolean not null default false,
  created_at timestamptz not null default now(),
  unique (organization_id, family_id, patient_id),
  foreign key (organization_id, family_id)
    references public.families(organization_id, id) on delete cascade,
  foreign key (organization_id, patient_id)
    references public.patients(organization_id, id) on delete cascade
);

create table if not exists public.patient_visits (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  patient_id uuid not null,
  facility_id uuid,
  visit_type text not null default 'community_visit',
  visited_at timestamptz not null default now(),
  outcome text,
  notes text,
  created_by uuid not null default auth.uid(),
  created_at timestamptz not null default now(),
  foreign key (organization_id, patient_id)
    references public.patients(organization_id, id) on delete cascade,
  foreign key (organization_id, created_by)
    references public.organization_memberships(organization_id, user_id),
  foreign key (organization_id, facility_id)
    references public.facilities(organization_id, id) on delete restrict
);

create table if not exists public.patient_programs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  patient_id uuid not null,
  program_name text not null,
  status text not null default 'active' check (status in ('active', 'completed', 'paused', 'withdrawn')),
  enrolled_at date not null default current_date,
  ended_at date,
  notes text,
  created_by uuid not null default auth.uid(),
  created_at timestamptz not null default now(),
  foreign key (organization_id, patient_id)
    references public.patients(organization_id, id) on delete cascade,
  foreign key (organization_id, created_by)
    references public.organization_memberships(organization_id, user_id),
  check (ended_at is null or ended_at >= enrolled_at)
);

create table if not exists public.vaccination_records (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  patient_id uuid not null,
  vaccine_name text not null,
  dose_name text not null,
  due_date date,
  administered_at timestamptz,
  status text not null default 'scheduled' check (status in ('scheduled', 'administered', 'overdue', 'deferred', 'cancelled')),
  batch_number text,
  facility_id uuid,
  notes text,
  administered_by uuid,
  created_by uuid not null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (organization_id, patient_id)
    references public.patients(organization_id, id) on delete cascade,
  foreign key (organization_id, administered_by)
    references public.organization_memberships(organization_id, user_id),
  foreign key (organization_id, created_by)
    references public.organization_memberships(organization_id, user_id),
  foreign key (organization_id, facility_id)
    references public.facilities(organization_id, id) on delete restrict
);

create table if not exists public.inventory_items (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  item_code text,
  name text not null check (char_length(trim(name)) between 1 and 160),
  category text not null default 'other',
  unit text not null default 'unit',
  reorder_level numeric(12, 2) not null default 0 check (reorder_level >= 0),
  is_active boolean not null default true,
  created_by uuid not null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, id),
  unique (organization_id, item_code),
  foreign key (organization_id, created_by)
    references public.organization_memberships(organization_id, user_id)
);

create table if not exists public.inventory_lots (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  item_id uuid not null,
  facility_id uuid not null,
  lot_number text,
  quantity numeric(12, 2) not null default 0 check (quantity >= 0),
  expires_on date,
  received_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (organization_id, id),
  foreign key (organization_id, item_id)
    references public.inventory_items(organization_id, id) on delete restrict,
  foreign key (organization_id, facility_id)
    references public.facilities(organization_id, id) on delete restrict
);

create table if not exists public.inventory_movements (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  lot_id uuid not null,
  movement_type text not null check (movement_type in ('receipt', 'dispense', 'adjustment', 'transfer', 'wastage')),
  quantity_delta numeric(12, 2) not null check (quantity_delta <> 0),
  reason text,
  occurred_at timestamptz not null default now(),
  created_by uuid not null default auth.uid(),
  created_at timestamptz not null default now(),
  foreign key (organization_id, lot_id)
    references public.inventory_lots(organization_id, id) on delete restrict,
  foreign key (organization_id, created_by)
    references public.organization_memberships(organization_id, user_id)
);

create table if not exists public.referrals (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  patient_id uuid not null,
  referred_to_facility_id uuid,
  reason text not null,
  priority text not null default 'routine' check (priority in ('routine', 'urgent', 'emergency')),
  status text not null default 'open' check (status in ('open', 'in_progress', 'completed', 'cancelled')),
  referred_at timestamptz not null default now(),
  completed_at timestamptz,
  follow_up_due date,
  notes text,
  created_by uuid not null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (organization_id, patient_id)
    references public.patients(organization_id, id) on delete cascade,
  foreign key (organization_id, referred_to_facility_id)
    references public.facilities(organization_id, id) on delete restrict,
  foreign key (organization_id, created_by)
    references public.organization_memberships(organization_id, user_id)
);

create table if not exists public.qr_ids (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  patient_id uuid not null,
  token_hash text not null unique,
  issued_at timestamptz not null default now(),
  expires_at timestamptz,
  revoked_at timestamptz,
  issued_by uuid not null default auth.uid(),
  foreign key (organization_id, patient_id)
    references public.patients(organization_id, id) on delete cascade,
  foreign key (organization_id, issued_by)
    references public.organization_memberships(organization_id, user_id)
);

create table if not exists public.alerts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  patient_id uuid,
  facility_id uuid,
  category text not null,
  title text not null,
  description text,
  priority text not null default 'medium' check (priority in ('low', 'medium', 'high', 'urgent')),
  status text not null default 'open' check (status in ('open', 'acknowledged', 'resolved', 'dismissed')),
  due_at timestamptz,
  assigned_to uuid,
  resolved_at timestamptz,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (organization_id, patient_id)
    references public.patients(organization_id, id) on delete cascade,
  foreign key (organization_id, facility_id)
    references public.facilities(organization_id, id) on delete restrict,
  foreign key (organization_id, assigned_to)
    references public.organization_memberships(organization_id, user_id),
  foreign key (organization_id, created_by)
    references public.organization_memberships(organization_id, user_id)
);

create table if not exists public.report_runs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  report_type text not null,
  period_start date,
  period_end date,
  status text not null default 'requested' check (status in ('requested', 'ready', 'failed')),
  storage_path text,
  requested_by uuid not null default auth.uid(),
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  check (period_end is null or period_start is null or period_end >= period_start),
  foreign key (organization_id, requested_by)
    references public.organization_memberships(organization_id, user_id)
);

create table if not exists public.audit_logs (
  id bigint generated always as identity primary key,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  actor_id uuid references auth.users(id),
  action text not null,
  table_name text not null,
  record_id uuid,
  occurred_at timestamptz not null default now()
);

create table if not exists public.client_profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid unique references auth.users(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  full_name text not null check (char_length(trim(full_name)) between 2 and 120),
  email text not null,
  pin_hash text not null,
  phone text not null check (char_length(trim(phone)) between 5 and 40),
  address text not null check (char_length(trim(address)) between 2 and 240),
  birth_date date not null,
  email_notifications boolean not null default false,
  status text not null default 'active' check (status in ('active', 'inactive')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, id)
);
alter table public.client_profiles alter column email_notifications set default false;
alter table public.client_profiles alter column user_id drop not null;
alter table public.client_profiles alter column email drop not null;
alter table public.client_profiles alter column phone drop not null;
alter table public.client_profiles alter column address drop not null;
alter table public.client_profiles alter column birth_date drop not null;

create table if not exists public.service_campaigns (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  title text not null check (char_length(trim(title)) between 2 and 160),
  service_type text not null check (service_type in ('checkup', 'medicine', 'vaccination', 'other')),
  description text not null default '',
  facility_id uuid,
  starts_at timestamptz not null,
  ends_at timestamptz,
  status text not null default 'draft' check (status in ('draft', 'open', 'closed')),
  announced_at timestamptz,
  next_queue_number integer not null default 1 check (next_queue_number > 0),
  created_by uuid not null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, id),
  foreign key (organization_id, facility_id)
    references public.facilities(organization_id, id) on delete restrict,
  foreign key (organization_id, created_by)
    references public.organization_memberships(organization_id, user_id),
  check (ends_at is null or ends_at >= starts_at)
);

create table if not exists public.queue_entries (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  campaign_id uuid not null,
  client_profile_id uuid not null,
  queue_number integer not null check (queue_number > 0),
  status text not null default 'waiting' check (status in ('waiting', 'called', 'served', 'cancelled')),
  checked_in_at timestamptz not null default now(),
  called_at timestamptz,
  completed_at timestamptz,
  created_by uuid not null default auth.uid(),
  unique (campaign_id, queue_number),
  unique (campaign_id, client_profile_id),
  foreign key (organization_id, campaign_id)
    references public.service_campaigns(organization_id, id) on delete cascade,
  foreign key (organization_id, client_profile_id)
    references public.client_profiles(organization_id, id) on delete restrict,
  foreign key (organization_id, created_by)
    references public.organization_memberships(organization_id, user_id)
);
alter table public.queue_entries alter column created_by drop not null;

create table if not exists public.client_service_requests (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  campaign_id uuid not null,
  client_profile_id uuid not null,
  status text not null default 'joined'
    check (status in ('joined', 'approved', 'ready', 'fulfilled', 'rejected', 'cancelled')),
  client_note text not null default '' check (char_length(client_note) <= 500),
  staff_note text not null default '' check (char_length(staff_note) <= 500),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (campaign_id, client_profile_id),
  foreign key (organization_id, campaign_id)
    references public.service_campaigns(organization_id, id) on delete cascade,
  foreign key (organization_id, client_profile_id)
    references public.client_profiles(organization_id, id) on delete cascade
);
alter table public.client_service_requests alter column status set default 'joined';
alter table public.client_service_requests drop constraint if exists client_service_requests_status_check;
update public.client_service_requests set status = 'joined' where status = 'requested';
alter table public.client_service_requests
  add constraint client_service_requests_status_check
  check (status in ('joined', 'approved', 'ready', 'fulfilled', 'rejected', 'cancelled'));

create table if not exists public.public_api_rate_limits (
  rate_key text primary key,
  window_started_at timestamptz not null,
  request_count integer not null check (request_count > 0)
);

create index if not exists memberships_user_status_idx on public.organization_memberships(user_id, status);
create index if not exists facilities_org_active_idx on public.facilities(organization_id, is_active);
create index if not exists communities_org_active_idx on public.communities(organization_id, is_active);
create index if not exists families_org_created_idx on public.families(organization_id, created_at desc);
create index if not exists patients_org_created_idx on public.patients(organization_id, created_at desc);
create index if not exists patients_org_name_idx on public.patients(organization_id, full_name);
create index if not exists visits_org_patient_date_idx on public.patient_visits(organization_id, patient_id, visited_at desc);
create index if not exists vaccination_org_due_idx on public.vaccination_records(organization_id, due_date);
create index if not exists inventory_lots_org_facility_idx on public.inventory_lots(organization_id, facility_id, item_id);
create index if not exists referrals_org_status_idx on public.referrals(organization_id, status, referred_at desc);
create index if not exists alerts_org_status_due_idx on public.alerts(organization_id, status, due_at);
create index if not exists reports_org_created_idx on public.report_runs(organization_id, created_at desc);
create index if not exists audit_org_time_idx on public.audit_logs(organization_id, occurred_at desc);
create index if not exists client_profiles_org_name_idx on public.client_profiles(organization_id, full_name);
create index if not exists campaigns_org_status_start_idx on public.service_campaigns(organization_id, status, starts_at);
create index if not exists queue_entries_org_campaign_status_idx on public.queue_entries(organization_id, campaign_id, status, queue_number);
create index if not exists queue_entries_client_idx on public.queue_entries(client_profile_id, checked_in_at desc);
create index if not exists client_requests_org_status_idx on public.client_service_requests(organization_id, status, created_at desc);
create index if not exists client_requests_profile_idx on public.client_service_requests(client_profile_id, created_at desc);

do $$
declare
  signup record;
  allocated_number integer;
begin
  for signup in
    select csr.organization_id, csr.campaign_id, csr.client_profile_id, csr.created_at
    from public.client_service_requests csr
    where csr.status in ('joined', 'approved', 'ready')
      and not exists (
        select 1 from public.queue_entries qe
        where qe.campaign_id = csr.campaign_id
          and qe.client_profile_id = csr.client_profile_id
      )
    order by csr.campaign_id, csr.created_at, csr.id
  loop
    update public.service_campaigns c
    set next_queue_number = greatest(
      c.next_queue_number,
      coalesce((
        select max(qe.queue_number) + 1
        from public.queue_entries qe
        where qe.campaign_id = signup.campaign_id
      ), 1)
    ) + 1
    where c.id = signup.campaign_id
    returning c.next_queue_number - 1 into allocated_number;

    insert into public.queue_entries (
      organization_id, campaign_id, client_profile_id, queue_number, checked_in_at
    ) values (
      signup.organization_id, signup.campaign_id, signup.client_profile_id,
      allocated_number, signup.created_at
    );
  end loop;
end;
$$;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

do $$
declare
  table_to_timestamp text;
begin
  foreach table_to_timestamp in array array[
    'profiles', 'families', 'patients', 'vaccination_records',
    'inventory_items', 'referrals', 'alerts', 'client_profiles',
    'service_campaigns', 'client_service_requests'
  ]
  loop
    execute format('drop trigger if exists set_updated_at on public.%I', table_to_timestamp);
    execute format(
      'create trigger set_updated_at before update on public.%I for each row execute function public.set_updated_at()',
      table_to_timestamp
    );
  end loop;
end;
$$;

create or replace function public.is_org_member(p_organization_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.organization_memberships m
    where m.organization_id = p_organization_id
      and m.user_id = (select auth.uid())
      and m.status = 'active'
  );
$$;

create or replace function public.has_org_role(p_organization_id uuid, p_roles text[])
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.organization_memberships m
    where m.organization_id = p_organization_id
      and m.user_id = (select auth.uid())
      and m.status = 'active'
      and m.role = any(p_roles)
  );
$$;

create or replace function public.my_organizations()
returns table (organization_id uuid, organization_name text, member_role text)
language sql
stable
security definer
set search_path = ''
as $$
  select o.id, o.name, m.role
  from public.organization_memberships m
  join public.organizations o on o.id = m.organization_id
  where m.user_id = (select auth.uid()) and m.status = 'active'
  order by o.name;
$$;

create or replace function public.list_public_organizations()
returns table (organization_id uuid, organization_name text)
language sql
stable
security definer
set search_path = ''
as $$
  select o.id, o.name
  from public.organizations o
  order by o.name;
$$;

create or replace function public.consume_public_rate_limit(
  p_rate_key text,
  p_max_requests integer,
  p_window_seconds integer
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  now_at timestamptz := clock_timestamp();
  allowed boolean;
begin
  if p_rate_key is null or p_rate_key !~ '^[a-f0-9]{64}$'
    or p_max_requests < 1 or p_window_seconds < 1 then
    raise exception 'Invalid rate limit request.' using errcode = '22023';
  end if;
  insert into public.public_api_rate_limits (rate_key, window_started_at, request_count)
  values (p_rate_key, now_at, 1)
  on conflict (rate_key) do update
  set window_started_at = case
        when public.public_api_rate_limits.window_started_at
          <= now_at - make_interval(secs => p_window_seconds) then now_at
        else public.public_api_rate_limits.window_started_at
      end,
      request_count = case
        when public.public_api_rate_limits.window_started_at
          <= now_at - make_interval(secs => p_window_seconds) then 1
        else public.public_api_rate_limits.request_count + 1
      end;
  select r.request_count <= p_max_requests into allowed
  from public.public_api_rate_limits r
  where r.rate_key = p_rate_key;
  return allowed;
end;
$$;

create or replace function public.verify_public_client_credentials(
  p_organization_id uuid,
  p_full_name text,
  p_pin text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  matching_client_id uuid;
  matching_client_count integer;
begin
  if coalesce(p_pin, '') !~ '^[0-9]{4}$' then
    raise exception 'We could not verify those details. Check your clinic, full name, and PIN.' using errcode = '22023';
  end if;
  select count(*), min(cp.id::text)::uuid into matching_client_count, matching_client_id
  from public.client_profiles cp
  where cp.organization_id = p_organization_id
    and cp.status = 'active'
    and lower(trim(cp.full_name)) = lower(trim(coalesce(p_full_name, '')))
    and cp.pin_hash = extensions.crypt(p_pin, cp.pin_hash);
  if matching_client_count <> 1 then
    raise exception 'We could not verify those details. Check your clinic, full name, and PIN.' using errcode = '22023';
  end if;
  return matching_client_id;
end;
$$;

create or replace function public.register_public_client_profile(
  p_organization_id uuid,
  p_full_name text,
  p_email text,
  p_pin text,
  p_phone text,
  p_address text,
  p_birth_date date,
  p_email_notifications boolean
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  new_profile_id uuid;
begin
  if char_length(trim(coalesce(p_full_name, ''))) not between 2 and 120
    or lower(trim(coalesce(p_email, ''))) !~ '^[a-z0-9.!#$%&''*+/=?^_`{|}~-]+@[a-z0-9-]+(\.[a-z0-9-]+)+$'
    or coalesce(p_pin, '') !~ '^[0-9]{4}$'
    or char_length(trim(coalesce(p_phone, ''))) not between 5 and 40
    or char_length(trim(coalesce(p_address, ''))) not between 2 and 240
    or p_birth_date is null
    or p_birth_date > current_date then
    raise exception 'Enter a valid name, email, four-digit PIN, phone, address, and birth date.' using errcode = '22023';
  end if;
  if not exists (select 1 from public.organizations o where o.id = p_organization_id) then
    raise exception 'Select a valid clinic.' using errcode = '22023';
  end if;
  if exists (
    select 1 from public.client_profiles cp
    where cp.organization_id = p_organization_id
      and lower(cp.email) = lower(trim(p_email))
      and cp.status = 'active'
  ) then
    raise exception 'An account already uses this email at the selected clinic. Contact the clinic for help.' using errcode = '23505';
  end if;
  insert into public.client_profiles (
    organization_id, full_name, email, pin_hash, phone, address, birth_date, email_notifications
  ) values (
    p_organization_id, trim(p_full_name), lower(trim(p_email)),
    extensions.crypt(p_pin, extensions.gen_salt('bf')), trim(p_phone), trim(p_address), p_birth_date,
    coalesce(p_email_notifications, false)
  )
  returning id into new_profile_id;
  return new_profile_id;
end;
$$;

drop function if exists public.request_public_service(uuid, uuid, text, text, text);
drop function if exists public.join_public_service(uuid, uuid, text, text);
create function public.join_public_service(
  p_organization_id uuid,
  p_campaign_id uuid,
  p_full_name text,
  p_pin text
)
returns table (join_id uuid, already_joined boolean, assigned_queue_number integer)
language plpgsql
security definer
set search_path = ''
as $$
declare
  client_id uuid;
  matching_count integer;
  same_name_count integer;
  service_join_id uuid;
  already_on_list boolean := false;
  allocated_number integer;
begin
  if char_length(trim(coalesce(p_full_name, ''))) not between 2 and 120
    or coalesce(p_pin, '') !~ '^[0-9]{4}$' then
    raise exception 'Enter your registered full name and four-digit PIN.' using errcode = '22023';
  end if;
  perform 1 from public.service_campaigns c
    where c.id = p_campaign_id and c.organization_id = p_organization_id
      and c.status = 'open'
      and (c.ends_at is null or c.ends_at >= now())
    for update;
  if not found then
    raise exception 'This service is no longer accepting sign-ups.' using errcode = '22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(
    p_organization_id::text || ':' || lower(trim(p_full_name)),
    0
  ));
  select count(*), count(*) filter (
    where cp.pin_hash = extensions.crypt(p_pin, cp.pin_hash)
  )
  into same_name_count, matching_count
  from public.client_profiles cp
  where cp.organization_id = p_organization_id
    and cp.status = 'active'
    and lower(trim(cp.full_name)) = lower(trim(p_full_name));
  if same_name_count = 0 then
    raise exception 'No client account was found with that name. Please register with this clinic before joining a service.' using errcode = '22023';
  elsif matching_count = 1 then
    select cp.id into client_id
    from public.client_profiles cp
    where cp.organization_id = p_organization_id
      and cp.status = 'active'
      and lower(trim(cp.full_name)) = lower(trim(p_full_name))
      and cp.pin_hash = extensions.crypt(p_pin, cp.pin_hash)
    limit 1;
  else
    raise exception 'We could not verify those details. Check your clinic, registered full name, and PIN.' using errcode = '22023';
  end if;
  select csr.id into service_join_id
  from public.client_service_requests csr
  where csr.campaign_id = p_campaign_id and csr.client_profile_id = client_id;
  already_on_list := service_join_id is not null;
  if service_join_id is null then
    insert into public.client_service_requests (
      organization_id, campaign_id, client_profile_id, status
    ) values (
      p_organization_id, p_campaign_id, client_id, 'joined'
    )
    on conflict (campaign_id, client_profile_id) do nothing
    returning id into service_join_id;
    if service_join_id is null then
      already_on_list := true;
      select csr.id into service_join_id
      from public.client_service_requests csr
      where csr.campaign_id = p_campaign_id and csr.client_profile_id = client_id;
    end if;
  end if;

  select qe.queue_number into assigned_queue_number
  from public.queue_entries qe
  where qe.campaign_id = p_campaign_id and qe.client_profile_id = client_id;
  if assigned_queue_number is null then
    update public.service_campaigns c
    set next_queue_number = c.next_queue_number + 1
    where c.id = p_campaign_id
    returning c.next_queue_number - 1 into allocated_number;

    insert into public.queue_entries (
      organization_id, campaign_id, client_profile_id, queue_number
    ) values (
      p_organization_id, p_campaign_id, client_id, allocated_number
    );
    assigned_queue_number := allocated_number;
  end if;
  return query select service_join_id, already_on_list, assigned_queue_number;
end;
$$;

drop function if exists public.register_client_profile(uuid, text, text, text, text, date);
create or replace function public.register_client_profile(
  p_organization_id uuid,
  p_full_name text,
  p_pin text,
  p_phone text,
  p_address text,
  p_birth_date date,
  p_email_notifications boolean
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  new_profile_id uuid;
  verified_email text;
begin
  if auth.uid() is null then
    raise exception 'Sign in with your verified email before completing registration.' using errcode = '42501';
  end if;
  select u.email into verified_email
  from auth.users u
  where u.id = auth.uid() and u.email_confirmed_at is not null;
  if verified_email is null then
    raise exception 'Verify your email before completing registration.' using errcode = '42501';
  end if;
  if p_pin !~ '^[0-9]{4}$' then
    raise exception 'PIN must contain exactly four digits.' using errcode = '22023';
  end if;
  if char_length(trim(p_full_name)) not between 2 and 120
    or char_length(trim(p_phone)) not between 5 and 40
    or char_length(trim(p_address)) not between 2 and 240
    or p_birth_date is null
    or p_birth_date > current_date then
    raise exception 'Enter a valid name, phone, address, and birth date.' using errcode = '22023';
  end if;
  if not exists (select 1 from public.organizations o where o.id = p_organization_id) then
    raise exception 'Select a valid organization.' using errcode = '22023';
  end if;

  insert into public.client_profiles (
    user_id, organization_id, full_name, email, pin_hash, phone, address, birth_date, email_notifications
  ) values (
    auth.uid(), p_organization_id, trim(p_full_name), verified_email,
    extensions.crypt(p_pin, extensions.gen_salt('bf')), trim(p_phone), trim(p_address), p_birth_date,
    coalesce(p_email_notifications, false)
  )
  returning id into new_profile_id;
  return new_profile_id;
end;
$$;

create or replace function public.set_client_email_notifications(p_enabled boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'Sign in to change your email preference.' using errcode = '42501';
  end if;
  update public.client_profiles
  set email_notifications = coalesce(p_enabled, false)
  where user_id = auth.uid() and status = 'active';
  if not found then
    raise exception 'No active client profile was found for this account.' using errcode = '42501';
  end if;
end;
$$;

drop function if exists public.check_in_client(uuid, text, text);

create or replace function public.update_queue_entry_status(p_entry_id uuid, p_status text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_organization_id uuid;
begin
  if p_status not in ('waiting', 'called', 'served', 'cancelled') then
    raise exception 'Invalid queue status.' using errcode = '22023';
  end if;
  select qe.organization_id into target_organization_id
  from public.queue_entries qe where qe.id = p_entry_id;
  if target_organization_id is null
    or not public.has_org_role(target_organization_id, array['owner', 'admin', 'clinician', 'health_worker']) then
    raise exception 'You do not have permission to manage this queue.' using errcode = '42501';
  end if;
  update public.queue_entries qe
  set status = p_status,
      called_at = case when p_status = 'called' then now() else qe.called_at end,
      completed_at = case when p_status in ('served', 'cancelled') then now() else null end
  where qe.id = p_entry_id;
end;
$$;

create or replace function public.create_my_organization(p_name text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  new_organization_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Sign in before creating an organization.' using errcode = '42501';
  end if;
  if exists (
    select 1 from public.organization_memberships m
    where m.user_id = auth.uid() and m.status = 'active'
  ) then
    raise exception 'This account already belongs to an organization.' using errcode = '42501';
  end if;
  if char_length(trim(p_name)) not between 2 and 120 then
    raise exception 'Organization name must be between 2 and 120 characters.' using errcode = '22023';
  end if;

  insert into public.organizations (name)
  values (trim(p_name))
  returning id into new_organization_id;

  insert into public.organization_memberships (organization_id, user_id, role)
  values (new_organization_id, auth.uid(), 'owner');

  return new_organization_id;
end;
$$;

create or replace function public.create_profile_for_auth_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (user_id, display_name)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'full_name', ''))
  on conflict (user_id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created_profile on auth.users;
create trigger on_auth_user_created_profile
  after insert on auth.users
  for each row execute function public.create_profile_for_auth_user();

create or replace function public.record_audit_event()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  affected_row jsonb;
begin
  affected_row := case when tg_op = 'DELETE' then to_jsonb(old) else to_jsonb(new) end;
  insert into public.audit_logs (organization_id, actor_id, action, table_name, record_id)
  values (
    (affected_row ->> 'organization_id')::uuid,
    auth.uid(),
    tg_op,
    tg_table_name,
    (affected_row ->> 'id')::uuid
  );
  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

do $$
declare
  table_to_audit text;
begin
  foreach table_to_audit in array array[
    'facilities', 'communities', 'families', 'patients', 'family_members',
    'patient_visits', 'patient_programs', 'vaccination_records',
    'inventory_items', 'inventory_lots', 'inventory_movements', 'referrals',
    'qr_ids', 'alerts', 'report_runs', 'client_profiles',
    'service_campaigns', 'queue_entries', 'client_service_requests'
  ]
  loop
    execute format('drop trigger if exists audit_row_change on public.%I', table_to_audit);
    execute format(
      'create trigger audit_row_change after insert or update or delete on public.%I for each row execute function public.record_audit_event()',
      table_to_audit
    );
  end loop;
end;
$$;

drop function if exists public.submit_public_service_request(uuid, uuid, text, text, text);
drop function if exists public.set_public_client_email_notifications(uuid, text, text, boolean);

revoke all on function public.is_org_member(uuid) from public, anon;
revoke all on function public.has_org_role(uuid, text[]) from public, anon;
revoke all on function public.my_organizations() from public, anon;
revoke all on function public.create_my_organization(text) from public, anon, authenticated;
revoke all on function public.list_public_organizations() from public;
revoke all on function public.consume_public_rate_limit(text, integer, integer) from public, anon, authenticated;
revoke all on function public.register_public_client_profile(uuid, text, text, text, text, text, date, boolean) from public, anon, authenticated;
revoke all on function public.verify_public_client_credentials(uuid, text, text) from public, anon, authenticated;
revoke all on function public.join_public_service(uuid, uuid, text, text) from public, anon, authenticated;
revoke all on function public.register_client_profile(uuid, text, text, text, text, date, boolean) from public, anon;
revoke all on function public.set_client_email_notifications(boolean) from public, anon;
revoke all on function public.update_queue_entry_status(uuid, text) from public, anon;
grant execute on function public.list_public_organizations() to anon, authenticated;
grant execute on function public.consume_public_rate_limit(text, integer, integer) to service_role;
grant execute on function public.register_public_client_profile(uuid, text, text, text, text, text, date, boolean) to service_role;
grant execute on function public.verify_public_client_credentials(uuid, text, text) to service_role;
grant execute on function public.join_public_service(uuid, uuid, text, text) to service_role;
grant execute on function public.register_client_profile(uuid, text, text, text, text, date, boolean) to authenticated;
grant execute on function public.set_client_email_notifications(boolean) to authenticated;
grant execute on function public.update_queue_entry_status(uuid, text) to authenticated;
grant execute on function public.is_org_member(uuid) to authenticated;
grant execute on function public.has_org_role(uuid, text[]) to authenticated;
grant execute on function public.my_organizations() to authenticated;

revoke all on all tables in schema public from anon, authenticated;
grant select on public.organizations, public.organization_memberships, public.profiles to authenticated;
grant select on public.service_campaigns to anon, authenticated;
revoke all on public.service_campaigns from anon;
grant select (id, organization_id, title, service_type, description, starts_at, ends_at, status)
  on public.service_campaigns to anon;
grant select (
  id, user_id, organization_id, full_name, email, phone, address, birth_date,
  email_notifications, status, created_at, updated_at
) on public.client_profiles to authenticated;
grant update(status) on public.client_profiles to authenticated;
grant select, insert, update, delete on public.service_campaigns to authenticated;
grant select, update on public.queue_entries to authenticated;
grant select, update on public.client_service_requests to authenticated;
grant all on public.client_profiles, public.client_service_requests, public.public_api_rate_limits to service_role;
grant all on public.service_campaigns to service_role;
grant select, insert, update, delete on
  public.facilities,
  public.communities,
  public.families,
  public.patients,
  public.family_members,
  public.patient_visits,
  public.patient_programs,
  public.vaccination_records,
  public.inventory_items,
  public.inventory_lots,
  public.inventory_movements,
  public.referrals,
  public.qr_ids,
  public.alerts,
  public.report_runs
to authenticated;
grant select on public.audit_logs to authenticated;

alter table public.organizations enable row level security;
alter table public.organization_memberships enable row level security;
alter table public.profiles enable row level security;
alter table public.facilities enable row level security;
alter table public.communities enable row level security;
alter table public.families enable row level security;
alter table public.patients enable row level security;
alter table public.family_members enable row level security;
alter table public.patient_visits enable row level security;
alter table public.patient_programs enable row level security;
alter table public.vaccination_records enable row level security;
alter table public.inventory_items enable row level security;
alter table public.inventory_lots enable row level security;
alter table public.inventory_movements enable row level security;
alter table public.referrals enable row level security;
alter table public.qr_ids enable row level security;
alter table public.alerts enable row level security;
alter table public.report_runs enable row level security;
alter table public.audit_logs enable row level security;
alter table public.client_profiles enable row level security;
alter table public.service_campaigns enable row level security;
alter table public.queue_entries enable row level security;
alter table public.client_service_requests enable row level security;
alter table public.public_api_rate_limits enable row level security;

drop policy if exists organization_member_read on public.organizations;
create policy organization_member_read on public.organizations
  for select to authenticated using (public.is_org_member(id));

drop policy if exists membership_self_or_admin_read on public.organization_memberships;
create policy membership_self_or_admin_read on public.organization_memberships
  for select to authenticated
  using (user_id = (select auth.uid()) or public.has_org_role(organization_id, array['owner', 'admin']));

drop policy if exists profile_self_read on public.profiles;
create policy profile_self_read on public.profiles
  for select to authenticated using (user_id = (select auth.uid()));
drop policy if exists profile_self_update on public.profiles;
create policy profile_self_update on public.profiles
  for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

drop policy if exists client_profile_self_or_staff_read on public.client_profiles;
create policy client_profile_self_or_staff_read on public.client_profiles
  for select to authenticated
  using (user_id = (select auth.uid()) or public.is_org_member(organization_id));
drop policy if exists client_profile_staff_update on public.client_profiles;
create policy client_profile_staff_update on public.client_profiles
  for update to authenticated
  using (public.has_org_role(organization_id, array['owner', 'admin']))
  with check (public.has_org_role(organization_id, array['owner', 'admin']));

drop policy if exists open_campaign_public_read on public.service_campaigns;
create policy open_campaign_public_read on public.service_campaigns
  for select to anon, authenticated using (status = 'open');
drop policy if exists client_campaign_history_read on public.service_campaigns;
create policy client_campaign_history_read on public.service_campaigns
  for select to authenticated using (exists (
    select 1 from public.queue_entries qe
    join public.client_profiles cp on cp.id = qe.client_profile_id
    where qe.campaign_id = service_campaigns.id and cp.user_id = (select auth.uid())
  ));
drop policy if exists client_queue_self_read on public.queue_entries;
create policy client_queue_self_read on public.queue_entries
  for select to authenticated
  using (exists (
    select 1 from public.client_profiles cp
    where cp.id = client_profile_id and cp.user_id = (select auth.uid())
  ));
drop policy if exists queue_staff_org_read on public.queue_entries;
create policy queue_staff_org_read on public.queue_entries
  for select to authenticated using (public.is_org_member(organization_id));
drop policy if exists queue_staff_update on public.queue_entries;
create policy queue_staff_update on public.queue_entries
  for update to authenticated
  using (public.has_org_role(organization_id, array['owner', 'admin', 'clinician', 'health_worker']))
  with check (public.has_org_role(organization_id, array['owner', 'admin', 'clinician', 'health_worker']));

drop policy if exists client_service_requests_staff_read on public.client_service_requests;
create policy client_service_requests_staff_read on public.client_service_requests
  for select to authenticated using (public.is_org_member(organization_id));
drop policy if exists client_service_requests_staff_update on public.client_service_requests;
create policy client_service_requests_staff_update on public.client_service_requests
  for update to authenticated
  using (public.has_org_role(organization_id, array['owner', 'admin', 'clinician', 'health_worker']))
  with check (public.has_org_role(organization_id, array['owner', 'admin', 'clinician', 'health_worker']));

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'facilities', 'communities', 'families', 'patients', 'family_members',
    'patient_visits', 'patient_programs', 'vaccination_records',
    'inventory_items', 'inventory_lots', 'inventory_movements', 'referrals',
    'qr_ids', 'alerts', 'report_runs'
  ]
  loop
    execute format('drop policy if exists org_member_select on public.%I', table_name);
    execute format('create policy org_member_select on public.%I for select to authenticated using (public.is_org_member(organization_id))', table_name);
    execute format('drop policy if exists org_staff_insert on public.%I', table_name);
    if table_name in ('facilities', 'communities') then
      execute format(
        'create policy org_staff_insert on public.%I for insert to authenticated with check (public.has_org_role(organization_id, array[''owner'', ''admin'']))',
        table_name
      );
      execute format('drop policy if exists org_staff_update on public.%I', table_name);
      execute format(
        'create policy org_staff_update on public.%I for update to authenticated using (public.has_org_role(organization_id, array[''owner'', ''admin''])) with check (public.has_org_role(organization_id, array[''owner'', ''admin'']))',
        table_name
      );
    elsif table_name in ('inventory_items', 'inventory_lots', 'inventory_movements') then
      execute format(
        'create policy org_staff_insert on public.%I for insert to authenticated with check (public.has_org_role(organization_id, array[''owner'', ''admin'', ''inventory_manager'']))',
        table_name
      );
      execute format('drop policy if exists org_staff_update on public.%I', table_name);
      execute format(
        'create policy org_staff_update on public.%I for update to authenticated using (public.has_org_role(organization_id, array[''owner'', ''admin'', ''inventory_manager''])) with check (public.has_org_role(organization_id, array[''owner'', ''admin'', ''inventory_manager'']))',
        table_name
      );
    elsif table_name = 'report_runs' then
      execute format(
        'create policy org_staff_insert on public.%I for insert to authenticated with check (public.has_org_role(organization_id, array[''owner'', ''admin'']))',
        table_name
      );
      execute format('drop policy if exists org_staff_update on public.%I', table_name);
      execute format(
        'create policy org_staff_update on public.%I for update to authenticated using (public.has_org_role(organization_id, array[''owner'', ''admin''])) with check (public.has_org_role(organization_id, array[''owner'', ''admin'']))',
        table_name
      );
    else
      execute format(
        'create policy org_staff_insert on public.%I for insert to authenticated with check (public.has_org_role(organization_id, array[''owner'', ''admin'', ''clinician'', ''health_worker'']))',
        table_name
      );
      execute format('drop policy if exists org_staff_update on public.%I', table_name);
      execute format(
        'create policy org_staff_update on public.%I for update to authenticated using (public.has_org_role(organization_id, array[''owner'', ''admin'', ''clinician'', ''health_worker''])) with check (public.has_org_role(organization_id, array[''owner'', ''admin'', ''clinician'', ''health_worker'']))',
        table_name
      );
    end if;
    execute format('drop policy if exists org_admin_delete on public.%I', table_name);
    execute format(
      'create policy org_admin_delete on public.%I for delete to authenticated using (public.has_org_role(organization_id, array[''owner'', ''admin'']))',
      table_name
    );
  end loop;
end;
$$;

drop policy if exists org_member_select on public.service_campaigns;
drop policy if exists org_staff_insert on public.service_campaigns;
drop policy if exists org_staff_update on public.service_campaigns;
drop policy if exists org_admin_delete on public.service_campaigns;
drop policy if exists service_campaign_staff_read on public.service_campaigns;
create policy service_campaign_staff_read on public.service_campaigns
  for select to authenticated using (public.is_org_member(organization_id));
drop policy if exists service_campaign_staff_insert on public.service_campaigns;
create policy service_campaign_staff_insert on public.service_campaigns
  for insert to authenticated
  with check (public.has_org_role(organization_id, array['owner', 'admin', 'clinician']));
drop policy if exists service_campaign_staff_update on public.service_campaigns;
create policy service_campaign_staff_update on public.service_campaigns
  for update to authenticated
  using (public.has_org_role(organization_id, array['owner', 'admin', 'clinician']))
  with check (public.has_org_role(organization_id, array['owner', 'admin', 'clinician']));
drop policy if exists service_campaign_admin_delete on public.service_campaigns;
create policy service_campaign_admin_delete on public.service_campaigns
  for delete to authenticated using (public.has_org_role(organization_id, array['owner', 'admin']));

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = 'queue_entries'
    ) then
      alter publication supabase_realtime add table public.queue_entries;
    end if;
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = 'client_service_requests'
    ) then
      alter publication supabase_realtime add table public.client_service_requests;
    end if;
  end if;
end;
$$;

drop policy if exists audit_admin_read on public.audit_logs;
create policy audit_admin_read on public.audit_logs
  for select to authenticated
  using (public.has_org_role(organization_id, array['owner', 'admin']));

commit;
