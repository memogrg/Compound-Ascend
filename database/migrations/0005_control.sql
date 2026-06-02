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
