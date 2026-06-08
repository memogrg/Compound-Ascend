-- ============================================================
-- 0018 · Activos de renta — valor manual, renta recurrente y eventos
-- ============================================================
-- No destructiva. Para activos no cotizados (inmueble, negocio, otro) el valor
-- no se calcula por precio×cantidad: se usa current_value_manual.

alter table public.investment_holdings
  add column if not exists current_value_manual numeric,        -- valor actual puesto por el usuario
  add column if not exists rental_income         numeric,        -- renta recurrente (proyección)
  add column if not exists rental_frequency      text,           -- mensual | trimestral | anual
  add column if not exists rental_subtype        text;           -- alquiler | airbnb | auto | negocio | otro

-- Eventos de renta recibida (análogo a dividends). La renta REGISTRADA aquí
-- crea/enlaza un income_sources (pasivo) para sumar al ingreso pasivo real.
create table if not exists public.rental_payments (
  id           uuid primary key default gen_random_uuid(),
  holding_id   uuid not null references public.investment_holdings(id) on delete cascade,
  user_id      uuid not null references auth.users(id) on delete cascade,
  household_id uuid references public.households(id) on delete set null,
  received_on  date not null,
  amount       numeric(18,2) not null check (amount > 0),
  currency     char(3) not null default 'USD',
  frequency    text,
  income_id    uuid references public.income_sources(id) on delete set null,
  created_at   timestamptz not null default now()
);
create index if not exists idx_rental_payments_holding on public.rental_payments(holding_id);
create index if not exists idx_rental_payments_user_dt on public.rental_payments(user_id, received_on desc);
create index if not exists idx_rental_payments_household on public.rental_payments(household_id);

-- RLS por user_id (mismo helper que dividends/portfolio_snapshots).
select public.apply_user_data_policies(array['rental_payments']);
