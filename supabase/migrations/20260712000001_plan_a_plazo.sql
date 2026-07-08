-- Producto "Plan a plazo" (unit-linked): plazo + historial de valores.

alter table public.investment_holdings
  add column if not exists term_years int;  -- 5/10/15/20 (solo planes)

-- Historial de valores del estado de cuenta (para la curva del plan).
create table if not exists public.holding_valuations (
  id           uuid primary key default gen_random_uuid(),
  holding_id   uuid not null references public.investment_holdings(id) on delete cascade,
  user_id      uuid not null references auth.users(id) on delete cascade,
  household_id uuid references public.households(id) on delete set null,
  as_of        date not null,
  value        numeric(18,2) not null,
  currency     char(3) not null default 'USD',
  created_at   timestamptz not null default now(),
  unique (holding_id, as_of)
);

create index if not exists idx_holding_valuations_holding
  on public.holding_valuations (holding_id, as_of);

alter table public.holding_valuations enable row level security;
alter table public.holding_valuations force  row level security;

drop policy if exists holding_val_sel on public.holding_valuations;
drop policy if exists holding_val_ins on public.holding_valuations;
drop policy if exists holding_val_upd on public.holding_valuations;
drop policy if exists holding_val_del on public.holding_valuations;

create policy holding_val_sel on public.holding_valuations
  for select using (user_id = auth.uid() or (household_id is not null and public.is_household_member(household_id)));
create policy holding_val_ins on public.holding_valuations
  for insert with check (user_id = auth.uid());
create policy holding_val_upd on public.holding_valuations
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy holding_val_del on public.holding_valuations
  for delete using (user_id = auth.uid() or (household_id is not null and public.is_household_member(household_id)));
