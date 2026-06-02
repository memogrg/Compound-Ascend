-- ============================================================
-- Compound Ascend — esquema completo + seed (generado)
-- Pega TODO esto en el SQL Editor de Supabase y ejecútalo UNA vez.
-- ============================================================


-- ============================================================
-- >>> database/migrations/0001_extensions_helpers.sql
-- ============================================================
-- ============================================================
-- 0001 · Extensiones, funciones helper y triggers base
-- Compound Ascend — Supabase Postgres
-- ============================================================

create extension if not exists "pgcrypto";       -- gen_random_uuid()
create extension if not exists "citext";          -- correos case-insensitive

-- ---------- updated_at automático ----------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ---------- Pertenencia a hogar (evita recursión en RLS) ----------
-- SECURITY DEFINER: consulta household_members sin disparar sus propias RLS.
create or replace function public.is_household_member(hid uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from public.household_members hm
    where hm.household_id = hid
      and hm.user_id = auth.uid()
      and hm.status = 'active'
  );
$$;

create or replace function public.is_household_editor(hid uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from public.household_members hm
    where hm.household_id = hid
      and hm.user_id = auth.uid()
      and hm.status = 'active'
      and hm.role in ('owner','adult')
  );
$$;

-- ---------- Alta de usuario: crea profile + user_settings ----------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, display_name, locale)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'display_name', split_part(new.email, '@', 1)),
    'es'
  )
  on conflict (id) do nothing;

  insert into public.user_settings (user_id)
  values (new.id)
  on conflict (user_id) do nothing;

  return new;
end;
$$;

-- El trigger sobre auth.users se crea en 0002 (tras existir profiles).

-- ============================================================
-- Helper: aplica el patrón estándar de RLS (dueño + hogar), índices y
-- trigger updated_at a una lista de tablas de datos de usuario.
-- Requisito: cada tabla tiene columnas user_id (uuid) y household_id (uuid null),
-- created_at y updated_at.
-- ============================================================
create or replace function public.apply_user_data_policies(tables text[])
returns void
language plpgsql
as $fn$
declare
  t text;
begin
  foreach t in array tables loop
    execute format('alter table public.%I enable row level security;', t);
    execute format('alter table public.%I force row level security;', t);

    execute format('drop trigger if exists trg_%s_updated on public.%I;', t, t);
    execute format(
      'create trigger trg_%s_updated before update on public.%I '
      || 'for each row execute function public.set_updated_at();', t, t);

    execute format('create index if not exists idx_%s_user on public.%I(user_id);', t, t);
    execute format('create index if not exists idx_%s_household on public.%I(household_id);', t, t);
    execute format('create index if not exists idx_%s_created on public.%I(created_at);', t, t);

    execute format(
      'create policy %s_sel on public.%I for select using ('
      || 'user_id = auth.uid() or (household_id is not null and public.is_household_member(household_id)));',
      t, t);
    execute format(
      'create policy %s_ins on public.%I for insert with check (user_id = auth.uid());', t, t);
    execute format(
      'create policy %s_upd on public.%I for update using ('
      || 'user_id = auth.uid() or (household_id is not null and public.is_household_editor(household_id))) '
      || 'with check (user_id = auth.uid() or (household_id is not null and public.is_household_editor(household_id)));',
      t, t);
    execute format(
      'create policy %s_del on public.%I for delete using ('
      || 'user_id = auth.uid() or (household_id is not null and public.is_household_editor(household_id)));',
      t, t);
  end loop;
end;
$fn$;


-- ============================================================
-- >>> database/migrations/0002_identity.sql
-- ============================================================
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


-- ============================================================
-- >>> database/migrations/0003_personal_profile.sql
-- ============================================================
-- ============================================================
-- 0003 · Módulo 1 — Mi Perfil Financiero (ADN financiero)
-- ============================================================

create table public.personal_profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users(id) on delete cascade,
  household_id uuid references public.households(id) on delete set null,
  age int check (age between 0 and 120),
  country text,
  marital_status text,
  financial_nucleus text check (financial_nucleus in ('solo','pareja','familia','socios','otro')),
  dependents_count int default 0 check (dependents_count >= 0),
  life_stage text,
  perceived_control int check (perceived_control between 1 and 10),
  satisfaction int check (satisfaction between 1 and 10),
  urgency text check (urgency in ('baja','media','alta','critica')),
  main_concern text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.user_priorities (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  household_id uuid references public.households(id) on delete set null,
  priority text not null,
  kind text not null default 'prioriza' check (kind in ('prioriza','sacrificable','no_negociable')),
  rank int,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.financial_goals_profile (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  household_id uuid references public.households(id) on delete set null,
  name text not null,
  target_amount numeric(18,2),
  currency char(3) default 'CRC',
  target_date date,
  priority text check (priority in ('alta','media','baja')),
  horizon text check (horizon in ('corto','mediano','largo')),
  scope text check (scope in ('individual','pareja','familia','socios')),
  motive text,
  importance int check (importance between 1 and 10),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.risk_profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users(id) on delete cascade,
  household_id uuid references public.households(id) on delete set null,
  loss_reaction text,
  preference text check (preference in ('seguridad','equilibrio','crecimiento')),
  horizon text,
  has_invested boolean,
  invested_in jsonb default '[]'::jsonb,
  volatility_comfort int check (volatility_comfort between 1 and 10),
  risk_class text check (risk_class in ('conservador','moderado','balanceado','crecimiento','agresivo')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.behavior_profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users(id) on delete cascade,
  household_id uuid references public.households(id) on delete set null,
  discipline int check (discipline between 1 and 10),
  impulsivity int check (impulsivity between 1 and 10),
  consistency int check (consistency between 1 and 10),
  anxiety int check (anxiety between 1 and 10),
  review_habit text,
  hardest jsonb default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.knowledge_profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users(id) on delete cascade,
  household_id uuid references public.households(id) on delete set null,
  level text check (level in ('basico','intermedio','avanzado','experto')),
  topics_known jsonb default '[]'::jsonb,
  topics_to_learn jsonb default '[]'::jsonb,
  learning_format jsonb default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.dependents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  household_id uuid references public.households(id) on delete set null,
  name text,
  relation text,
  age int check (age between 0 and 120),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- RLS estándar (dueño + hogar) e índices base + updated_at.
select public.apply_user_data_policies(array[
  'personal_profiles','user_priorities','financial_goals_profile','risk_profiles',
  'behavior_profiles','knowledge_profiles','dependents'
]);


-- ============================================================
-- >>> database/migrations/0004_financial_base.sql
-- ============================================================
-- ============================================================
-- 0004 · Módulo 2 — Mi Base Financiera
-- ============================================================

-- ---------- Referencia: monedas y tipos de cambio ----------
create table public.currencies (
  code char(3) primary key,
  symbol text not null,
  name text not null
);

create table public.fx_rates (
  id uuid primary key default gen_random_uuid(),
  base char(3) not null references public.currencies(code),
  quote char(3) not null references public.currencies(code),
  rate numeric(18,8) not null check (rate > 0),
  as_of date not null,
  unique (base, quote, as_of)
);

alter table public.currencies enable row level security;
alter table public.fx_rates enable row level security;
-- Referencia pública para usuarios autenticados (solo lectura).
create policy currencies_read on public.currencies for select to authenticated using (true);
create policy fx_rates_read on public.fx_rates for select to authenticated using (true);
-- Escritura solo service-role (omite RLS), sin políticas de escritura para usuarios.

-- ---------- Categorías de gasto (sistema + personalizadas) ----------
create table public.expense_categories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade, -- null = categoría de sistema
  parent_id uuid references public.expense_categories(id) on delete cascade,
  key text,
  name text not null,
  default_nature text,
  is_system boolean not null default false,
  sort_order int default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_expense_categories_parent on public.expense_categories(parent_id);
create index idx_expense_categories_user on public.expense_categories(user_id);

create trigger trg_expense_categories_updated before update on public.expense_categories
  for each row execute function public.set_updated_at();

alter table public.expense_categories enable row level security;
alter table public.expense_categories force row level security;
-- Lectura: categorías de sistema (user_id null) + propias.
create policy expense_categories_sel on public.expense_categories
  for select using (user_id is null or user_id = auth.uid());
create policy expense_categories_ins on public.expense_categories
  for insert with check (user_id = auth.uid());
create policy expense_categories_upd on public.expense_categories
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy expense_categories_del on public.expense_categories
  for delete using (user_id = auth.uid());

-- ---------- Ingresos ----------
create table public.income_sources (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  household_id uuid references public.households(id) on delete set null,
  name text not null,
  income_type text not null check (income_type in ('activo','pasivo','extraordinario')),
  category text,
  amount numeric(18,2) not null default 0,
  currency char(3) not null default 'CRC',
  frequency text not null check (frequency in
    ('diario','semanal','quincenal','mensual','bimensual','trimestral',
     'cuatrimestral','semestral','anual','unico','variable')),
  is_fixed boolean not null default true,
  certainty text check (certainty in ('seguro','probable','incierto')),
  owner_scope text default 'usuario' check (owner_scope in ('usuario','pareja','familia','grupo')),
  include_in_budget boolean not null default true,
  estimated_date date,
  amount_monthly_base numeric(18,2) not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------- Gastos ----------
create table public.expense_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  household_id uuid references public.households(id) on delete set null,
  name text not null,
  category_id uuid references public.expense_categories(id) on delete set null,
  subcategory_id uuid references public.expense_categories(id) on delete set null,
  nature text check (nature in
    ('esencial','estilo_vida','financiero','proteccion','crecimiento',
     'ahorro','inversion','donacion','miscelaneo')),
  amount numeric(18,2) not null default 0,
  currency char(3) not null default 'CRC',
  frequency text not null check (frequency in
    ('diario','semanal','quincenal','mensual','bimensual','trimestral',
     'cuatrimestral','semestral','anual','unico','variable')),
  is_fixed boolean not null default true,
  obligation text check (obligation in ('obligatorio','flexible','deseable')),
  reducible text check (reducible in ('si','no','tal_vez')),
  pay_day int check (pay_day between 1 and 31),
  owner_scope text default 'usuario' check (owner_scope in ('usuario','pareja','familia','grupo')),
  payment_method text,
  linked_goal_id uuid,
  amount_monthly_base numeric(18,2) not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_expense_items_category on public.expense_items(category_id);

-- ---------- Transacciones reales ----------
create table public.transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  household_id uuid references public.households(id) on delete set null,
  kind text not null check (kind in ('ingreso','gasto')),
  description text,
  amount numeric(18,2) not null,
  currency char(3) not null default 'CRC',
  occurred_on date not null,
  category_id uuid references public.expense_categories(id) on delete set null,
  account_label text,
  source text not null default 'manual' check (source in ('manual','chat','receipt','recurring')),
  confirmed_by_user boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_transactions_occurred on public.transactions(occurred_on);

-- ---------- Recurrencias ----------
create table public.recurring_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  household_id uuid references public.households(id) on delete set null,
  kind text not null check (kind in ('ingreso','gasto')),
  name text not null,
  amount numeric(18,2) not null default 0,
  currency char(3) not null default 'CRC',
  frequency text not null,
  next_date date,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------- Snapshots mensuales (cache de cálculo) ----------
create table public.monthly_snapshots (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  household_id uuid references public.households(id) on delete set null,
  period date not null, -- primer día del mes
  income_monthly numeric(18,2) not null default 0,
  expense_monthly numeric(18,2) not null default 0,
  free_cashflow numeric(18,2) not null default 0,
  savings_rate numeric(6,3) default 0,
  investment_rate numeric(6,3) default 0,
  debt_weight numeric(6,3) default 0,
  essentials_weight numeric(6,3) default 0,
  lifestyle_weight numeric(6,3) default 0,
  financial_pressure text,
  breakdown jsonb default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, period)
);

create index idx_monthly_snapshots_period on public.monthly_snapshots(period);

select public.apply_user_data_policies(array[
  'income_sources','expense_items','transactions','recurring_items','monthly_snapshots'
]);


-- ============================================================
-- >>> database/migrations/0005_control.sql
-- ============================================================
-- ============================================================
-- 0005 · Módulo 3 — Control Financiero
-- ============================================================

create table public.savings_goals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  household_id uuid references public.households(id) on delete set null,
  name text not null,
  goal_type text,
  target_amount numeric(18,2) not null default 0,
  current_amount numeric(18,2) not null default 0,
  monthly_contribution numeric(18,2) not null default 0,
  currency char(3) not null default 'CRC',
  target_date date,
  priority text check (priority in ('alta','media','baja')),
  scope text check (scope in ('individual','pareja','familia','grupo')),
  automated boolean default false,
  stored_in text,
  classification text,
  status text default 'saludable' check (status in ('saludable','atrasado','no_viable','revisar')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.goal_contributions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  household_id uuid references public.households(id) on delete set null,
  goal_id uuid not null references public.savings_goals(id) on delete cascade,
  amount numeric(18,2) not null,
  occurred_on date not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index idx_goal_contributions_goal on public.goal_contributions(goal_id);

create table public.debts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  household_id uuid references public.households(id) on delete set null,
  name text not null,
  debt_type text,
  balance numeric(18,2) not null default 0,
  min_payment numeric(18,2) default 0,
  current_payment numeric(18,2) default 0,
  apr numeric(6,3),
  currency char(3) not null default 'CRC',
  pay_day int check (pay_day between 1 and 31),
  term_remaining_months int,
  is_current boolean default true,
  delinquency text check (delinquency in ('no','1_30','31_60','60_mas')),
  secured_asset text,
  stress int check (stress between 1 and 10),
  allows_extra_payment text check (allows_extra_payment in ('si','no','no_se')),
  classification text check (classification in ('critica','controlada','estrategica','emocional')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index idx_debts_status on public.debts(is_current);

create table public.debt_payments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  household_id uuid references public.households(id) on delete set null,
  debt_id uuid not null references public.debts(id) on delete cascade,
  amount numeric(18,2) not null,
  principal numeric(18,2),
  interest numeric(18,2),
  occurred_on date not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index idx_debt_payments_debt on public.debt_payments(debt_id);

create table public.control_recommendations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  household_id uuid references public.households(id) on delete set null,
  scope text,
  diagnosis text,
  decision text,
  impact text,
  priority text check (priority in ('alta','media','baja')),
  status text default 'vigente' check (status in ('vigente','aplicada','descartada')),
  generated_by text default 'engine' check (generated_by in ('engine','ai')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.debt_strategy_scenarios (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  household_id uuid references public.households(id) on delete set null,
  method text check (method in ('avalancha','bola_nieve','hibrido')),
  params jsonb default '{}'::jsonb,
  result jsonb default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

select public.apply_user_data_policies(array[
  'savings_goals','goal_contributions','debts','debt_payments',
  'control_recommendations','debt_strategy_scenarios'
]);


-- ============================================================
-- >>> database/migrations/0006_wealth.sql
-- ============================================================
-- ============================================================
-- 0006 · Módulo 4 — Patrimonio (Crecimiento + Protección)
-- ============================================================

create table public.investments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  household_id uuid references public.households(id) on delete set null,
  asset_type text not null check (asset_type in
    ('etf','accion','bono','fondo','certificado','inmueble','cripto',
     'negocio','pension','commodity','arte','nft','otro')),
  name text not null,
  symbol text,
  invested_amount numeric(18,2) not null default 0,
  contribution numeric(18,2) default 0,
  contribution_frequency text,
  started_on date,
  linked_goal text,
  horizon text check (horizon in ('menos_1','1_3','3_5','5_10','mas_10')),
  perceived_risk text check (perceived_risk in ('bajo','medio','alto','no_se')),
  liquidity text check (liquidity in ('rapida','penalidad','largo_plazo','no_se')),
  fees numeric(6,3),
  understanding int check (understanding between 1 and 10),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index idx_investments_symbol on public.investments(symbol);

create table public.investment_holdings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  household_id uuid references public.households(id) on delete set null,
  investment_id uuid references public.investments(id) on delete cascade,
  symbol text not null,
  asset_type text not null,
  quantity numeric(24,8) not null default 0,
  cost_basis numeric(18,2) default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index idx_holdings_symbol on public.investment_holdings(symbol);

create table public.investment_transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  household_id uuid references public.households(id) on delete set null,
  investment_id uuid references public.investments(id) on delete cascade,
  tx_type text check (tx_type in ('compra','venta','aporte','retiro','dividendo')),
  amount numeric(18,2) not null,
  quantity numeric(24,8),
  currency char(3) default 'CRC',
  occurred_on date not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Cache de precios (no es por usuario; lo escribe el backend/service-role).
create table public.market_price_cache (
  id uuid primary key default gen_random_uuid(),
  symbol text not null,
  asset_type text not null,
  price numeric(24,8) not null,
  currency char(3) not null default 'USD',
  provider text,
  fetched_at timestamptz not null default now(),
  ttl_seconds int not null default 60,
  unique (symbol, asset_type)
);
create index idx_price_cache_symbol on public.market_price_cache(symbol, asset_type);

alter table public.market_price_cache enable row level security;
create policy price_cache_read on public.market_price_cache
  for select to authenticated using (true);
-- Escritura solo service-role.

create table public.insurance_policies (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  household_id uuid references public.households(id) on delete set null,
  policy_type text check (policy_type in
    ('medico','vida','incapacidad','hogar','vehiculo','patrimonial',
     'empresarial','familiar','otro')),
  provider text,
  coverage numeric(18,2),
  premium numeric(18,2),
  premium_frequency text,
  renewal_date date,
  beneficiaries text,
  currency char(3) default 'CRC',
  scope text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.protection_gaps (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  household_id uuid references public.households(id) on delete set null,
  gap_type text not null,
  severity text check (severity in ('alto','medio','bajo')),
  description text,
  recommendation text,
  status text default 'abierta' check (status in ('abierta','en_revision','cerrada')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.wealth_recommendations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  household_id uuid references public.households(id) on delete set null,
  level text check (level in ('educacion','diagnostico','accion','acompanamiento')),
  content text,
  priority text check (priority in ('alta','media','baja')),
  status text default 'vigente' check (status in ('vigente','aplicada','descartada')),
  cta text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

select public.apply_user_data_policies(array[
  'investments','investment_holdings','investment_transactions',
  'insurance_policies','protection_gaps','wealth_recommendations'
]);


-- ============================================================
-- >>> database/migrations/0007_rich_life.sql
-- ============================================================
-- ============================================================
-- 0007 · Módulo 5 — Mi Rich Life
-- ============================================================

create table public.assets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  household_id uuid references public.households(id) on delete set null,
  name text not null,
  asset_class text check (asset_class in
    ('liquido','inversion','productivo','uso_personal','especial')),
  value numeric(18,2) not null default 0,
  currency char(3) not null default 'CRC',
  generates_income boolean default false,
  liquidity text check (liquidity in ('alta','media','baja')),
  linked_debt_id uuid references public.debts(id) on delete set null,
  last_valued_on date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.liabilities (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  household_id uuid references public.households(id) on delete set null,
  name text not null,
  liability_class text check (liability_class in
    ('consumo','patrimonial','productivo','critico')),
  balance numeric(18,2) not null default 0,
  currency char(3) not null default 'CRC',
  linked_debt_id uuid references public.debts(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.net_worth_snapshots (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  household_id uuid references public.households(id) on delete set null,
  period date not null,
  total_assets numeric(18,2) not null default 0,
  total_liabilities numeric(18,2) not null default 0,
  net_worth numeric(18,2) not null default 0,
  breakdown jsonb default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, period)
);
create index idx_nw_period on public.net_worth_snapshots(period);

create table public.rich_life_scores (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  household_id uuid references public.households(id) on delete set null,
  period date not null,
  score int not null check (score between 0 and 100),
  dimensions jsonb default '{}'::jsonb,
  state text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, period)
);

create table public.rich_life_snapshots (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  household_id uuid references public.households(id) on delete set null,
  period date not null,
  indicators jsonb default '{}'::jsonb,
  ai_reading text,
  achievements jsonb default '[]'::jsonb,
  risks jsonb default '[]'::jsonb,
  next_best_action text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, period)
);

select public.apply_user_data_policies(array[
  'assets','liabilities','net_worth_snapshots','rich_life_scores','rich_life_snapshots'
]);


-- ============================================================
-- >>> database/migrations/0008_ai.sql
-- ============================================================
-- ============================================================
-- 0008 · IA, acciones, recibos, consumo de tokens y rate limits
-- Regla crítica: el usuario NO puede modificar su consumo ni sus límites.
-- ============================================================

create table public.ai_conversations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  mode text not null check (mode in ('assistant','finance_ai')),
  title text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index idx_ai_conv_user on public.ai_conversations(user_id);

create table public.ai_messages (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  conversation_id uuid not null references public.ai_conversations(id) on delete cascade,
  role text not null check (role in ('user','assistant','system')),
  content text not null,
  tokens_in int default 0,
  tokens_out int default 0,
  model text,
  created_at timestamptz not null default now()
);
create index idx_ai_msg_conv on public.ai_messages(conversation_id);

-- Acciones propuestas por la IA: NUNCA se ejecutan sin confirmación del usuario.
create table public.ai_actions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  conversation_id uuid references public.ai_conversations(id) on delete cascade,
  type text not null check (type in
    ('create_transaction','create_goal','suggest_debt_strategy','suggest_budget_adjustment')),
  payload jsonb not null default '{}'::jsonb,
  status text not null default 'proposed' check (status in ('proposed','confirmed','executed','rejected')),
  executed_entity_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index idx_ai_actions_user on public.ai_actions(user_id);

create table public.ai_receipt_scans (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  storage_path text,
  extracted jsonb default '{}'::jsonb,
  status text not null default 'pending' check (status in ('pending','extracted','confirmed','rejected')),
  transaction_id uuid references public.transactions(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Consumo de tokens — calculado server-side, inmodificable por el usuario.
create table public.ai_usage_ledger (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  period date not null, -- primer día del mes
  tokens_used bigint not null default 0,
  requests int not null default 0,
  cost_est numeric(12,4) not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, period)
);
create index idx_ai_usage_period on public.ai_usage_ledger(user_id, period);

-- Rate limits internos — gestionados solo por backend.
create table public.ai_rate_limits (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  bucket text not null,
  window_start timestamptz not null default now(),
  count int not null default 0,
  unique (user_id, bucket, window_start)
);

-- ============================================================
-- Triggers updated_at donde aplica
-- ============================================================
create trigger trg_ai_conv_updated before update on public.ai_conversations
  for each row execute function public.set_updated_at();
create trigger trg_ai_actions_updated before update on public.ai_actions
  for each row execute function public.set_updated_at();
create trigger trg_ai_receipts_updated before update on public.ai_receipt_scans
  for each row execute function public.set_updated_at();
create trigger trg_ai_usage_updated before update on public.ai_usage_ledger
  for each row execute function public.set_updated_at();

-- ============================================================
-- RLS
-- ============================================================
alter table public.ai_conversations enable row level security;
alter table public.ai_conversations force row level security;
alter table public.ai_messages enable row level security;
alter table public.ai_messages force row level security;
alter table public.ai_actions enable row level security;
alter table public.ai_actions force row level security;
alter table public.ai_receipt_scans enable row level security;
alter table public.ai_receipt_scans force row level security;
alter table public.ai_usage_ledger enable row level security;
alter table public.ai_usage_ledger force row level security;
alter table public.ai_rate_limits enable row level security;
alter table public.ai_rate_limits force row level security;

-- Conversaciones / mensajes / acciones / recibos: dueño gestiona lo suyo.
create policy ai_conv_all on public.ai_conversations
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy ai_msg_all on public.ai_messages
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy ai_actions_all on public.ai_actions
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy ai_receipts_all on public.ai_receipt_scans
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- CRÍTICO: consumo y límites son SOLO LECTURA para el usuario.
-- La escritura la realiza el backend con service-role (omite RLS) o RPC controlado.
create policy ai_usage_select_own on public.ai_usage_ledger
  for select using (user_id = auth.uid());
-- (sin políticas de insert/update/delete para 'authenticated')

create policy ai_rate_select_own on public.ai_rate_limits
  for select using (user_id = auth.uid());
-- (sin políticas de insert/update/delete para 'authenticated')


-- ============================================================
-- >>> database/migrations/0009_security_audit.sql
-- ============================================================
-- ============================================================
-- 0009 · Seguridad y auditoría
-- Estas tablas las escribe el backend (service-role). El usuario no las lee.
-- ============================================================

create table public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references auth.users(id) on delete set null,
  action text not null,
  entity text,
  entity_id uuid,
  diff jsonb default '{}'::jsonb,
  ip text,
  user_agent text,
  created_at timestamptz not null default now()
);
create index idx_audit_actor on public.audit_logs(actor_id);
create index idx_audit_created on public.audit_logs(created_at);

create table public.security_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  event_type text not null,
  severity text check (severity in ('info','warn','critical')),
  metadata jsonb default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index idx_sec_events_type on public.security_events(event_type);
create index idx_sec_events_created on public.security_events(created_at);

create table public.user_sessions_metadata (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  device text,
  ip text,
  last_seen timestamptz not null default now(),
  created_at timestamptz not null default now()
);
create index idx_sessions_user on public.user_sessions_metadata(user_id);

-- RLS: tablas internas. Sin políticas para 'authenticated' (deny por defecto).
-- Solo accesibles vía service-role (que omite RLS).
alter table public.audit_logs enable row level security;
alter table public.audit_logs force row level security;
alter table public.security_events enable row level security;
alter table public.security_events force row level security;
alter table public.user_sessions_metadata enable row level security;
alter table public.user_sessions_metadata force row level security;

-- El usuario puede ver sus propios metadatos de sesión (transparencia), nada más.
create policy sessions_select_own on public.user_sessions_metadata
  for select using (user_id = auth.uid());


-- ============================================================
-- >>> database/migrations/0010_profile_extra.sql
-- ============================================================
-- ============================================================
-- 0010 · Guardado progresivo del onboarding de perfil
-- Almacena el borrador del wizard y respuestas sin columna propia
-- (protección, acompañamiento, Rich Life) como jsonb.
-- ============================================================

alter table public.personal_profiles
  add column if not exists extra jsonb not null default '{}'::jsonb;

comment on column public.personal_profiles.extra is
  'Borrador del wizard y respuestas auxiliares (protección, Rich Life). No sustituye columnas normalizadas.';


-- ============================================================
-- >>> database/seed/seed.sql
-- ============================================================
-- ============================================================
-- SEED · Monedas y categorías de gasto del sistema
-- Idempotente: reemplaza filas de sistema en cada ejecución.
-- ============================================================

-- ---------- Monedas ----------
insert into public.currencies (code, symbol, name) values
  ('CRC', '₡', 'Colón costarricense'),
  ('USD', '$', 'Dólar estadounidense'),
  ('EUR', '€', 'Euro'),
  ('MXN', '$', 'Peso mexicano'),
  ('COP', '$', 'Peso colombiano'),
  ('GBP', '£', 'Libra esterlina')
on conflict (code) do update set symbol = excluded.symbol, name = excluded.name;

-- ---------- Categorías de gasto (sistema) ----------
delete from public.expense_categories where is_system;

insert into public.expense_categories (key, name, default_nature, is_system, sort_order) values
  ('vivienda','Vivienda','esencial',true,10),
  ('alimentacion','Alimentación','esencial',true,20),
  ('servicios_hogar','Servicios y hogar','esencial',true,30),
  ('transporte','Transporte','esencial',true,40),
  ('automovil','Automóvil','esencial',true,50),
  ('salud','Salud','proteccion',true,60),
  ('cuidado_personal','Cuidado personal','estilo_vida',true,70),
  ('familia','Familia y dependientes','esencial',true,80),
  ('mascotas','Mascotas','estilo_vida',true,90),
  ('educacion','Educación','crecimiento',true,100),
  ('disfrute','Disfrute','estilo_vida',true,110),
  ('viajes','Viajes','ahorro',true,120),
  ('tecnologia','Tecnología','ahorro',true,130),
  ('suscripciones','Suscripciones','estilo_vida',true,140),
  ('seguros','Seguros','proteccion',true,150),
  ('impuestos','Impuestos y trámites','financiero',true,160),
  ('deudas','Deudas','financiero',true,170),
  ('fondo_emergencia','Fondo de emergencia','ahorro',true,180),
  ('fondo_paz','Fondo de paz','proteccion',true,190),
  ('inversiones','Inversiones','inversion',true,200),
  ('retiro','Retiro','inversion',true,210),
  ('donaciones','Donaciones','donacion',true,220),
  ('miscelaneos','Misceláneos','miscelaneo',true,230);

-- ---------- Subcategorías (ejemplos representativos de la Biblia) ----------
insert into public.expense_categories (parent_id, key, name, default_nature, is_system, sort_order)
select c.id, sub.key, sub.name, c.default_nature, true, sub.ord
from public.expense_categories c
join (values
  ('vivienda','vivienda_alquiler','Alquiler',1),
  ('vivienda','vivienda_hipoteca','Hipoteca',2),
  ('vivienda','vivienda_condominio','Condominio',3),
  ('vivienda','vivienda_mantenimiento','Mantenimiento',4),
  ('vivienda','vivienda_reparaciones','Reparaciones',5),
  ('alimentacion','alim_supermercado','Supermercado',1),
  ('alimentacion','alim_feria','Feria',2),
  ('alimentacion','alim_snacks','Snacks',3),
  ('alimentacion','alim_comida_laboral','Comida laboral',4),
  ('alimentacion','alim_comida_rapida','Comida rápida',5),
  ('alimentacion','alim_cafe','Café',6),
  ('alimentacion','alim_delivery','Delivery',7),
  ('automovil','auto_marchamo','Marchamo',1),
  ('automovil','auto_seguro','Seguro',2),
  ('automovil','auto_mantenimiento','Mantenimiento',3),
  ('automovil','auto_llantas','Llantas',4),
  ('automovil','auto_repuestos','Repuestos',5),
  ('automovil','auto_revision','Revisión técnica',6),
  ('automovil','auto_lavado','Lavado',7),
  ('servicios_hogar','serv_luz','Luz',1),
  ('servicios_hogar','serv_agua','Agua',2),
  ('servicios_hogar','serv_internet','Internet',3),
  ('servicios_hogar','serv_celular','Celular',4),
  ('servicios_hogar','serv_limpieza','Limpieza',5)
) as sub(parent_key, key, name, ord)
  on sub.parent_key = c.key
where c.is_system and c.parent_id is null;

