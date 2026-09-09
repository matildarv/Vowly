-- ============================================================================
-- Vow & Co. — Stage 1 backend schema
-- ============================================================================
-- Safe to run once against a brand-new Supabase project's SQL editor.
-- Ownership chain enforced by Row Level Security:
--
--   auth.users (Supabase-managed)
--     -> profiles         (one row per signed-up person, role: couple | admin)
--       -> weddings       (one row per wedding, owned by a profile)
--         -> guests
--         -> tables
--         -> tasks
--         -> appointments
--         -> budget_items
--         -> wedding_settings
--
-- Deliberately NOT included in Stage 1 (kept for Stage 2 so this schema
-- doesn't need breaking changes later): vendors, vendor_relationships,
-- enquiries, quotes, bookings. budget_items.vendor_name is a plain text
-- column, not a foreign key, so a booked vendor can be named on a budget
-- line today without the marketplace tables existing yet.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Extensions
-- ---------------------------------------------------------------------------
create extension if not exists "pgcrypto"; -- gen_random_uuid()

-- ---------------------------------------------------------------------------
-- Shared helper: keep updated_at current on every row update
-- ---------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ============================================================================
-- PROFILES
-- One row per authenticated person. Created on first login by the app
-- (see js/auth.js ensureProfile) rather than by a database trigger, so the
-- app can attach the name captured during signup.
-- ============================================================================
create table if not exists public.profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users (id) on delete cascade,
  first_name text,
  last_name text,
  phone text,
  role text not null default 'couple' check (role in ('couple', 'admin')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists profiles_user_id_idx on public.profiles (user_id);

drop trigger if exists set_updated_at on public.profiles;
create trigger set_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

alter table public.profiles enable row level security;

-- A person can see and manage only their own profile row.
drop policy if exists "profiles: select own" on public.profiles;
create policy "profiles: select own" on public.profiles
  for select using (auth.uid() = user_id);

drop policy if exists "profiles: insert own" on public.profiles;
create policy "profiles: insert own" on public.profiles
  for insert with check (auth.uid() = user_id);

drop policy if exists "profiles: update own" on public.profiles;
create policy "profiles: update own" on public.profiles
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ============================================================================
-- WEDDINGS
-- One row per wedding. couple_id references the *profile*, not the auth
-- user directly, so a future admin/vendor-facing view can reason purely in
-- terms of profiles.
-- ============================================================================
create table if not exists public.weddings (
  id uuid primary key default gen_random_uuid(),
  couple_id uuid not null references public.profiles (id) on delete cascade,
  partner_one_name text,
  partner_two_name text,
  wedding_date date,
  location text,
  guest_count integer,
  budget numeric(12, 2),
  style text,
  ceremony_type text,
  reception_type text,
  -- Holds the extra wedding-details fields the existing "Tell us more about
  -- your day" page already collects that don't have their own column above
  -- (dress code, what's already booked, what still needs help, free-text
  -- priorities). See js/data.js for the exact keys.
  extra jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists weddings_couple_id_idx on public.weddings (couple_id);

drop trigger if exists set_updated_at on public.weddings;
create trigger set_updated_at
  before update on public.weddings
  for each row execute function public.set_updated_at();

alter table public.weddings enable row level security;

-- Ownership check reused by every child table below: does this wedding_id
-- belong to a profile owned by the current auth user?
create or replace function public.owns_wedding(wedding uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.weddings w
    join public.profiles p on p.id = w.couple_id
    where w.id = wedding
      and p.user_id = auth.uid()
  );
$$;

drop policy if exists "weddings: select own" on public.weddings;
create policy "weddings: select own" on public.weddings
  for select using (
    couple_id in (select id from public.profiles where user_id = auth.uid())
  );

drop policy if exists "weddings: insert own" on public.weddings;
create policy "weddings: insert own" on public.weddings
  for insert with check (
    couple_id in (select id from public.profiles where user_id = auth.uid())
  );

drop policy if exists "weddings: update own" on public.weddings;
create policy "weddings: update own" on public.weddings
  for update using (
    couple_id in (select id from public.profiles where user_id = auth.uid())
  ) with check (
    couple_id in (select id from public.profiles where user_id = auth.uid())
  );

drop policy if exists "weddings: delete own" on public.weddings;
create policy "weddings: delete own" on public.weddings
  for delete using (
    couple_id in (select id from public.profiles where user_id = auth.uid())
  );

-- ============================================================================
-- GUESTS
-- ============================================================================
create table if not exists public.guests (
  id uuid primary key default gen_random_uuid(),
  wedding_id uuid not null references public.weddings (id) on delete cascade,
  first_name text,
  last_name text,
  email text,
  phone text,
  rsvp_status text not null default 'pending' check (rsvp_status in ('pending', 'invited', 'attending', 'declined')),
  guest_type text not null default 'guest' check (guest_type in ('guest', 'plus_one', 'child')),
  plus_one_allowed boolean not null default false,
  plus_one_name text,
  dietary_requirement text,
  relationship_group text,
  side_of_couple text,
  table_id uuid,
  seat_number integer,
  notes text,
  -- Holds the extra fields the existing guest/seating UI already relies on
  -- that don't have their own named column above (e.g. plus-one linking
  -- between two guest rows, invitation-sent tracking, last-seated table for
  -- RSVP-decline/undo). Added so nothing the current app does is lost —
  -- see js/data.js for the exact keys it reads/writes.
  extra jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists guests_wedding_id_idx on public.guests (wedding_id);
create index if not exists guests_table_id_idx on public.guests (table_id);

drop trigger if exists set_updated_at on public.guests;
create trigger set_updated_at
  before update on public.guests
  for each row execute function public.set_updated_at();

alter table public.guests enable row level security;

drop policy if exists "guests: select own wedding" on public.guests;
create policy "guests: select own wedding" on public.guests
  for select using (public.owns_wedding(wedding_id));

drop policy if exists "guests: insert own wedding" on public.guests;
create policy "guests: insert own wedding" on public.guests
  for insert with check (public.owns_wedding(wedding_id));

drop policy if exists "guests: update own wedding" on public.guests;
create policy "guests: update own wedding" on public.guests
  for update using (public.owns_wedding(wedding_id)) with check (public.owns_wedding(wedding_id));

drop policy if exists "guests: delete own wedding" on public.guests;
create policy "guests: delete own wedding" on public.guests
  for delete using (public.owns_wedding(wedding_id));

-- ============================================================================
-- TABLES (seating tables — plural table name kept as "tables" per spec;
-- schema-qualified as public.tables throughout to stay unambiguous)
-- ============================================================================
create table if not exists public.tables (
  id uuid primary key default gen_random_uuid(),
  wedding_id uuid not null references public.weddings (id) on delete cascade,
  name text,
  capacity integer,
  shape text default 'Round',
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists tables_wedding_id_idx on public.tables (wedding_id);

drop trigger if exists set_updated_at on public.tables;
create trigger set_updated_at
  before update on public.tables
  for each row execute function public.set_updated_at();

alter table public.tables enable row level security;

drop policy if exists "tables: select own wedding" on public.tables;
create policy "tables: select own wedding" on public.tables
  for select using (public.owns_wedding(wedding_id));

drop policy if exists "tables: insert own wedding" on public.tables;
create policy "tables: insert own wedding" on public.tables
  for insert with check (public.owns_wedding(wedding_id));

drop policy if exists "tables: update own wedding" on public.tables;
create policy "tables: update own wedding" on public.tables
  for update using (public.owns_wedding(wedding_id)) with check (public.owns_wedding(wedding_id));

drop policy if exists "tables: delete own wedding" on public.tables;
create policy "tables: delete own wedding" on public.tables
  for delete using (public.owns_wedding(wedding_id));

-- guests.table_id -> tables.id, added after both tables exist.
alter table public.guests
  drop constraint if exists guests_table_id_fkey;
alter table public.guests
  add constraint guests_table_id_fkey foreign key (table_id) references public.tables (id) on delete set null;

-- ============================================================================
-- TASKS
-- ============================================================================
create table if not exists public.tasks (
  id uuid primary key default gen_random_uuid(),
  wedding_id uuid not null references public.weddings (id) on delete cascade,
  title text not null,
  description text,
  category text,
  due_date date,
  priority text default 'medium',
  completed boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists tasks_wedding_id_idx on public.tasks (wedding_id);

drop trigger if exists set_updated_at on public.tasks;
create trigger set_updated_at
  before update on public.tasks
  for each row execute function public.set_updated_at();

alter table public.tasks enable row level security;

drop policy if exists "tasks: select own wedding" on public.tasks;
create policy "tasks: select own wedding" on public.tasks
  for select using (public.owns_wedding(wedding_id));

drop policy if exists "tasks: insert own wedding" on public.tasks;
create policy "tasks: insert own wedding" on public.tasks
  for insert with check (public.owns_wedding(wedding_id));

drop policy if exists "tasks: update own wedding" on public.tasks;
create policy "tasks: update own wedding" on public.tasks
  for update using (public.owns_wedding(wedding_id)) with check (public.owns_wedding(wedding_id));

drop policy if exists "tasks: delete own wedding" on public.tasks;
create policy "tasks: delete own wedding" on public.tasks
  for delete using (public.owns_wedding(wedding_id));

-- ============================================================================
-- APPOINTMENTS
-- No foreign key to a vendor table yet (Stage 2) — vendor_name is free text,
-- same as the existing demo data model.
-- ============================================================================
create table if not exists public.appointments (
  id uuid primary key default gen_random_uuid(),
  wedding_id uuid not null references public.weddings (id) on delete cascade,
  title text,
  vendor_name text,
  date date,
  time time,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists appointments_wedding_id_idx on public.appointments (wedding_id);

drop trigger if exists set_updated_at on public.appointments;
create trigger set_updated_at
  before update on public.appointments
  for each row execute function public.set_updated_at();

alter table public.appointments enable row level security;

drop policy if exists "appointments: select own wedding" on public.appointments;
create policy "appointments: select own wedding" on public.appointments
  for select using (public.owns_wedding(wedding_id));

drop policy if exists "appointments: insert own wedding" on public.appointments;
create policy "appointments: insert own wedding" on public.appointments
  for insert with check (public.owns_wedding(wedding_id));

drop policy if exists "appointments: update own wedding" on public.appointments;
create policy "appointments: update own wedding" on public.appointments
  for update using (public.owns_wedding(wedding_id)) with check (public.owns_wedding(wedding_id));

drop policy if exists "appointments: delete own wedding" on public.appointments;
create policy "appointments: delete own wedding" on public.appointments
  for delete using (public.owns_wedding(wedding_id));

-- ============================================================================
-- BUDGET_ITEMS
-- vendor_name is plain text (not a foreign key) so the existing "booking a
-- vendor creates a budget line" feature keeps working without Stage 2's
-- vendor tables existing yet.
-- ============================================================================
create table if not exists public.budget_items (
  id uuid primary key default gen_random_uuid(),
  wedding_id uuid not null references public.weddings (id) on delete cascade,
  category text,
  name text,
  description text,
  vendor_name text,
  estimated_amount numeric(12, 2) not null default 0,
  quoted_amount numeric(12, 2) not null default 0,
  committed_amount numeric(12, 2) not null default 0,
  paid_amount numeric(12, 2) not null default 0,
  due_date date,
  status text not null default 'estimated' check (status in ('estimated', 'quoted', 'booked', 'paid')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists budget_items_wedding_id_idx on public.budget_items (wedding_id);

drop trigger if exists set_updated_at on public.budget_items;
create trigger set_updated_at
  before update on public.budget_items
  for each row execute function public.set_updated_at();

alter table public.budget_items enable row level security;

drop policy if exists "budget_items: select own wedding" on public.budget_items;
create policy "budget_items: select own wedding" on public.budget_items
  for select using (public.owns_wedding(wedding_id));

drop policy if exists "budget_items: insert own wedding" on public.budget_items;
create policy "budget_items: insert own wedding" on public.budget_items
  for insert with check (public.owns_wedding(wedding_id));

drop policy if exists "budget_items: update own wedding" on public.budget_items;
create policy "budget_items: update own wedding" on public.budget_items
  for update using (public.owns_wedding(wedding_id)) with check (public.owns_wedding(wedding_id));

drop policy if exists "budget_items: delete own wedding" on public.budget_items;
create policy "budget_items: delete own wedding" on public.budget_items
  for delete using (public.owns_wedding(wedding_id));

-- ============================================================================
-- WEDDING_SETTINGS
-- One row per wedding, created alongside it. Kept separate from `weddings`
-- so Stage-2-and-later settings (e.g. per-vendor visibility, notification
-- preferences) can be added without widening the core wedding row.
-- ============================================================================
create table if not exists public.wedding_settings (
  id uuid primary key default gen_random_uuid(),
  wedding_id uuid not null unique references public.weddings (id) on delete cascade,
  currency text not null default 'AUD',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists wedding_settings_wedding_id_idx on public.wedding_settings (wedding_id);

drop trigger if exists set_updated_at on public.wedding_settings;
create trigger set_updated_at
  before update on public.wedding_settings
  for each row execute function public.set_updated_at();

alter table public.wedding_settings enable row level security;

drop policy if exists "wedding_settings: select own wedding" on public.wedding_settings;
create policy "wedding_settings: select own wedding" on public.wedding_settings
  for select using (public.owns_wedding(wedding_id));

drop policy if exists "wedding_settings: insert own wedding" on public.wedding_settings;
create policy "wedding_settings: insert own wedding" on public.wedding_settings
  for insert with check (public.owns_wedding(wedding_id));

drop policy if exists "wedding_settings: update own wedding" on public.wedding_settings;
create policy "wedding_settings: update own wedding" on public.wedding_settings
  for update using (public.owns_wedding(wedding_id)) with check (public.owns_wedding(wedding_id));

drop policy if exists "wedding_settings: delete own wedding" on public.wedding_settings;
create policy "wedding_settings: delete own wedding" on public.wedding_settings
  for delete using (public.owns_wedding(wedding_id));

-- ============================================================================
-- Done. Everything above is idempotent (create if not exists / drop-then-
-- create policy), so re-running this file against the same project is safe.
-- ============================================================================
