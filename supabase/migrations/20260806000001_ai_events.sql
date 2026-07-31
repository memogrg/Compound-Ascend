-- ============================================================
-- 20260806000001 · Eventos de IA (observabilidad durable)
--
-- Los carriles y las herramientas ya se miden (logger.info "assistant.tool" / "assistant.chat.lane"),
-- pero eso va a console.log y los runtime logs de Vercel se retienen 1 hora (Hobby) o 1 día (Pro):
-- los números se pierden antes de poder leerlos. El PRIMER MES de uso real es el más informativo y
-- es justo el que se perdería. Esta tabla los hace durar. No cambia QUÉ se mide.
--
-- PRIVACIDAD: acá NO entra contenido. Ni el mensaje del usuario, ni la respuesta, ni el resumen
-- redactado. Solo métricas: identificadores, duraciones, conteos y banderas. `reply_len` y
-- `resumen_len` son LARGOS (un entero), no texto.
--
-- ESCRITURA: service-role (omite RLS), como ai_usage_ledger. El usuario solo LEE lo suyo — sin
-- políticas de insert/update/delete para 'authenticated', para que no pueda fabricar ni borrar su
-- propia telemetría. Aditiva e idempotente.
-- ============================================================

create table if not exists public.ai_events (
  id          bigint generated always as identity primary key,
  user_id     uuid not null references auth.users(id) on delete cascade,
  -- 'tool' = se invocó una herramienta; 'lane' = terminó un turno de chat.
  event       text not null check (event in ('tool', 'lane')),
  -- Nombre de la herramienta, o el carril que resolvió (template/lite/deep/reasoning).
  name        text,
  ms          int,     -- duración de la herramienta (solo en 'tool')
  ok          boolean, -- la herramienta no devolvió error (solo en 'tool')
  tokens_in   int,
  tokens_out  int,
  reply_len   int,     -- largo del reply final (solo en 'lane')
  resumen_len int,     -- largo del bloque ya redactado que devolvió la herramienta (solo en 'tool')
  created_at  timestamptz not null default now()
);

create index if not exists idx_ai_events_user_created
  on public.ai_events(user_id, created_at desc);
-- El que hace baratas las consultas de "cuántas veces se usó X y cuánto tardó".
create index if not exists idx_ai_events_name_created
  on public.ai_events(event, name, created_at desc);

alter table public.ai_events enable row level security;
alter table public.ai_events force row level security;

-- SOLO LECTURA para el usuario (idempotente: drop antes de crear). La escritura es del backend.
drop policy if exists ai_events_select_own on public.ai_events;
create policy ai_events_select_own on public.ai_events
  for select using (user_id = auth.uid());
-- (sin políticas de insert/update/delete para 'authenticated')
