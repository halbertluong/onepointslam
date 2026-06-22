-- Enable UUID extension
create extension if not exists "uuid-ossp";

-- ============================================================
-- TENANTS
-- ============================================================
create table if not exists tenants (
  id uuid primary key default uuid_generate_v4(),
  slug text unique not null,
  display_name text not null,
  logo_url text,
  primary_color text not null default '#1d4ed8',
  secondary_color text not null default '#7c3aed',
  stripe_connect_account_id text,
  created_at timestamptz not null default now()
);

-- ============================================================
-- USERS (mirrors auth.users with role metadata)
-- ============================================================
create table if not exists users (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  role text not null check (role in ('super_admin', 'tenant_admin', 'referee', 'player')) default 'player',
  assigned_tenant_ids uuid[] not null default '{}',
  created_at timestamptz not null default now()
);

-- Auto-insert user row on signup
create or replace function handle_new_user()
returns trigger language plpgsql security definer as $$
begin
  insert into public.users (id, email, role)
  values (new.id, new.email, coalesce(new.raw_user_meta_data->>'role', 'player'));
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure handle_new_user();

-- ============================================================
-- TOURNAMENTS
-- ============================================================
create table if not exists tournaments (
  id uuid primary key default uuid_generate_v4(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  name text not null,
  status text not null check (status in (
    'registration_open', 'registration_closed', 'bracket_generated', 'live_play', 'completed'
  )) default 'registration_open',
  settings jsonb not null default '{}',
  registration_close_reason text check (registration_close_reason in (
    'manual_override', 'deadline_passed', 'cap_reached'
  )),
  created_at timestamptz not null default now()
);

-- ============================================================
-- PLAYERS
-- ============================================================
create table if not exists players (
  id uuid primary key default uuid_generate_v4(),
  tournament_id uuid not null references tournaments(id) on delete cascade,
  full_name text not null,
  email text not null,
  seed_rating int check (seed_rating between 1 and 8),
  skill_tier text,
  status text not null check (status in ('registered', 'checked_in', 'no_show_eliminated')) default 'registered',
  stripe_payment_intent_id text,
  created_at timestamptz not null default now()
);

-- ============================================================
-- MATCHES
-- ============================================================
create table if not exists matches (
  id text primary key,
  tournament_id uuid not null references tournaments(id) on delete cascade,
  round_index int not null,
  match_index int not null,
  player1_id text,  -- uuid or 'BYE' or null
  player2_id text,
  server_player_id uuid references players(id),
  winner_id uuid references players(id),
  status text not null check (status in (
    'scheduled', 'court_assigned', 'warmup', 'playing', 'finalized', 'walkover'
  )) default 'scheduled',
  court_number int,
  created_at timestamptz not null default now(),
  unique(tournament_id, round_index, match_index)
);

-- ============================================================
-- STORAGE BUCKET for tenant assets
-- ============================================================
insert into storage.buckets (id, name, public)
values ('tenant-assets', 'tenant-assets', true)
on conflict (id) do nothing;

-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================

alter table tenants enable row level security;
alter table users enable row level security;
alter table tournaments enable row level security;
alter table players enable row level security;
alter table matches enable row level security;

-- Helper function to get current user's role
create or replace function current_user_role()
returns text language sql security definer as $$
  select role from public.users where id = auth.uid();
$$;

-- Helper to get current user's tenant ids
create or replace function current_user_tenant_ids()
returns uuid[] language sql security definer as $$
  select assigned_tenant_ids from public.users where id = auth.uid();
$$;

-- TENANTS policies
create policy "Public read tenants" on tenants for select using (true);
create policy "Super admin manage tenants" on tenants for all
  using (current_user_role() = 'super_admin');
create policy "Tenant admin update own tenant" on tenants for update
  using (id = any(current_user_tenant_ids()));

-- USERS policies
create policy "Users read own row" on users for select
  using (id = auth.uid() or current_user_role() = 'super_admin');
create policy "Users update own row" on users for update
  using (id = auth.uid());
create policy "Super admin manage users" on users for all
  using (current_user_role() = 'super_admin');

-- TOURNAMENTS policies
create policy "Public read tournaments" on tournaments for select using (true);
create policy "Tenant admin manage own tournaments" on tournaments for all
  using (
    current_user_role() = 'super_admin' or
    tenant_id = any(current_user_tenant_ids())
  );

-- PLAYERS policies
create policy "Public read players" on players for select using (true);
create policy "Anyone can register as player" on players for insert
  with check (true);
create policy "Tenant admin manage players" on players for all
  using (
    current_user_role() = 'super_admin' or
    tournament_id in (
      select id from tournaments where tenant_id = any(current_user_tenant_ids())
    )
  );

-- MATCHES policies
create policy "Public read matches" on matches for select using (true);
create policy "Referee and admin update matches" on matches for update
  using (
    current_user_role() in ('super_admin', 'tenant_admin', 'referee')
  );
create policy "Admin manage matches" on matches for all
  using (
    current_user_role() = 'super_admin' or
    tournament_id in (
      select id from tournaments where tenant_id = any(current_user_tenant_ids())
    )
  );

-- Storage policy
create policy "Public read tenant assets" on storage.objects for select
  using (bucket_id = 'tenant-assets');
create policy "Authenticated upload tenant assets" on storage.objects for insert
  with check (bucket_id = 'tenant-assets' and auth.role() = 'authenticated');

-- Enable realtime for matches
alter publication supabase_realtime add table matches;
