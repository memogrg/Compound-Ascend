-- ============================================================
-- 20260828000001 · Hilo de coaching persistente del asesor IA
--
-- Memoria LONGITUDINAL de la GUÍA del asesor, separada del chat efímero (ai_conversation_turns +
-- chat_messages se purgan a los CHAT_RETENTION_DAYS = 7 días → un check-in mensual no ve la guía del
-- mes pasado). Esta tabla NO se purga: guarda un resumen COMPACTO (prioridad + acción recomendada) por
-- turno de coaching sustantivo, para que el asesor HILE mes a mes ("el mes pasado enfocamos el fondo…").
-- El resumen se genera DETERMINISTA en la app (prioritySignal + acción resuelta), sin LLM ni fabricación.
-- RLS dueño. Aditivo e idempotente.
-- ============================================================

create table if not exists public.ai_coaching_thread (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  summary    text not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_ai_coaching_thread_user_created
  on public.ai_coaching_thread(user_id, created_at desc);

alter table public.ai_coaching_thread enable row level security;
alter table public.ai_coaching_thread force row level security;

-- Solo el dueño lee/escribe su hilo (paridad con ai_conversation_turns; el service-role bypassa RLS
-- y filtra SIEMPRE por user_id explícito).
create policy ai_coaching_sel on public.ai_coaching_thread
  for select using (user_id = auth.uid());
create policy ai_coaching_ins on public.ai_coaching_thread
  for insert with check (user_id = auth.uid());
create policy ai_coaching_del on public.ai_coaching_thread
  for delete using (user_id = auth.uid());
