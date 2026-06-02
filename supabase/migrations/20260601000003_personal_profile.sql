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
