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
