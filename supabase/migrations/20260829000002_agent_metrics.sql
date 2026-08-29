-- ============================================================
-- 20260829000002 · Tablero de calidad del agente
--
-- Tres piezas para poder MEDIR al asesor de forma continua, no en corridas sueltas:
--
--  1. ai_events acepta tres eventos nuevos ('guard', 'action', 'provider_error') y los 'lane'
--     pasan a llevar `ms`. Todo lo que hoy se pierde en console.log (los guards distinguen la
--     causa desde siempre, pero los runtime logs de Vercel duran horas) queda durable.
--  2. agent_metrics: el ROLLUP DIARIO. ai_events crece por turno; el tablero pregunta por DÍA,
--     y sin rollup cada consulta escanearía millones de filas. Una fila por día, idempotente.
--  3. agent_audit_runs: el score de cada corrida del banco de ~130 preguntas, para comparar
--     contra la corrida anterior (mejoró/empeoró) en vez de mirar un número suelto.
--
-- PRIVACIDAD: igual que ai_events, acá NO entra contenido. Conteos, duraciones y banderas.
-- ESCRITURA: service-role. agent_metrics y agent_audit_runs NO son datos de usuario (son del
-- producto), así que no llevan user_id y no tienen políticas para 'authenticated': se leen por
-- la ruta admin con CRON_SECRET, nunca desde el cliente.
--
-- Aplicación MANUAL (SQL Editor) + `supabase migration repair --status applied 20260829000002`.
-- Aditiva, idempotente y re-ejecutable.
-- ============================================================

-- ------------------------------------------------------------
-- 1) ai_events: eventos nuevos + latencia del carril
-- ------------------------------------------------------------
-- El check viejo solo permitía ('tool','lane'). Se reemplaza (drop + add) porque alter no admite
-- modificar un check en el lugar. El nombre es el mismo que puso el create table original.
alter table public.ai_events drop constraint if exists ai_events_event_check;
alter table public.ai_events
  add constraint ai_events_event_check
  check (event in ('tool', 'lane', 'guard', 'action', 'provider_error'));

-- `ms` ya existía (duración de la herramienta); ahora también lo llevan los 'lane' = latencia del
-- turno completo. `name` lleva la causa del guard / el tipo de acción / la razón del fallo.
comment on column public.ai_events.ms is
  'Duración en ms. En ''tool'' = la herramienta; en ''lane'' = el turno completo (latencia).';
comment on column public.ai_events.name is
  'tool → nombre de la herramienta · lane → carril · guard → causa · action → tipo · provider_error → razón';

-- El tablero agrega por (event, name, día): este índice lo hace barato sin tocar el de usuario.
create index if not exists idx_ai_events_created_event
  on public.ai_events(created_at desc, event);

-- ------------------------------------------------------------
-- 2) agent_metrics — rollup diario
-- ------------------------------------------------------------
create table if not exists public.agent_metrics (
  -- El día en hora de Costa Rica (la app es es-CR): un "día" del tablero tiene que coincidir con
  -- el día que vivió el usuario, no con el corte UTC.
  day                date primary key,
  turnos             int not null default 0,
  -- Cobertura del router: cuántos turnos resolvió una plantilla/carril barato vs el LLM.
  turnos_det         int not null default 0,
  turnos_llm         int not null default 0,
  -- Guards: total y desglose por causa ({movimientos, tendencia, deuda_fantasma, ...}).
  guards_total       int not null default 0,
  guards             jsonb not null default '{}'::jsonb,
  -- Latencia global y por carril ({template:{p50,p95,n}, ...}). Los percentiles se calculan en la
  -- app (motor puro y testeable) y se guardan ya resueltos: recalcularlos en SQL cada consulta
  -- volvería a escanear los eventos crudos, que es justo lo que este rollup evita.
  lat_p50            int,
  lat_p95            int,
  lat_por_carril     jsonb not null default '{}'::jsonb,
  tokens_in          bigint not null default 0,
  tokens_out         bigint not null default 0,
  -- Costo ESTIMADO en USD (precio por modelo × tokens). Estimado y dicho así: el precio real lo
  -- factura el proveedor, esto sirve para ver la tendencia y detectar un salto.
  costo_usd          numeric(12, 4) not null default 0,
  acciones_propuestas  int not null default 0,
  acciones_confirmadas int not null default 0,
  -- Fallos del proveedor por causa REAL ({timeout, http_429, http_5xx, http_402, network, ...}).
  provider_errors    jsonb not null default '{}'::jsonb,
  usuarios           int not null default 0,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

alter table public.agent_metrics enable row level security;
alter table public.agent_metrics force row level security;
-- Sin políticas: nadie lo lee con la anon key. El service-role bypassa RLS y es el único camino
-- (la ruta admin, con CRON_SECRET). Son métricas del PRODUCTO, no datos de un usuario.

-- ------------------------------------------------------------
-- 3) agent_audit_runs — el banco de preguntas, corrida a corrida
-- ------------------------------------------------------------
create table if not exists public.agent_audit_runs (
  id            uuid primary key default gen_random_uuid(),
  -- Marca de la corrida (la misma que nombra el reporte HTML/JSON en scripts/out/).
  stamp         text not null unique,
  -- 'ci-weekly' | 'manual' | … De dónde salió la corrida.
  origen        text not null default 'manual',
  total         int not null,
  pass          int not null,
  -- 0..100. Es el número que se compara entre corridas.
  score         numeric(5, 2) not null,
  -- Promedio 1-5 de cada eje del juez: {answered, concise, currency_ok, no_hallucination, advisor_tone}.
  juez          jsonb not null default '{}'::jsonb,
  -- Conteo por tipo de falla ({moneda: 3, culpa: 1, ...}) para ver QUÉ empeoró, no solo que empeoró.
  fallas        jsonb not null default '{}'::jsonb,
  -- Fails por FRASE DE CULPA. Se guarda aparte del resto: es la regla no negociable del producto
  -- (el asesor no regaña), así que tiene que poder mirarse sin abrir el desglose.
  fails_culpa   int not null default 0,
  lat_p50       int,
  lat_p95       int,
  modelo        text,
  created_at    timestamptz not null default now()
);

create index if not exists idx_agent_audit_runs_created
  on public.agent_audit_runs(created_at desc);

alter table public.agent_audit_runs enable row level security;
alter table public.agent_audit_runs force row level security;
-- Sin políticas, igual que agent_metrics: solo service-role.
