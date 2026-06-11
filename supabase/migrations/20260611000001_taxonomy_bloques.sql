-- ============================================================
-- 0025 · Taxonomía de gastos alineada a los bloques (ADITIVA, NO destructiva)
-- ------------------------------------------------------------
-- Grupos del sistema (nuevo orden):
--   Vivienda · Transporte · Alimentación · Salud y Bienestar · Estilo de Vida
--   · Educación · Libertad Financiera · Deudas · Defensa Patrimonial
--   · Ahorro a Largo Plazo · Otros (fallback)
--
-- Reglas:
--   · CERO deletes de categorías con transacciones. Las hojas existentes se
--     re-parentean/renombran CONSERVANDO su id (transacciones y reportes
--     intactos). "Finanzas" desaparece con el mecanismo de merge existente
--     (reasignar referencias + merged_into_id + is_active=false).
--   · "Educación y Crecimiento" se convierte en "Educación" por RENAME del
--     mismo grupo (id preservado): equivale a desaparecer + heredar hijas
--     educativas, sin huérfanos.
--   · Las categorías del usuario (is_system=false) no se tocan.
--   · Los keys de sistema existentes NO cambian (el seed de sugerencias y el
--     plan derivado resuelven por key; solo cambian nombre/padre/linked_kind).
--   · Idempotente: re-ejecutable sin efectos colaterales.
-- ============================================================

-- ------------------------------------------------------------
-- 1) Grupos existentes: nombres y orden nuevo (ids preservados)
-- ------------------------------------------------------------
update public.expense_categories set name = 'Vivienda',          sort_order = 10,  updated_at = now() where key = 'g_vivienda'     and is_system;
update public.expense_categories set name = 'Transporte',        sort_order = 20,  updated_at = now() where key = 'g_transporte'   and is_system;
update public.expense_categories set name = 'Alimentación',      sort_order = 30,  updated_at = now() where key = 'g_alimentacion' and is_system;
update public.expense_categories set name = 'Salud y Bienestar', sort_order = 40,  updated_at = now() where key = 'g_salud'        and is_system;
update public.expense_categories set name = 'Estilo de Vida',    sort_order = 50,  updated_at = now() where key = 'g_estilo'       and is_system;
update public.expense_categories set name = 'Educación',         sort_order = 60,  updated_at = now() where key = 'g_educacion'    and is_system;
update public.expense_categories set name = 'Otros',             sort_order = 110, updated_at = now() where key = 'g_otros'        and is_system;

-- ------------------------------------------------------------
-- 2) Grupos nuevos (idempotente por key, mismo patrón que 0018)
-- ------------------------------------------------------------
insert into public.expense_categories
  (key, name, default_nature, is_system, sort_order, category_type, icon, color)
values
  ('g_libertad',  'Libertad Financiera',  'crecimiento', true, 70,  'expense', 'invest',  'var(--c-invest)'),
  ('g_deudas',    'Deudas',               'financiero',  true, 80,  'expense', 'debt',    'var(--warn)'),
  ('g_defensa',   'Defensa Patrimonial',  'proteccion',  true, 90,  'expense', 'defense', 'var(--c-protect)'),
  ('g_ahorro_lp', 'Ahorro a Largo Plazo', 'ahorro',      true, 100, 'expense', 'savings', 'var(--pos)')
on conflict (key) where is_system
  do update set
    name = excluded.name,
    default_nature = excluded.default_nature,
    sort_order = excluded.sort_order,
    category_type = 'expense',
    icon = excluded.icon,
    color = excluded.color,
    parent_id = null,
    is_active = true,
    updated_at = now();

-- ------------------------------------------------------------
-- 3) Re-parent + rename de hojas de sistema existentes (ids intactos)
-- ------------------------------------------------------------
update public.expense_categories set
  parent_id = (select id from public.expense_categories where key = 'g_deudas' and is_system),
  name = 'Otras deudas', sort_order = 60, linked_kind = 'debt', updated_at = now()
where key = 'deudas' and is_system;

update public.expense_categories set
  parent_id = (select id from public.expense_categories where key = 'g_defensa' and is_system),
  name = 'Otros seguros', sort_order = 50, linked_kind = 'policy', updated_at = now()
where key = 'seguros' and is_system;

update public.expense_categories set
  parent_id = (select id from public.expense_categories where key = 'g_ahorro_lp' and is_system),
  sort_order = 10, linked_kind = 'goal', updated_at = now()
where key = 'fondo_emergencia' and is_system;

update public.expense_categories set
  parent_id = (select id from public.expense_categories where key = 'g_ahorro_lp' and is_system),
  sort_order = 20, linked_kind = 'goal', updated_at = now()
where key = 'retiro' and is_system;

update public.expense_categories set
  parent_id = (select id from public.expense_categories where key = 'g_ahorro_lp' and is_system),
  sort_order = 40, linked_kind = 'goal', updated_at = now()
where key = 'fondo_paz' and is_system;

update public.expense_categories set
  parent_id = (select id from public.expense_categories where key = 'g_libertad' and is_system),
  name = 'Aportes a inversión', sort_order = 10, linked_kind = 'holding', updated_at = now()
where key = 'inversiones' and is_system;

update public.expense_categories set
  parent_id = (select id from public.expense_categories where key = 'g_otros' and is_system),
  sort_order = 5, updated_at = now()
where key = 'impuestos' and is_system;

-- ------------------------------------------------------------
-- 4) Subcategorías sugeridas nuevas (idempotente por key)
-- ------------------------------------------------------------
insert into public.expense_categories
  (parent_id, key, name, default_nature, is_system, sort_order, category_type, linked_kind)
select p.id, s.key, s.name, s.nature, true, s.ord, 'expense', s.lk
from (values
  -- Deudas (todas vinculables a una deuda)
  ('g_deudas',    'deuda_tarjeta',            'Tarjeta de crédito',    'financiero',  10, 'debt'),
  ('g_deudas',    'deuda_prestamo',           'Préstamo personal',     'financiero',  20, 'debt'),
  ('g_deudas',    'deuda_hipoteca',           'Hipoteca',              'financiero',  30, 'debt'),
  ('g_deudas',    'deuda_vehiculo',           'Vehículo',              'financiero',  40, 'debt'),
  ('g_deudas',    'deuda_tiendas',            'Tiendas y almacenes',   'financiero',  50, 'debt'),
  -- Ahorro a Largo Plazo (vinculables a una meta)
  ('g_ahorro_lp', 'ahorro_metas',             'Metas de ahorro',       'ahorro',      30, 'goal'),
  ('g_ahorro_lp', 'ahorro_otros',             'Otros ahorros',         'ahorro',      50, 'goal'),
  -- Defensa Patrimonial (vinculables a una póliza)
  ('g_defensa',   'seguro_vida',              'Seguro de vida',        'proteccion',  10, 'policy'),
  ('g_defensa',   'seguro_medico',            'Seguro médico',         'proteccion',  20, 'policy'),
  ('g_defensa',   'seguro_auto',              'Seguro de auto',        'proteccion',  30, 'policy'),
  ('g_defensa',   'seguro_hogar',             'Seguro de hogar',       'proteccion',  40, 'policy'),
  -- Libertad Financiera
  ('g_libertad',  'lib_bienes_raices',        'Bienes raíces',         'inversion',   20, 'holding'),
  ('g_libertad',  'lib_educacion_financiera', 'Educación financiera',  'crecimiento', 30, null)
) as s(parent_key, key, name, nature, ord, lk)
join public.expense_categories p on p.key = s.parent_key and p.is_system
where not exists (
  select 1 from public.expense_categories e where e.key = s.key and e.is_system
);

-- ------------------------------------------------------------
-- 5) "Finanzas" desaparece → merge hacia "Otros" (mecanismo existente:
--    reasignar referencias + merged_into_id + is_active=false; sin DELETE
--    porque es de sistema). Sus hijas ya fueron re-parenteadas en (3).
-- ------------------------------------------------------------
update public.transactions t set category_id =
  (select id from public.expense_categories where key = 'g_otros' and is_system)
where t.category_id = (select id from public.expense_categories where key = 'g_finanzas' and is_system);

update public.budget_items b set category_id =
  (select id from public.expense_categories where key = 'g_otros' and is_system)
where b.category_id = (select id from public.expense_categories where key = 'g_finanzas' and is_system);

update public.expense_items e set category_id =
  (select id from public.expense_categories where key = 'g_otros' and is_system)
where e.category_id = (select id from public.expense_categories where key = 'g_finanzas' and is_system);

-- Red de seguridad: cualquier hija que siguiera colgando de Finanzas pasa a Otros.
update public.expense_categories set
  parent_id = (select id from public.expense_categories where key = 'g_otros' and is_system),
  updated_at = now()
where parent_id = (select id from public.expense_categories where key = 'g_finanzas' and is_system);

update public.expense_categories set
  merged_into_id = (select id from public.expense_categories where key = 'g_otros' and is_system),
  is_active = false, parent_id = null, updated_at = now()
where key = 'g_finanzas' and is_system and is_active;
