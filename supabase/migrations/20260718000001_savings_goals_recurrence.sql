-- Frascos de ahorro recurrentes (marchamo anual, ropa del año, aguinaldo…).
-- Se reinician solos por período: cuando next_reset_on <= hoy, target_amount
-- vuelve a period_amount (el plan pleno del período) y next_reset_on avanza una
-- cadencia. El sobrante se ARRASTRA: current_amount no se toca (ventaja inicial
-- del siguiente período). recurrence='ninguna' = frasco one-shot (default → no
-- afecta las metas existentes).
alter table public.savings_goals
  add column if not exists recurrence text not null default 'ninguna'
    check (recurrence in ('ninguna','mensual','trimestral','semestral','anual')),
  add column if not exists period_amount numeric(18,2),
  add column if not exists next_reset_on date;

-- Historial de reinicios por período (trazabilidad; se muestra en el detalle del
-- frasco). Lo escribe el cron con service-role; el usuario solo lo lee (RLS).
create table if not exists public.goal_period_resets (
  id              uuid primary key default gen_random_uuid(),
  goal_id         uuid not null references public.savings_goals(id) on delete cascade,
  user_id         uuid not null references auth.users(id) on delete cascade,
  household_id    uuid references public.households(id) on delete set null,
  reset_on        date not null,
  restored_target numeric(18,2) not null,
  carried_over    numeric(18,2) not null,
  created_at      timestamptz not null default now(),
  -- Idempotencia: un solo reinicio por frasco y día (si el cron corre 2 veces).
  unique (goal_id, reset_on)
);

create index if not exists idx_goal_period_resets_goal
  on public.goal_period_resets (goal_id, reset_on);
create index if not exists idx_goal_period_resets_user
  on public.goal_period_resets (user_id);

alter table public.goal_period_resets enable row level security;
alter table public.goal_period_resets force  row level security;

-- Idempotente: drop-if-exists antes de cada policy (aplicación manual sin drift).
drop policy if exists goal_period_resets_sel on public.goal_period_resets;
drop policy if exists goal_period_resets_ins on public.goal_period_resets;
drop policy if exists goal_period_resets_del on public.goal_period_resets;

create policy goal_period_resets_sel on public.goal_period_resets
  for select using (
    user_id = auth.uid()
    or (household_id is not null and public.is_household_member(household_id))
  );
create policy goal_period_resets_ins on public.goal_period_resets
  for insert with check (user_id = auth.uid());
create policy goal_period_resets_del on public.goal_period_resets
  for delete using (
    user_id = auth.uid()
    or (household_id is not null and public.is_household_member(household_id))
  );
