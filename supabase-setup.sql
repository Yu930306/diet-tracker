-- diet-tracker · Supabase setup
-- Run this whole file once in Supabase Dashboard → SQL Editor → New query → Run.
-- Project: diet-tracker (Reconet org, ap-southeast-1, Free plan)
-- https://supabase.com/dashboard/project/udtijnuefwfvgnjyofyx/sql
--
-- SECURITY MODEL (agreed): two phones share one room code, no accounts.
-- Row Level Security is ON for every table; the anon key may read/write
-- rows, but every query in the app filters by room_code, and the room
-- code is the shared secret (like a shared password). Do NOT put the
-- service_role key in the app. If a stricter model is wanted later,
-- tighten these policies to check room_code against a per-room JWT claim.

-- ---------- tables ----------
create table if not exists public.profiles (
  room_code text not null,
  id text not null,
  name text not null,
  sex text default '',
  age int,
  height_cm numeric,
  start_weight_kg numeric,
  plan_start_date date,
  snack_time text default '20:00',
  primary key (room_code, id)
);

create table if not exists public.meal_plans (
  id uuid primary key default gen_random_uuid(),
  room_code text not null,
  profile_id text not null,
  date date not null,
  meal text not null check (meal in ('lunch', 'dinner', 'snack')),
  content text not null default '',
  updated_at timestamptz not null default now(),
  unique (room_code, profile_id, date, meal)
);

create table if not exists public.food_items (
  id uuid primary key default gen_random_uuid(),
  room_code text not null,
  profile_id text not null,
  date date not null,
  meal text not null check (meal in ('lunch', 'dinner', 'snack')),
  name text not null,
  grams numeric not null,
  carbs100 numeric not null default 0,
  protein100 numeric not null default 0,
  fat100 numeric not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.meal_photos (
  id uuid primary key default gen_random_uuid(),
  room_code text not null,
  profile_id text not null,
  date date not null,
  meal text not null check (meal in ('lunch', 'dinner', 'snack')),
  url text not null,
  path text,
  created_at timestamptz not null default now()
);

-- check-ins: one row per profile+date+meal; done=true counts toward the weekly total.
create table if not exists public.checkins (
  room_code text not null,
  profile_id text not null,
  date date not null,
  meal text not null check (meal in ('lunch', 'dinner', 'snack')),
  done boolean not null default false,
  updated_at timestamptz not null default now(),
  primary key (room_code, profile_id, date, meal)
);

-- weight: ONE row per profile per week (not per day).
create table if not exists public.weight_records (
  room_code text not null,
  profile_id text not null,
  week_start date not null,
  weight_jin numeric not null,
  note text default '',
  updated_at timestamptz not null default now(),
  primary key (room_code, profile_id, week_start)
);

-- ---------- indexes ----------
create index if not exists idx_meal_plans_room_date on public.meal_plans (room_code, profile_id, date);
create index if not exists idx_food_items_room_date on public.food_items (room_code, profile_id, date);
create index if not exists idx_checkins_room_date on public.checkins (room_code, profile_id, date);
create index if not exists idx_weight_room on public.weight_records (room_code, profile_id, week_start desc);

-- ---------- Row Level Security (ON for every table) ----------
alter table public.profiles enable row level security;
alter table public.meal_plans enable row level security;
alter table public.food_items enable row level security;
alter table public.meal_photos enable row level security;
alter table public.checkins enable row level security;
alter table public.weight_records enable row level security;

-- Permissive anon policies (shared-room model: room_code is the gate,
-- enforced by the app filtering every query by room_code).
do $$
declare t text;
begin
  foreach t in array array['profiles','meal_plans','food_items','meal_photos','checkins','weight_records'] loop
    execute format('drop policy if exists "anon_all" on public.%I', t);
    execute format('create policy "anon_all" on public.%I for all to anon using (true) with check (true)', t);
  end loop;
end $$;

-- ---------- photo storage ----------
insert into storage.buckets (id, name, public)
values ('meal-photos', 'meal-photos', true)
on conflict (id) do nothing;

drop policy if exists "anon_storage_all" on storage.objects;
create policy "anon_storage_all" on storage.objects
  for all to anon using (bucket_id = 'meal-photos') with check (bucket_id = 'meal-photos');

-- ---------- verify ----------
select 'tables' as what, count(*) from information_schema.tables where table_schema='public' and table_name in ('profiles','meal_plans','food_items','meal_photos','checkins','weight_records');
select 'rls on' as what, count(*) from pg_tables where schemaname='public' and tablename in ('profiles','meal_plans','food_items','meal_photos','checkins','weight_records') and rowsecurity = true;
