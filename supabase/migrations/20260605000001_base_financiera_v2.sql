-- ============================================================
-- 0015 · Base Financiera V2 — migración ADITIVA (no destructiva)
-- Añade: budget_items (presupuesto por mes), accounts (métodos de pago),
-- columnas nuevas opcionales en transactions, transaction_rules (fase 2).
-- Conserva income_sources / expense_items / transactions intactas.
-- ============================================================

-- ---------- Presupuesto por mes ----------
create table if not exists public.budget_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  household_id uuid references public.households(id) on delete set null,
  type text not null check (type in ('income','expense')),
  category_id uuid references public.expense_categories(id) on delete set null,
  name text not null,
  amount numeric(18,2) not null default 0,
  currency char(3) not null default 'CRC',
  frequency text not null default 'mensual',
  period_month int not null check (period_month between 1 and 12),
  period_year int not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, type, category_id, name, period_month, period_year)
);

create index if not exists idx_budget_items_period
  on public.budget_items(user_id, period_year, period_month);

-- ---------- Cuentas / métodos de pago ----------
create table if not exists public.accounts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  household_id uuid references public.households(id) on delete set null,
  name text not null,
  kind text not null default 'banco' check (kind in ('banco','efectivo','tarjeta','otro')),
  currency char(3) not null default 'CRC',
  is_default boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------- Reglas de transacción (fase 2, dejar preparada) ----------
create table if not exists public.transaction_rules (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  household_id uuid references public.households(id) on delete set null,
  merchant_pattern text not null,
  suggested_category_id uuid references public.expense_categories(id) on delete set null,
  suggested_account_id uuid references public.accounts(id) on delete set null,
  type text not null check (type in ('income','expense')),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------- Extensión de transactions (columnas OPCIONALES) ----------
alter table public.transactions
  add column if not exists account_id uuid references public.accounts(id) on delete set null,
  add column if not exists merchant_or_source text,
  add column if not exists status text not null default 'confirmed',
  add column if not exists origin text not null default 'manual',
  add column if not exists receipt_url text,
  add column if not exists confidence_score_internal numeric(5,2);

-- Checks idempotentes para status/origin.
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'transactions_status_chk') then
    alter table public.transactions
      add constraint transactions_status_chk check (status in ('confirmed','pending_review'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'transactions_origin_chk') then
    alter table public.transactions
      add constraint transactions_origin_chk
      check (origin in ('manual','scanned','imported','recurring','ai_assisted'));
  end if;
end$$;

-- Backfill de origin a partir del source histórico (best-effort).
update public.transactions set origin = case
    when source = 'receipt' then 'scanned'
    when source = 'chat' then 'ai_assisted'
    when source = 'recurring' then 'recurring'
    else 'manual'
  end
where origin = 'manual';

-- ---------- RLS estándar (dueño + hogar) en las tablas nuevas ----------
select public.apply_user_data_policies(array['budget_items','accounts','transaction_rules']);

-- ---------- Backfill del presupuesto del mes actual ----------
-- Genera budget_items del mes en curso a partir de income_sources y
-- expense_items (montos mensualizados). Idempotente (NOT EXISTS). No borra nada.
insert into public.budget_items
  (user_id, household_id, type, category_id, name, amount, currency, frequency, period_month, period_year)
select
  i.user_id, i.household_id, 'income', null, i.name,
  i.amount_monthly_base, i.currency, 'mensual',
  extract(month from current_date)::int, extract(year from current_date)::int
from public.income_sources i
where i.include_in_budget = true
  and not exists (
    select 1 from public.budget_items b
    where b.user_id = i.user_id and b.type = 'income' and b.name = i.name
      and b.period_month = extract(month from current_date)::int
      and b.period_year = extract(year from current_date)::int
  );

insert into public.budget_items
  (user_id, household_id, type, category_id, name, amount, currency, frequency, period_month, period_year)
select
  e.user_id, e.household_id, 'expense', e.category_id, e.name,
  e.amount_monthly_base, e.currency, 'mensual',
  extract(month from current_date)::int, extract(year from current_date)::int
from public.expense_items e
where not exists (
    select 1 from public.budget_items b
    where b.user_id = e.user_id and b.type = 'expense' and b.name = e.name
      and b.period_month = extract(month from current_date)::int
      and b.period_year = extract(year from current_date)::int
  );
