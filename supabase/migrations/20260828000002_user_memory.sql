-- ============================================================
-- 20260828000002 · Memoria de HECHOS del usuario (user_memory)
--
-- Lo que la persona cuenta AL PASAR en el chat y espera que el asesor recuerde para siempre:
-- "mi esposa se llama Fernanda", "quiero mudarme a Escazú en 2027", "no toco el fondo de paz ni de
-- chiste". Hoy eso vive en chat_messages y lo borra la retención de 7 días.
--
-- COMPLEMENTA, no reemplaza:
--   · ai_coaching_thread  → lo que el ASESOR ya recomendó (la guía).
--   · perfil estructurado → lo que el usuario respondió en el cuestionario de ADN.
--   · FinancialContext    → las CIFRAS, siempre leídas en vivo.
-- Acá NO va nada de esas tres capas. En particular NADA financiero-numérico: una cifra memorizada
-- queda stale y el asesor la recitaría como verdad — eso es un bug de honestidad, no una feature.
--
-- PERSONAL, NO DEL HOGAR (a propósito y sin household_id): lo que me contó a mí en mi chat no lo ve
-- mi esposa en el suyo. RLS de DUEÑO estricto, las cuatro operaciones — el usuario es dueño de su
-- memoria y tiene que poder editarla y borrarla desde Ajustes.
--
-- Aplicación MANUAL (SQL Editor) + `supabase migration repair --status applied 20260828000002`.
-- Re-ejecutable: create if not exists + drop policy if exists.
-- ============================================================

create table if not exists public.user_memory (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  -- UNA frase, en las palabras del usuario. Se muestra tal cual en Ajustes y se inyecta tal cual
  -- al prompt: si no se puede leer y entender de un vistazo, no sirve como memoria.
  fact       text not null,
  category   text not null default 'otro'
             check (category in ('familia','meta_vida','preferencia','trabajo','salud','otro')),
  -- De dónde salió. Hoy siempre 'chat' (el extractor diario); queda abierto para orígenes futuros.
  source     text not null default 'chat',
  -- 'archivada' = el usuario la borró, la contradijo, o cayó por el tope. NO se borra la fila en el
  -- flujo automático: archivar es reversible y deja rastro; borrar de verdad es decisión del usuario.
  status     text not null default 'activa' check (status in ('activa','archivada')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- La consulta caliente es "los hechos ACTIVOS de este usuario" (inyección al contexto + Ajustes).
create index if not exists idx_user_memory_user_status
  on public.user_memory(user_id, status);

alter table public.user_memory enable row level security;
alter table public.user_memory force row level security;

drop policy if exists user_memory_sel on public.user_memory;
drop policy if exists user_memory_ins on public.user_memory;
drop policy if exists user_memory_upd on public.user_memory;
drop policy if exists user_memory_del on public.user_memory;

-- Dueño y nadie más. Sin cláusula de hogar: es la diferencia con el resto de las tablas de datos.
create policy user_memory_sel on public.user_memory
  for select using (user_id = auth.uid());
create policy user_memory_ins on public.user_memory
  for insert with check (user_id = auth.uid());
create policy user_memory_upd on public.user_memory
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy user_memory_del on public.user_memory
  for delete using (user_id = auth.uid());
