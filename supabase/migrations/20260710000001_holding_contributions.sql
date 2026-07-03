-- Aportes mensuales por holding recurrente (brecha DCA).
-- Un registro por holding y por mes: monto (fijo = monthly_contribution),
-- precio unitario, estado y el gasto vinculado. Idempotente.

create table if not exists public.holding_contributions (
  id              uuid primary key default gen_random_uuid(),
  holding_id      uuid not null references public.investment_holdings(id) on delete cascade,
  user_id         uuid not null references auth.users(id) on delete cascade,
  household_id    uuid references public.households(id) on delete set null,
  period_year     int  not null,
  period_month    int  not null check (period_month between 1 and 12),
  amount          numeric(18,2) not null,
  unit_price      numeric(24,8),
  currency        char(3) not null default 'CRC',
  status          text not null default 'pendiente'
                    check (status in ('pendiente','auto','confirmado')),
  expense_item_id uuid references public.budget_items(id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (holding_id, period_year, period_month)
);

create index if not exists idx_holding_contrib_user_period
  on public.holding_contributions (user_id, period_year, period_month);
create index if not exists idx_holding_contrib_holding
  on public.holding_contributions (holding_id);

alter table public.holding_contributions enable row level security;
alter table public.holding_contributions force  row level security;

-- Idempotente: drop-if-exists antes de cada policy (aplicación manual sin drift).
drop policy if exists holding_contrib_sel on public.holding_contributions;
drop policy if exists holding_contrib_ins on public.holding_contributions;
drop policy if exists holding_contrib_upd on public.holding_contributions;
drop policy if exists holding_contrib_del on public.holding_contributions;

create policy holding_contrib_sel on public.holding_contributions
  for select using (
    user_id = auth.uid()
    or (household_id is not null and public.is_household_member(household_id))
  );
create policy holding_contrib_ins on public.holding_contributions
  for insert with check (user_id = auth.uid());
create policy holding_contrib_upd on public.holding_contributions
  for update using (
    user_id = auth.uid()
    or (household_id is not null and public.is_household_member(household_id))
  ) with check (user_id = auth.uid());
create policy holding_contrib_del on public.holding_contributions
  for delete using (
    user_id = auth.uid()
    or (household_id is not null and public.is_household_member(household_id))
  );
