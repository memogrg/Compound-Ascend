-- Ingresos (subcategorías por tipo): agrupa las categorías de ingreso bajo 3
-- grupos-tipo (activo/pasivo/extraordinario) dentro de g_ingresos. Aditivo e
-- idempotente. CONSERVA las keys que usan los servicios (inc_pasivo, inc_venta);
-- getSystemCategoryId(key) sigue resolviendo (sin duplicar keys → maybeSingle ok).

-- 1) Grupo "Ingreso activo" (NUEVO). inc_pasivo e inc_extra ya existen como
--    hojas planas y se reutilizan como grupos.
insert into public.expense_categories (key, name, is_system, sort_order, category_type, parent_id)
select 'inc_activo', 'Ingreso activo', true, 1, 'income', p.id
from public.expense_categories p
where p.key = 'g_ingresos'
  and p.is_system
  and not exists (
    select 1 from public.expense_categories where key = 'inc_activo' and is_system
  );

-- 2) Reutiliza inc_pasivo / inc_extra como grupos (nombre + orden estables).
update public.expense_categories
  set name = 'Ingreso pasivo', sort_order = 2
  where key = 'inc_pasivo' and is_system;
update public.expense_categories
  set name = 'Extraordinario', sort_order = 3
  where key = 'inc_extra' and is_system;

-- 3) Reparenta las hojas existentes a su grupo (KEYS intactas; ajusta labels).
update public.expense_categories
  set parent_id = (select id from public.expense_categories where key = 'inc_activo' and is_system),
      name = 'Salario'
  where key = 'inc_salario' and is_system;
update public.expense_categories
  set parent_id = (select id from public.expense_categories where key = 'inc_activo' and is_system),
      name = 'Comisiones'
  where key = 'inc_comision' and is_system;
update public.expense_categories
  set parent_id = (select id from public.expense_categories where key = 'inc_extra' and is_system),
      name = 'Venta de activos'
  where key = 'inc_venta' and is_system;
update public.expense_categories
  set parent_id = (select id from public.expense_categories where key = 'inc_extra' and is_system),
      name = 'Reembolsos'
  where key = 'inc_reembolso' and is_system;

-- 4) Siembra las hojas faltantes por grupo (idempotente por nombre + parent).
--    Las hojas reutilizadas (Salario, Comisiones, Venta de activos, Reembolsos)
--    no se reinsertan.
insert into public.expense_categories (name, is_system, sort_order, category_type, parent_id)
select v.name, true, v.ord, 'income', g.id
from (
  values
    ('inc_activo', 'Bonos y beneficios', 2),
    ('inc_activo', 'Servicios profesionales', 3),
    ('inc_activo', 'Negocio o ventas', 4),
    ('inc_activo', 'Plataformas digitales', 5),
    ('inc_activo', 'Freelance', 6),
    ('inc_pasivo', 'Inversiones', 1),
    ('inc_pasivo', 'Dividendos', 2),
    ('inc_pasivo', 'Alquileres', 3),
    ('inc_pasivo', 'Regalías', 4),
    ('inc_extra', 'Premios o ayudas', 3)
) as v(group_key, name, ord)
join public.expense_categories g on g.key = v.group_key and g.is_system
where not exists (
  select 1 from public.expense_categories c
  where c.parent_id = g.id and c.name = v.name and c.is_system
);
