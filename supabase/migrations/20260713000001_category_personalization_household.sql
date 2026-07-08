-- ============================================================
-- 20260713000001 · Personalización de categorías COMPARTIDA POR HOGAR (Fase 0)
--
-- Capa base para que un hogar pueda ocultar (hidden) o editar (fork) sus frascos
-- y sobres, incluidos los BASE, sin afectar a otros hogares. Esta migración SOLO
-- crea el esquema y la RLS; la lógica de servicio y la UI llegan en fases aparte.
--
-- Aditiva e idempotente. NO toca las categorías de sistema (is_system=true,
-- user_id null, household_id null): siguen globales, visibles e inmutables.
-- Reutiliza is_household_member / is_household_editor / apply_user_data_policies
-- (20260601000001) y el modelo de hogar existente.
--
-- Aplicación: manual por SQL Editor; luego
--   supabase migration repair --status applied 20260713000001
-- ============================================================

-- ------------------------------------------------------------
-- (A) expense_categories: household_id + RLS re-escopada a hogar.
--     Las custom/fork del hogar pasan a ser visibles/editables por sus miembros;
--     las de sistema (user_id null, household_id null) siguen globales e inmutables.
-- ------------------------------------------------------------
alter table public.expense_categories
  add column if not exists household_id uuid references public.households(id) on delete set null;

create index if not exists idx_expense_categories_household
  on public.expense_categories(household_id);

-- Reemplaza las 4 policies antiguas (dueño-only) por el patrón de hogar.
drop policy if exists expense_categories_sel on public.expense_categories;
drop policy if exists expense_categories_ins on public.expense_categories;
drop policy if exists expense_categories_upd on public.expense_categories;
drop policy if exists expense_categories_del on public.expense_categories;

-- Lectura: sistema (global) + propias (solo / aún sin hogar) + custom/fork del hogar.
create policy expense_categories_sel on public.expense_categories
  for select using (
    user_id is null
    or user_id = auth.uid()
    or (household_id is not null and public.is_household_member(household_id))
  );

-- Alta: el autor es uno mismo; el household_id lo fija la app (getActiveHouseholdId).
create policy expense_categories_ins on public.expense_categories
  for insert with check (user_id = auth.uid());

-- Edición/borrado: propias, o custom/fork del hogar si eres editor (owner/adult).
-- Las de sistema (user_id null, household_id null) no matchean ninguna cláusula → inmutables.
create policy expense_categories_upd on public.expense_categories
  for update using (
    user_id = auth.uid()
    or (household_id is not null and public.is_household_editor(household_id))
  ) with check (
    user_id = auth.uid()
    or (household_id is not null and public.is_household_editor(household_id))
  );
create policy expense_categories_del on public.expense_categories
  for delete using (
    user_id = auth.uid()
    or (household_id is not null and public.is_household_editor(household_id))
  );

-- ------------------------------------------------------------
-- (B) category_overrides: capa por-hogar de ocultar (hidden) / reemplazar (fork).
--     Una fila por (scope, categoría base). RLS de hogar estándar.
-- ------------------------------------------------------------
create table if not exists public.category_overrides (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,   -- autor
  household_id uuid references public.households(id) on delete cascade, -- scope; null = modo solo
  category_id uuid not null references public.expense_categories(id) on delete cascade, -- BASE intervenida
  hidden boolean not null default false,   -- ocultar la base para el hogar
  fork_id uuid references public.expense_categories(id) on delete set null, -- copia que la reemplaza (editar)
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Unicidad por scope: una intervención por (hogar, base); en modo solo, por (usuario, base).
create unique index if not exists uq_covr_household
  on public.category_overrides(household_id, category_id) where household_id is not null;
create unique index if not exists uq_covr_user
  on public.category_overrides(user_id, category_id) where household_id is null;

-- RLS + índices (user/household/created) + trigger updated_at estándar de hogar.
-- Guardado para idempotencia: apply_user_data_policies hace `create policy` sin
-- `drop if exists`, así que solo se aplica cuando aún no hay policies en la tabla.
do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'category_overrides'
  ) then
    perform public.apply_user_data_policies(array['category_overrides']);
  end if;
end $$;
