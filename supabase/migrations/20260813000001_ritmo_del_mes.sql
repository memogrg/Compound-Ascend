-- ============================================================================
-- 20260813000001 · El ritmo del mes (Fase A)
--
-- Tres tablas para que la app acompañe el ciclo mensual con rituales:
--
--   1. budget_month_config — ¿la configuración del mes está cerrada?
--   2. budget_late_edits   — cuántas veces se editó un sobre FUERA de la ventana
--   3. notification_log    — qué se le mandó a quién y qué día (idempotencia)
--
-- ── SCOPE: HOGAR, NO USUARIO ────────────────────────────────────────────────
-- Los `budget_items` ya son del hogar (`household_id`, RLS por `is_household_member`).
-- La ventana de configuración y el cierre del mes son decisiones sobre ESE presupuesto
-- compartido, así que también son del hogar: si un adulto cierra octubre, está cerrado
-- para los dos. Lo que NO es del hogar es la disciplina — que un miembro edite tarde no
-- es un dato del otro—, por eso `budget_late_edits` lleva `user_id` de quién lo hizo y
-- cuenta por persona. `notification_log` es enteramente por usuario: cada miembro tiene
-- su propio correo, su propia zona horaria y sus propias preferencias de canal.
--
-- ── POR QUÉ ÍNDICES PARCIALES Y NO `unique (household_id, …)` ───────────────
-- En modo solo `getActiveHouseholdId()` devuelve NULL (lib/household/active.ts:38), y en
-- Postgres dos NULL NO colisionan en un índice único: `unique (household_id, year, month)`
-- dejaría insertar octubre 2026 infinitas veces para todo usuario sin hogar. El upsert
-- perdería su ancla y "cerrar el mes" crearía una fila nueva cada vez en lugar de
-- actualizar la que ya está.
--
-- La solución son DOS índices únicos parciales que se reparten el espacio sin solaparse
-- (`where household_id is not null` / `is null`): uno cubre el caso hogar, el otro el
-- caso solo. Juntos expresan "único por (hogar, o usuario si no hay hogar)". Cada
-- `on conflict` del código nombra el índice que le toca — ver rhythm-service.ts.
--
-- ── AL MIGRAR DE SOLO A HOGAR ───────────────────────────────────────────────
-- Las filas viejas quedan con `household_id` NULL y siguen bajo el índice "solo". No se
-- reescriben acá a propósito: el usuario recién invitado no debería ver retroactivamente
-- que su pareja editó tarde en marzo. Lo del hogar empieza el día que hay hogar.
--
-- Aditiva (solo crea tablas nuevas) e idempotente.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. budget_month_config — el estado de la configuración de UN mes
-- ---------------------------------------------------------------------------
-- Una fila = "el hogar X ya terminó de configurar el mes M". La AUSENCIA de fila, o
-- `closed_at is null`, significa "todavía no lo cerró explícitamente".
--
-- Ojo con lo que esta tabla NO decide: si la VENTANA está abierta. Eso es
-- `día <= VENTANA_ULTIMO_DIA AND closed_at is null` y se calcula en el engine puro
-- (lib/rhythm/engine.ts) contra la zona horaria del PERFIL. Guardar acá un booleano
-- "ventana abierta" sería guardar una función del reloj: quedaría viejo solo.
--
-- Por eso también existe `closed_at` como timestamp y no como boolean — copiar el
-- presupuesto del mes anterior NO cierra la ventana (el usuario todavía puede ajustar
-- hasta el día 5), así que hace falta distinguir "cerrado el día 2 a mano" de "se venció".
create table if not exists public.budget_month_config (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users(id) on delete cascade,
  household_id  uuid references public.households(id) on delete set null,
  period_year   int  not null check (period_year between 2000 and 3000),
  period_month  int  not null check (period_month between 1 and 12),
  -- null = la configuración del mes sigue abierta (hasta que la ventana se venza sola).
  closed_at     timestamptz,
  -- Quién la cerró. `set null` y no `cascade`: si esa persona se va del hogar el mes
  -- sigue cerrado — la decisión no se borra con quien la tomó.
  closed_by     uuid references auth.users(id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create unique index if not exists budget_month_config_household_period_key
  on public.budget_month_config (household_id, period_year, period_month)
  where household_id is not null;

create unique index if not exists budget_month_config_solo_period_key
  on public.budget_month_config (user_id, period_year, period_month)
  where household_id is null;

-- ---------------------------------------------------------------------------
-- 2. budget_late_edits — el contador de ediciones fuera de ventana
-- ---------------------------------------------------------------------------
-- SEÑAL, NO CASTIGO. Editar tarde nunca se bloquea (ver rhythm-service.ts): se confirma,
-- se registra y se sigue. Este contador es contexto para el asesor —"llevás 4 ajustes
-- fuera de ventana en Comida este mes, ¿el presupuesto está mal calibrado?"— y para eso
-- necesita granularidad de SOBRE: "editaste tarde 4 veces" no dice nada accionable,
-- "editaste Comida 4 veces" dice que Comida está mal presupuestada.
--
-- Clave por PERSONA además de por sobre: dos miembros del mismo hogar editando el mismo
-- sobre son dos hechos distintos. El total del hogar es la suma; la del individuo es su
-- fila. Al revés (una sola fila con el último editor) se perdería quién hizo qué.
create table if not exists public.budget_late_edits (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references auth.users(id) on delete cascade,
  household_id   uuid references public.households(id) on delete set null,
  period_year    int  not null check (period_year between 2000 and 3000),
  period_month   int  not null check (period_month between 1 and 12),
  category_id    uuid not null references public.expense_categories(id) on delete cascade,
  attempts       int  not null default 0 check (attempts >= 0),
  last_attempt_at timestamptz,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create unique index if not exists budget_late_edits_household_key
  on public.budget_late_edits (household_id, period_year, period_month, category_id, user_id)
  where household_id is not null;

create unique index if not exists budget_late_edits_solo_key
  on public.budget_late_edits (user_id, period_year, period_month, category_id)
  where household_id is null;

-- Lectura del asesor: "los sobres que más se editan tarde este mes".
create index if not exists idx_budget_late_edits_period
  on public.budget_late_edits (user_id, period_year, period_month);

-- ---------------------------------------------------------------------------
-- 3. notification_log — qué se envió, a quién, por dónde y qué día
-- ---------------------------------------------------------------------------
-- La idempotencia de los tres crons. El de la ventana corre los días 1..5 y el diario
-- corre CADA HORA (para atrapar las 19:00 de cada zona horaria): sin esta tabla, el
-- diario mandaría 24 correos y un reintento de Vercel duplicaría los otros.
--
-- `sent_on` es DATE y no timestamptz porque la pregunta es "¿ya le escribí HOY?", y ese
-- "hoy" es el del USUARIO, no el del servidor (que en Vercel corre en UTC). El cron
-- resuelve el día en la zona del perfil y lo escribe ya resuelto; comparar timestamps
-- acá volvería a meter el bug de la zona.
--
-- Sin `on conflict do nothing` esto no sirve de nada: el índice único es el que convierte
-- "insertar el registro" en el candado. Se inserta ANTES de mandar, no después — un
-- correo perdido es mejor que veinticuatro.
create table if not exists public.notification_log (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users(id) on delete cascade,
  household_id  uuid references public.households(id) on delete set null,
  -- 'ventana_presupuesto' | 'cierre_mes' | 'registro_diario' (mismos kinds que los insights).
  kind          text not null,
  -- 'email' | 'push' | 'inApp' | 'whatsapp' — espeja NOTIFICATION_CHANNELS.
  channel       text not null,
  -- El día EN LA ZONA DEL USUARIO. Ver arriba.
  sent_on       date not null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create unique index if not exists notification_log_user_kind_channel_day_key
  on public.notification_log (user_id, kind, channel, sent_on);

-- ---------------------------------------------------------------------------
-- 4. ARREGLO DE PASO · user_insights.related_id: uuid → text
-- ---------------------------------------------------------------------------
-- No es limpieza opcional: sin esto, los insights de ritmo de esta misma entrega no
-- entran, y hoy hay usuarios sin NINGÚN insight por esta causa.
--
-- QUÉ PASA. La columna nació `uuid` (20260620000001), pero seis detectores le escriben
-- una clave de texto porque el insight NO cuelga de ninguna entidad: no hay una fila
-- "fondo de paz" a la que apuntar, solo hace falta una clave estable para que el upsert
-- dedupee y el usuario vea UNA tarjeta y no una por pasada. Los valores son
-- 'fondo_paz', 'ahorro_bajo', 'fondo_emergencia', 'concentracion_inversion' y
-- 'rendimiento_bajo_inflacion' (lib/insights/detectors.ts).
--
-- Ninguno es un uuid válido, así que Postgres aborta el INSERT ... ON CONFLICT. Y como
-- syncInsights manda TODAS las filas de la pasada en un solo statement, no se pierde la
-- fila mala: se pierden TODAS. Un usuario con la tasa de ahorro baja —condición de lo
-- más común— no recibe ni metas, ni deudas, ni fondos. La campana queda vacía, que es
-- justo lo que NO parece un error.
--
-- Es el mismo accidente que arregló 20260810000001 para `related_kind`, en la columna de
-- al lado. Se escapó porque los tests que cubren el valor ('fondo_paz' está afirmado
-- literalmente en insights-related-kind.test.ts) son puros y nunca tocan la base: el
-- tipo de la columna no participa de la prueba.
--
-- POR QUÉ `text` Y NO "arreglar los detectores". Porque el código tiene razón y la
-- columna no. `related_id` nunca fue una llave foránea ni se une a nada: se relee como
-- string (insights-service.ts:50) y se usa como clave de dedup en el índice único
-- (user_id, kind, related_id). Ensanchar a text es sin pérdida —todo uuid es texto
-- válido y `::text` conserva su representación canónica—, mantiene el índice y permite
-- claves con sentido como 'ventana:2026-08'. Forzar uuids sintéticos sería inventar
-- identidad para cosas que no la tienen.
--
-- Aditiva en la práctica: ninguna fila existente cambia de valor, solo de tipo. El
-- índice único se recrea solo (Postgres lo reconstruye al alterar el tipo).
do $$
begin
  if exists (
    select 1 from information_schema.columns
     where table_schema = 'public'
       and table_name = 'user_insights'
       and column_name = 'related_id'
       and data_type = 'uuid'
  ) then
    alter table public.user_insights
      alter column related_id type text using related_id::text;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- RLS estándar (dueño + hogar) + trigger updated_at + índices user/household/created.
-- ---------------------------------------------------------------------------
-- `notification_log` lo ESCRIBE el cron con service-role (omite RLS). Las políticas de
-- usuario le sirven igual para la lectura: "¿ya te avisamos hoy?" se consulta desde la
-- sesión para no repetir el aviso in-app.
select public.apply_user_data_policies(
  array['budget_month_config', 'budget_late_edits', 'notification_log']
);

-- ============================================================================
-- VERIFICACIÓN — correr DESPUÉS de aplicar. Las 5 filas deben decir 'OK'.
-- ============================================================================
-- with checks as (
--   -- 1. Las tres tablas existen.
--   select '1. tablas' as check,
--          count(*)::text || '/3' as detalle,
--          case when count(*) = 3 then 'OK' else 'FALTA' end as estado
--     from information_schema.tables
--    where table_schema = 'public'
--      and table_name in ('budget_month_config', 'budget_late_edits', 'notification_log')
--
--   union all
--   -- 2. Los cinco índices únicos (2 + 2 + 1). Son el candado real de la idempotencia.
--   select '2. indices unicos',
--          count(*)::text || '/5',
--          case when count(*) = 5 then 'OK' else 'FALTA' end
--     from pg_indexes
--    where schemaname = 'public'
--      and indexname in ('budget_month_config_household_period_key',
--                        'budget_month_config_solo_period_key',
--                        'budget_late_edits_household_key',
--                        'budget_late_edits_solo_key',
--                        'notification_log_user_kind_channel_day_key')
--
--   union all
--   -- 3. RLS habilitada Y forzada en las tres (force = ni el owner de la tabla la evade).
--   select '3. rls forzada',
--          count(*)::text || '/3',
--          case when count(*) = 3 then 'OK' else 'FALTA' end
--     from pg_class c join pg_namespace n on n.oid = c.relnamespace
--    where n.nspname = 'public'
--      and c.relname in ('budget_month_config', 'budget_late_edits', 'notification_log')
--      and c.relrowsecurity and c.relforcerowsecurity
--
--   union all
--   -- 4. Las 4 políticas por tabla (sel/ins/upd/del) que aplica apply_user_data_policies.
--   select '4. politicas',
--          count(*)::text || '/12',
--          case when count(*) = 12 then 'OK' else 'FALTA' end
--     from pg_policies
--    where schemaname = 'public'
--      and tablename in ('budget_month_config', 'budget_late_edits', 'notification_log')
--
--   union all
--   -- 5. Trigger updated_at en las tres.
--   select '5. trigger updated',
--          count(*)::text || '/3',
--          case when count(*) = 3 then 'OK' else 'FALTA' end
--     from pg_trigger t join pg_class c on c.oid = t.tgrelid
--    where c.relname in ('budget_month_config', 'budget_late_edits', 'notification_log')
--      and t.tgname like 'trg_%_updated'
--
--   union all
--   -- 6. related_id ya es text (si sigue en uuid, los insights sin entidad se siguen perdiendo).
--   select '6. related_id text',
--          data_type,
--          case when data_type = 'text' then 'OK' else 'FALTA' end
--     from information_schema.columns
--    where table_schema = 'public' and table_name = 'user_insights' and column_name = 'related_id'
-- )
-- select * from checks order by check;
--
-- ── Prueba del arreglo de related_id (revierte sola) ─────────────────────────
-- Antes de la migración esto reventaba con 'invalid input syntax for type uuid'.
-- Ahora debe insertar sin chistar. Es la reproducción exacta del bug.
--
-- begin;
--   insert into public.user_insights (user_id, kind, severity, title, body, related_id)
--     select id, 'fondo_paz', 'observar', 'prueba', 'prueba', 'fondo_paz' from auth.users limit 1;
-- rollback;
--
-- ── A quién le estaba pasando (diagnóstico, opcional) ────────────────────────
-- Cuenta los usuarios que YA tienen insights con clave de texto. Antes del arreglo
-- este número era 0 por construcción — no porque nadie los generara, sino porque
-- ninguno lograba entrar.
--
-- select count(distinct user_id) as usuarios_con_insight_sin_entidad
--   from public.user_insights
--  where related_id is not null
--    and related_id !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';
--
-- ── Prueba del índice parcial (opcional, en una transacción que se revierte) ──
-- El segundo insert DEBE fallar con "duplicate key ... budget_month_config_solo_period_key".
-- Si pasa, el índice parcial no está haciendo su trabajo y el upsert duplicaría filas.
--
-- begin;
--   insert into public.budget_month_config (user_id, household_id, period_year, period_month)
--     select id, null, 2026, 8 from auth.users limit 1;
--   insert into public.budget_month_config (user_id, household_id, period_year, period_month)
--     select id, null, 2026, 8 from auth.users limit 1;  -- <- debe reventar
-- rollback;
