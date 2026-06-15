-- Ingresos (Fase 1 · rediseño del tab): clasificación e identificación de
-- recurrencia en las líneas de presupuesto de ingreso. Aditivo e idempotente.

-- income_type: clasifica cada fuente de ingreso. Nullable con default 'activo'
-- (las filas existentes y las líneas derivadas que no lo fijen quedan 'activo').
-- Reutiliza la taxonomía INCOME_TYPES (base-engine.ts): activo|pasivo|extraordinario.
alter table public.budget_items
  add column if not exists income_type text default 'activo';

-- Recurrencia copy-on-demand: la fuente recurrente enlaza una plantilla en
-- recurring_items (creada inactiva, no auto-sincronizada). La Fase 2 la copia al
-- mes actual con "Copiar ingresos del mes anterior".
alter table public.budget_items
  add column if not exists recurring_item_id uuid
    references public.recurring_items(id) on delete set null;

-- Solo valores válidos (permite null: las líneas de gasto no usan la columna).
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'budget_items_income_type_chk'
  ) then
    alter table public.budget_items
      add constraint budget_items_income_type_chk
      check (income_type is null or income_type in ('activo', 'pasivo', 'extraordinario'));
  end if;
end $$;

-- Lookup de fuentes recurrentes (Fase 2 · copia del mes anterior).
create index if not exists idx_budget_items_recurring
  on public.budget_items (recurring_item_id)
  where recurring_item_id is not null;
