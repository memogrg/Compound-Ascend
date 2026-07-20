-- ============================================================
-- 20260724000001 · Log de borrados del hogar (household_activity_log)
--
-- created_by/last_edited_by (20260723000001) cubren crear y editar, pero NO el
-- borrado: la fila desaparece y con ella el rastro. Con la edición compartida un
-- miembro puede borrar registros del hogar, así que "¿quién borró esto?" quedaba
-- sin respuesta.
--
-- Captura desde la CAPA DE APP (no trigger, decisión de diseño) y guarda solo la
-- REFERENCIA (tabla + id + quién + cuándo), no una copia del contenido.
--
-- Riesgo asumido: el logging en la app solo cubre las rutas de borrado que
-- mapeamos. La mitigación es un test de cobertura (cada función de borrado de
-- usuario debe llamar al helper). Si algún día se quiere garantía total sin
-- importar la ruta, un trigger de DELETE la daría.
--
-- Aplicación manual por SQL Editor; luego
--   supabase migration repair --status applied 20260724000001
-- ============================================================

create table if not exists public.household_activity_log (
  id uuid primary key default gen_random_uuid(),
  -- El hogar donde ocurrió. on delete cascade: si el hogar se borra, su log se va.
  household_id uuid references public.households(id) on delete cascade,
  -- Quién borró. on delete set null: si la cuenta se da de baja, el rastro
  -- sobrevive sin puntero (mismo criterio que created_by/last_edited_by).
  user_id uuid references auth.users(id) on delete set null,
  table_name text not null,
  row_id uuid not null,
  action text not null default 'delete' check (action in ('delete')),
  created_at timestamptz not null default now()
);

-- Consulta típica: "actividad del hogar, más reciente primero".
create index if not exists idx_hal_household_created
  on public.household_activity_log (household_id, created_at desc);
-- Consulta puntual: "¿qué pasó con esta fila?".
create index if not exists idx_hal_table_row
  on public.household_activity_log (table_name, row_id);

alter table public.household_activity_log enable row level security;
alter table public.household_activity_log force row level security;

-- Lectura: cualquier miembro del hogar ve su actividad.
drop policy if exists hal_select on public.household_activity_log;
create policy hal_select on public.household_activity_log
  for select using (
    household_id is not null and public.is_household_member(household_id)
  );

-- Inserción: cada quien registra sus propias acciones (user_id = quien escribe).
-- No hay update ni delete: el log es append-only e inmutable para los clientes.
drop policy if exists hal_insert on public.household_activity_log;
create policy hal_insert on public.household_activity_log
  for insert with check (user_id = auth.uid());
