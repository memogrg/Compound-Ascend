-- ============================================================
-- 0011 · Motor de inversiones — Holdings extendidos, Dividendos, Snapshots
-- ============================================================

-- Extiende investment_holdings con los campos de performance requeridos.
alter table public.investment_holdings
  add column if not exists average_cost  numeric(18,2) not null default 0,
  add column if not exists purchase_date date,
  add column if not exists broker        text,
  add column if not exists currency      char(3) not null default 'USD';

-- Tabla dedicada de dividendos (separada de investment_transactions).
create table public.dividends (
  id           uuid primary key default gen_random_uuid(),
  holding_id   uuid not null references public.investment_holdings(id) on delete cascade,
  user_id      uuid not null references auth.users(id) on delete cascade,
  household_id uuid references public.households(id) on delete set null,
  payment_date date not null,
  amount       numeric(18,2) not null check (amount > 0),
  currency     char(3) not null default 'USD',
  created_at   timestamptz not null default now()
);
create index idx_dividends_holding  on public.dividends(holding_id);
create index idx_dividends_user_dt  on public.dividends(user_id, payment_date desc);
create index idx_dividends_household on public.dividends(household_id);

-- Snapshots periódicos del portafolio (historial de valor a lo largo del tiempo).
create table public.portfolio_snapshots (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references auth.users(id) on delete cascade,
  household_id     uuid references public.households(id) on delete set null,
  date             date not null,
  portfolio_value  numeric(18,2) not null,
  investment_value numeric(18,2) not null,
  net_worth        numeric(18,2) not null,
  currency         char(3) not null default 'CRC',
  created_at       timestamptz not null default now(),
  unique (user_id, date)
);
create index idx_portfolio_snapshots_user     on public.portfolio_snapshots(user_id, date desc);
create index idx_portfolio_snapshots_household on public.portfolio_snapshots(household_id);

-- Políticas RLS para las nuevas tablas (usuarios solo ven/editan sus propios datos).
select public.apply_user_data_policies(array['dividends', 'portfolio_snapshots']);
