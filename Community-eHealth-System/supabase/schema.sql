-- Demo-only schema. These policies expose synthetic sample data to the
-- unauthenticated prototype. Never put real patient or health information here.

create sequence if not exists public.demo_patient_id_seq start with 2049;

create table if not exists public.demo_patients (
  id uuid primary key default gen_random_uuid(),
  patient_id text not null unique default ('P-' || nextval('public.demo_patient_id_seq')),
  full_name text not null check (char_length(trim(full_name)) between 1 and 120),
  age integer check (age is null or age between 0 and 125),
  sex text,
  community text not null,
  program text not null,
  status text not null default 'Active',
  initials text not null,
  avatar_color text not null default 'mint',
  created_at timestamptz not null default now()
);

alter table public.demo_patients enable row level security;

revoke all on table public.demo_patients from public, anon, authenticated;
grant select, insert on table public.demo_patients to anon;
grant usage on sequence public.demo_patient_id_seq to anon;

drop policy if exists "Public can read demo patients" on public.demo_patients;
create policy "Public can read demo patients"
  on public.demo_patients
  for select
  to anon
  using (true);

drop policy if exists "Public can add demo patients" on public.demo_patients;
create policy "Public can add demo patients"
  on public.demo_patients
  for insert
  to anon
  with check (true);

insert into public.demo_patients
  (patient_id, full_name, age, sex, community, program, status, initials, avatar_color)
values
  ('P-2048', 'Amara Okafor', 34, 'Female', 'Northside', 'Maternal care', 'Active', 'AO', 'lavender'),
  ('P-2047', 'Daniel Mensah', 58, 'Male', 'Riverside', 'Hypertension', 'Follow-up', 'DM', 'blue'),
  ('P-2046', 'Grace Ndlovu', 7, 'Female', 'East Ward', 'Child wellness', 'Active', 'GN', 'peach'),
  ('P-2045', 'Joseph Kamau', 42, 'Male', 'Hillview', 'Diabetes care', 'Review due', 'JK', 'mint'),
  ('P-2044', 'Fatima Abdi', 26, 'Female', 'Northside', 'Antenatal care', 'Active', 'FA', 'rose')
on conflict (patient_id) do nothing;

select setval(
  'public.demo_patient_id_seq',
  greatest(2049, coalesce(max(substring(patient_id from 3)::integer), 2048) + 1),
  false
)
from public.demo_patients
where patient_id ~ '^P-[0-9]+$';
