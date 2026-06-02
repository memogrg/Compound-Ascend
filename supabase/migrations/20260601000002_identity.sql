-- ============================================================
-- 0002 · Identidad y hogar: profiles, user_settings, households,
--        household_members  (+ RLS, índices, trigger de alta)
-- ============================================================

-- ---------- profiles (1:1 con auth.users) ----------
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  locale text not null default 'es',
  plan text not null default 'free' check (plan in ('free','premium')),
  avatar_url text,
  onboarding_completed boolean not null default false,
  profile_completion int not null default 0 check (profile_completion between 0 and 100),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger trg_profiles_updated before update on public.profiles
  for each row execute function public.set_updated_at();

-- Bloquea cambios de `plan` desde el rol del usuario (solo service-role/postgres).
create or replace function public.protect_profile_plan()
returns trigger
language plpgsql
as $$
begin
  if new.plan is distinct from old.plan
     and current_setting('request.jwt.claims', true) is not null
     and (auth.jwt() ->> 'role') = 'authenticated' then
    raise exception 'No puedes cambiar tu plan desde el cliente';
  end if;
  return new;
end;
$$;

create trigger trg_profiles_protect_plan before update on public.profiles
  for each row execute function public.protect_profile_plan();

-- ---------- user_settings ----------
create table public.user_settings (
  user_id uuid primary key references auth.users(id) on delete cascade,
  theme text not null default 'light' check (theme in ('light','dark')),
  primary_currency char(3) not null default 'CRC',
  coaching_tone text,
  coaching_frequency text,
  alert_intensity text,
  notifications jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger trg_user_settings_updated before update on public.user_settings
  for each row execute function public.set_updated_at();

-- ---------- households ----------
create table public.households (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  type text not null default 'solo' check (type in ('solo','pareja','familia','socios')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger trg_households_updated before update on public.households
  for each row execute function public.set_updated_at();

create index idx_households_owner on public.households(owner_id);

-- ---------- household_members ----------
create table public.household_members (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'member' check (role in ('owner','adult','member','viewer')),
  status text not null default 'active' check (status in ('active','invited','removed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (household_id, user_id)
);

create trigger trg_household_members_updated before update on public.household_members
  for each row execute function public.set_updated_at();

create index idx_hm_user on public.household_members(user_id);
create index idx_hm_household on public.household_members(household_id);

-- ============================================================
-- RLS
-- ============================================================
alter table public.profiles enable row level security;
alter table public.profiles force row level security;
alter table public.user_settings enable row level security;
alter table public.user_settings force row level security;
alter table public.households enable row level security;
alter table public.households force row level security;
alter table public.household_members enable row level security;
alter table public.household_members force row level security;

-- profiles: cada quien ve/edita el suyo. No puede crear/borrar (lo hace el trigger).
create policy profiles_select_own on public.profiles
  for select using (id = auth.uid());
create policy profiles_update_own on public.profiles
  for update using (id = auth.uid()) with check (id = auth.uid());

-- user_settings: dueño total (menos delete).
create policy user_settings_select_own on public.user_settings
  for select using (user_id = auth.uid());
create policy user_settings_insert_own on public.user_settings
  for insert with check (user_id = auth.uid());
create policy user_settings_update_own on public.user_settings
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());

-- households: dueño o miembro puede leer; solo dueño modifica.
create policy households_select on public.households
  for select using (owner_id = auth.uid() or public.is_household_member(id));
create policy households_insert on public.households
  for insert with check (owner_id = auth.uid());
create policy households_update on public.households
  for update using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy households_delete on public.households
  for delete using (owner_id = auth.uid());

-- household_members: el usuario ve sus membresías y las del hogar donde es editor;
-- solo editores del hogar gestionan miembros.
create policy hm_select on public.household_members
  for select using (user_id = auth.uid() or public.is_household_editor(household_id));
create policy hm_insert on public.household_members
  for insert with check (public.is_household_editor(household_id));
create policy hm_update on public.household_members
  for update using (public.is_household_editor(household_id))
  with check (public.is_household_editor(household_id));
create policy hm_delete on public.household_members
  for delete using (public.is_household_editor(household_id));

-- ---------- Trigger de alta de usuario ----------
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
