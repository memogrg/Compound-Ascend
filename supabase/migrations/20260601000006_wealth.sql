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
