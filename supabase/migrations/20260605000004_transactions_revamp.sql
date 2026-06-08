-- ============================================================
-- 0018 · Reestructuración del módulo de Transacciones (ADITIVA, NO destructiva)
-- ------------------------------------------------------------
-- Objetivos:
--   1. Taxonomía premium: 8 grupos de gasto de Nivel 1 + reorganización
--      (re-parenting) de las 23 categorías de sistema legadas como Nivel 2.
--   2. Nuevas columnas de presentación (icon, color), control (is_active,
--      is_favorite, category_type) y soporte de fusión (merged_into_id).
--   3. Plantillas / favoritos para registro en 1 clic (transaction_templates).
--   4. Hook para IA futura (transactions.ai_meta) — arquitectura preparada,
--      sin motor.
--
-- Garantías:
--   · No borra ninguna fila. No usa DELETE sobre expense_categories.
--   · No re-asigna transactions.category_id: las categorías legadas conservan
--     su id y solo cambian de lugar en el árbol (parent_id). Cero pérdida.
--   · Idempotente: puede re-ejecutarse sin efectos colaterales.
-- ============================================================

-- ------------------------------------------------------------
-- 1) Columnas nuevas en expense_categories (todas opcionales / con default)
-- ------------------------------------------------------------
alter table public.expense_categories
  add column if not exists category_type text not null default 'expense'
    check (category_type in ('expense', 'income', 'transfer', 'both')),
  add column if not exists icon text,
  add column if not exists color text,
  add column if not exists is_active boolean not null default true,
  add column if not exists is_favorite boolean not null default false,
  add column if not exists merged_into_id uuid
    references public.expense_categories(id) on delete set null;

-- Índice único parcial: permite upsert idempotente de categorías de sistema por key.
create unique index if not exists uq_expense_categories_system_key
  on public.expense_categories(key) where is_system;

create index if not exists idx_expense_categories_active
  on public.expense_categories(is_active);

-- ------------------------------------------------------------
-- 2) Crear los 8 grupos de gasto de Nivel 1 (idempotente por key)
-- ------------------------------------------------------------
insert into public.expense_categories
  (key, name, default_nature, is_system, sort_order, category_type, icon, color)
values
  ('g_vivienda',    'Vivienda',                'esencial',    true, 10, 'expense', 'home',     'var(--c-expense)'),
  ('g_transporte',  'Transporte',              'esencial',    true, 20, 'expense', 'car',      'var(--info)'),
  ('g_alimentacion','Alimentación',            'esencial',    true, 30, 'expense', 'food',     'var(--gold)'),
  ('g_salud',       'Salud y Bienestar',       'proteccion',  true, 40, 'expense', 'heart',    'var(--c-protect)'),
  ('g_estilo',      'Estilo de Vida',          'estilo_vida', true, 50, 'expense', 'sparkles', 'var(--teal)'),
  ('g_educacion',   'Educación y Crecimiento', 'crecimiento', true, 60, 'expense', 'book',     'var(--c-invest)'),
  ('g_finanzas',    'Finanzas',                'financiero',  true, 70, 'expense', 'bank',     'var(--c-networth)'),
  ('g_otros',       'Otros',                   'miscelaneo',  true, 80, 'expense', 'dots',     'var(--muted)')
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
-- 3) Re-parent de las categorías legadas de sistema (Nivel 1 → Nivel 2)
--    Solo afecta filas con parent_id null (las antiguas raíces). Sus hijas
--    (alquiler, supermercado, marchamo…) siguen colgando de ellas. La UI
--    aplana los descendientes de cada grupo para mostrar 2 niveles visibles.
-- ------------------------------------------------------------
update public.expense_categories child
set parent_id = grp.id,
    sort_order = m.ord,
    updated_at = now()
from (values
  ('vivienda',         'g_vivienda',     1),
  ('servicios_hogar',  'g_vivienda',     2),
  ('transporte',       'g_transporte',   1),
  ('automovil',        'g_transporte',   2),
  ('alimentacion',     'g_alimentacion', 1),
  ('salud',            'g_salud',        1),
  ('cuidado_personal', 'g_salud',        2),
  ('disfrute',         'g_estilo',       1),
  ('viajes',           'g_estilo',       2),
  ('suscripciones',    'g_estilo',       3),
  ('tecnologia',       'g_estilo',       4),
  ('educacion',        'g_educacion',    1),
  ('inversiones',      'g_educacion',    2),
  ('retiro',           'g_educacion',    3),
  ('deudas',           'g_finanzas',     1),
  ('seguros',          'g_finanzas',     2),
  ('impuestos',        'g_finanzas',     3),
  ('fondo_emergencia', 'g_finanzas',     4),
  ('fondo_paz',        'g_finanzas',     5),
  ('familia',          'g_otros',        1),
  ('mascotas',         'g_otros',        2),
  ('donaciones',       'g_otros',        3),
  ('miscelaneos',      'g_otros',        4)
) as m(child_key, group_key, ord)
join public.expense_categories grp on grp.key = m.group_key and grp.is_system
where child.key = m.child_key
  and child.is_system
  and child.parent_id is null;

-- ------------------------------------------------------------
-- 4) Nuevas subcategorías útiles (leaves) — idempotente por key.
--    Cuelgan directamente del grupo o de una categoría legada concreta.
-- ------------------------------------------------------------
insert into public.expense_categories
  (parent_id, key, name, default_nature, is_system, sort_order, category_type)
select p.id, s.key, s.name, p.default_nature, true, s.ord, 'expense'
from (values
  -- Transporte (combustible y movilidad urbana, no existían)
  ('g_transporte', 'trans_combustible', 'Combustible',        10),
  ('g_transporte', 'trans_bus',         'Bus / Tren',         11),
  ('g_transporte', 'trans_uber',        'Uber / DiDi',        12),
  ('g_transporte', 'trans_taxi',        'Taxi',               13),
  ('g_transporte', 'trans_peajes',      'Peajes',             14),
  ('g_transporte', 'trans_parqueos',    'Parqueos',           15),
  -- Alimentación (restaurantes y bebidas)
  ('g_alimentacion','alim_restaurantes','Restaurantes',       20),
  -- Estilo de Vida (streaming explícito bajo el grupo)
  ('g_estilo',     'estilo_streaming',  'Streaming',          30),
  ('g_estilo',     'estilo_gimnasio',   'Gimnasio',           31),
  ('g_estilo',     'estilo_ropa',       'Ropa',               32),
  ('g_estilo',     'estilo_regalos',    'Regalos',            33),
  -- Salud
  ('g_salud',      'salud_consultas',   'Consultas médicas',  40),
  ('g_salud',      'salud_farmacia',    'Farmacia',           41),
  ('g_salud',      'salud_dental',      'Dental',             42)
) as s(parent_key, key, name, ord)
join public.expense_categories p on p.key = s.parent_key and p.is_system
where not exists (
  select 1 from public.expense_categories e where e.key = s.key and e.is_system
);

-- ------------------------------------------------------------
-- 5) Marcar grupos de uso frecuente como favoritos (sugerencia inicial UI).
-- ------------------------------------------------------------
update public.expense_categories
set is_favorite = true, updated_at = now()
where is_system and key in ('alimentacion', 'g_transporte', 'g_vivienda');

-- ------------------------------------------------------------
-- 6) Plantillas / favoritos de transacción (registro en 1 clic).
-- ------------------------------------------------------------
create table if not exists public.transaction_templates (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  household_id uuid references public.households(id) on delete set null,
  name text not null,
  kind text not null default 'gasto' check (kind in ('ingreso', 'gasto', 'transferencia')),
  amount numeric(18,2),
  currency char(3) not null default 'CRC',
  category_id uuid references public.expense_categories(id) on delete set null,
  account_id uuid references public.accounts(id) on delete set null,
  merchant_or_source text,
  note text,
  is_favorite boolean not null default true,
  sort_order int not null default 0,
  last_used_at timestamptz,
  use_count int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_txn_templates_user_sort
  on public.transaction_templates(user_id, sort_order);

-- RLS estándar (dueño + hogar), índices y trigger updated_at.
-- Guard de idempotencia: apply_user_data_policies hace `create policy` sin
-- `if not exists`, así que solo lo aplicamos si las políticas aún no existen.
do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'transaction_templates'
      and policyname = 'transaction_templates_sel'
  ) then
    perform public.apply_user_data_policies(array['transaction_templates']);
  end if;
end$$;

-- ------------------------------------------------------------
-- 7) Hook de IA (arquitectura preparada, sin motor todavía).
--    ai_meta guardará: { suggestedCategoryId, confidence, model, reason,
--    anomalyScore, duplicateOf }. confidence_score_internal ya existe (0015).
-- ------------------------------------------------------------
alter table public.transactions
  add column if not exists ai_meta jsonb;
