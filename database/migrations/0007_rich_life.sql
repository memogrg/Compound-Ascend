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
