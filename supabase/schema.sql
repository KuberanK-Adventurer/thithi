-- Thithi database setup. Paste into Supabase: SQL Editor > New query > Run.
-- Each person can only see, add, change or delete their own records.

create table if not exists public.memorials (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name         text not null check (char_length(name) between 1 and 100),
  death_date   date not null,
  death_time   time,                       -- null = not known (noon is used)
  lived        jsonb not null,             -- {name, lat, lng, tz}: where they lived when they passed
  hometown     jsonb not null,             -- {name, lat, lng, tz}
  region       text not null default 'Tamil Nadu',
  email_reminders boolean not null default true,
  created_at   timestamptz not null default now()
);

create index if not exists memorials_user_id on public.memorials (user_id);

alter table public.memorials enable row level security;

drop policy if exists "own rows: read"   on public.memorials;
drop policy if exists "own rows: insert" on public.memorials;
drop policy if exists "own rows: update" on public.memorials;
drop policy if exists "own rows: delete" on public.memorials;

create policy "own rows: read"   on public.memorials for select using (auth.uid() = user_id);
create policy "own rows: insert" on public.memorials for insert with check (auth.uid() = user_id);
create policy "own rows: update" on public.memorials for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own rows: delete" on public.memorials for delete using (auth.uid() = user_id);

-- Log of reminder emails already sent, so nobody gets the same reminder twice.
-- Only the daily reminder job (using the secret service key) reads or writes this table.
create table if not exists public.reminders_sent (
  memorial_id uuid not null references public.memorials (id) on delete cascade,
  for_date    date not null,
  place       text not null,
  sent_at     timestamptz not null default now(),
  primary key (memorial_id, for_date, place)
);
alter table public.reminders_sent enable row level security;  -- no policies: closed to the website

-- Table permissions. Newer Supabase projects may not grant these automatically.
grant select, insert, update, delete on public.memorials to authenticated;
grant select on public.memorials to service_role;
grant select, insert on public.reminders_sent to service_role;
