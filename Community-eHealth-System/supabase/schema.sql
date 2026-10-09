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

create extension if not exists pgcrypto;

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
    'inventory_items', 'referrals', 'alerts'
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
    'qr_ids', 'alerts', 'report_runs'
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

revoke all on function public.is_org_member(uuid) from public, anon;
revoke all on function public.has_org_role(uuid, text[]) from public, anon;
revoke all on function public.my_organizations() from public, anon;
revoke all on function public.create_my_organization(text) from public, anon;
grant execute on function public.is_org_member(uuid) to authenticated;
grant execute on function public.has_org_role(uuid, text[]) to authenticated;
grant execute on function public.my_organizations() to authenticated;
grant execute on function public.create_my_organization(text) to authenticated;

revoke all on all tables in schema public from anon, authenticated;
grant select on public.organizations, public.organization_memberships, public.profiles to authenticated;
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

drop policy if exists audit_admin_read on public.audit_logs;
create policy audit_admin_read on public.audit_logs
  for select to authenticated
  using (public.has_org_role(organization_id, array['owner', 'admin']));

commit;
