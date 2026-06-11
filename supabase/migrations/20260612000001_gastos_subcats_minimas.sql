-- ============================================================
-- 0026 · Subcategorías mínimas visibles por grupo (ADITIVA, IDEMPOTENTE)
-- ------------------------------------------------------------
-- Define qué hojas de sistema se muestran como "sobre" por defecto en el
-- rediseño de Gastos (frascos): is_favorite = true. El resto de las hojas
-- de sistema se conservan (NO se borran) pero dejan de mostrarse como sobre
-- por defecto (is_favorite = false); siguen disponibles como sugerencia.
--
-- Reglas (igual que 0025):
--   · CERO delete de categorías con transacciones. Ids preservados.
--   · Conceptos que YA existen (Restaurantes, Farmacia, Gimnasio,
--     Suscripciones, Viajes) se REUSAN por id (update is_favorite/name),
--     nunca se duplican con key nuevo.
--   · Hojas del usuario (is_system = false) no se tocan.
--   · Idempotente: re-ejecutable sin cambiar filas.
-- ============================================================

-- ------------------------------------------------------------
-- 1) Hojas visibles NUEVAS por grupo (insert … select … where not exists)
--    Solo las que no existen como concepto; favoritas de fábrica.
-- ------------------------------------------------------------
insert into public.expense_categories
  (parent_id, key, name, default_nature, is_system, sort_order, category_type, is_favorite)
select p.id, s.key, s.name, p.default_nature, true, s.ord, 'expense', true
from (values
  ('g_vivienda',     'viv_servicios',      'Servicios general',            10),
  ('g_vivienda',     'viv_alquiler',       'Alquiler',                     20),
  ('g_vivienda',     'viv_mantenimiento',  'Mantenimiento y reparaciones', 30),
  ('g_transporte',   'trans_vehiculo',     'Gastos vehículo',              10),
  ('g_transporte',   'trans_mantenimiento','Mantenimiento',                20),
  ('g_alimentacion', 'alim_super',         'Supermercados',                10),
  ('g_salud',        'salud_general',      'Salud general',                10),
  ('g_salud',        'salud_cuidado',      'Cuidado personal/estética',    20),
  ('g_educacion',    'edu_formacion',      'Formación',                    10)
) as s(parent_key, key, name, ord)
join public.expense_categories p on p.key = s.parent_key and p.is_system
where not exists (
  select 1 from public.expense_categories e where e.key = s.key and e.is_system
);

-- ------------------------------------------------------------
-- 2) Conceptos EXISTENTES que pasan a ser sobre visible (reuse por key):
--    favoritos + orden; renombre solo donde el diseño lo pide. Las guardas
--    `is distinct from` evitan tocar la fila (updated_at) si ya está en el
--    estado destino → re-ejecución reporta UPDATE 0.
-- ------------------------------------------------------------
update public.expense_categories set is_favorite = true, sort_order = 20, updated_at = now()
  where key = 'alim_restaurantes' and is_system
    and (is_favorite is not true or sort_order is distinct from 20);  -- "Restaurantes"
update public.expense_categories set is_favorite = true, sort_order = 30, updated_at = now()
  where key = 'salud_farmacia' and is_system
    and (is_favorite is not true or sort_order is distinct from 30);  -- "Farmacia"
update public.expense_categories set is_favorite = true, sort_order = 30, updated_at = now()
  where key = 'estilo_gimnasio' and is_system
    and (is_favorite is not true or sort_order is distinct from 30);  -- "Gimnasio"
update public.expense_categories set is_favorite = true, sort_order = 20, updated_at = now()
  where key = 'suscripciones' and is_system
    and (is_favorite is not true or sort_order is distinct from 20);  -- "Suscripciones" (diseño: "Subscripciones")
update public.expense_categories set is_favorite = true, name = 'Viajes o paseos', sort_order = 10, updated_at = now()
  where key = 'viajes' and is_system
    and (is_favorite is not true or name is distinct from 'Viajes o paseos' or sort_order is distinct from 10);

-- Ahorro a Largo Plazo: fondos fijos siempre sugeridos como sobre.
update public.expense_categories set is_favorite = true, sort_order = 10, updated_at = now()
  where key = 'fondo_emergencia' and is_system
    and (is_favorite is not true or sort_order is distinct from 10);
update public.expense_categories set is_favorite = true, sort_order = 20, updated_at = now()
  where key = 'fondo_paz' and is_system
    and (is_favorite is not true or sort_order is distinct from 20);

-- ------------------------------------------------------------
-- 3) Ocultar de los sobres por defecto las hojas de sistema sobrantes
--    (siguen existiendo y disponibles como sugerencia). Idempotente.
-- ------------------------------------------------------------
update public.expense_categories set is_favorite = false, updated_at = now()
where is_system and is_favorite = true and key in (
  -- Alimentación: el legado "Alimentación" es redundante con su grupo.
  'alimentacion',
  -- Transporte sobrantes
  'transporte', 'automovil', 'trans_combustible', 'trans_bus', 'trans_uber',
  'trans_taxi', 'trans_peajes', 'trans_parqueos',
  -- Vivienda legadas (reemplazadas por viv_*)
  'vivienda', 'servicios_hogar',
  -- Salud sobrantes
  'salud', 'cuidado_personal', 'salud_consultas', 'salud_dental',
  -- Estilo de Vida sobrantes
  'disfrute', 'tecnologia', 'estilo_streaming', 'estilo_ropa', 'estilo_regalos',
  -- Educación: el legado "Educación" se reemplaza por "Formación"
  'educacion',
  -- Ahorro: estas son sugerencias del modal vinculado, no sobres fijos
  'retiro', 'ahorro_metas', 'ahorro_otros'
);
