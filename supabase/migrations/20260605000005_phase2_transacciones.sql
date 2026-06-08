-- ============================================================
-- 0019 · Fase 2 Transacciones (ADITIVA, NO destructiva, idempotente)
--   1. kind 'ajuste' en transactions (conciliación de saldo, neutro en agregados).
--   2. transaction_rules.priority (orden de evaluación de reglas).
--   3. Categorías de ingreso de sistema (grupo g_ingresos + subcategorías),
--      para dar paridad opcional con las "fuentes" de texto. category_type='income'.
-- ============================================================

-- ------------------------------------------------------------
-- 1) Permitir kind='ajuste' (mismo patrón que 'transferencia').
-- ------------------------------------------------------------
do $$
declare c text;
begin
  for c in
    select conname from pg_constraint
    where conrelid = 'public.transactions'::regclass
      and contype = 'c'
      and pg_get_constraintdef(oid) ilike '%kind%'
  loop
    execute format('alter table public.transactions drop constraint %I', c);
  end loop;
  alter table public.transactions
    add constraint transactions_kind_chk
    check (kind in ('ingreso', 'gasto', 'transferencia', 'ajuste'));
end $$;

-- ------------------------------------------------------------
-- 2) Prioridad de reglas (mayor = se evalúa primero).
-- ------------------------------------------------------------
alter table public.transaction_rules
  add column if not exists priority int not null default 0;

-- ------------------------------------------------------------
-- 3) Categorías de ingreso de sistema (grupo + subcategorías), idempotente.
-- ------------------------------------------------------------
insert into public.expense_categories
  (key, name, default_nature, is_system, sort_order, category_type, icon, color)
select 'g_ingresos', 'Ingresos', 'crecimiento', true, 5, 'income', 'income', 'var(--pos)'
where not exists (
  select 1 from public.expense_categories where key = 'g_ingresos' and is_system
);

insert into public.expense_categories
  (parent_id, key, name, is_system, sort_order, category_type)
select p.id, s.key, s.name, true, s.ord, 'income'
from (values
  ('inc_salario',   'Salario',          1),
  ('inc_comision',  'Comisión',         2),
  ('inc_venta',     'Venta',            3),
  ('inc_reembolso', 'Reembolso',        4),
  ('inc_pasivo',    'Ingreso pasivo',   5),
  ('inc_extra',     'Extraordinario',   6)
) as s(key, name, ord)
join public.expense_categories p on p.key = 'g_ingresos' and p.is_system
where not exists (
  select 1 from public.expense_categories e where e.key = s.key and e.is_system
);
