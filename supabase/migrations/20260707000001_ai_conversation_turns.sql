-- ============================================================
-- 20260707000001 · Memoria conversacional unificada del asesor IA
--
-- Capa persistente por usuario que da memoria a AMBOS canales (chat web y WhatsApp). Reemplaza
-- el historial efímero del cliente web y le da historial a WhatsApp (que hoy no tiene). El
-- consumo de tokens se acota en la app (tope de turnos + ventana de tiempo). RLS dueño.
-- Aditivo e idempotente.
-- ============================================================

create table if not exists public.ai_conversation_turns (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  channel    text not null check (channel in ('web', 'whatsapp')),
  role       text not null check (role in ('user', 'assistant')),
  content    text not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_ai_conversation_turns_user_created
  on public.ai_conversation_turns(user_id, created_at desc);

alter table public.ai_conversation_turns enable row level security;
alter table public.ai_conversation_turns force row level security;

-- Solo el dueño lee/escribe sus turnos (el webhook usa service-role, que bypassa RLS y filtra
-- SIEMPRE por user_id explícito).
create policy ai_conv_sel on public.ai_conversation_turns
  for select using (user_id = auth.uid());
create policy ai_conv_ins on public.ai_conversation_turns
  for insert with check (user_id = auth.uid());
create policy ai_conv_upd on public.ai_conversation_turns
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy ai_conv_del on public.ai_conversation_turns
  for delete using (user_id = auth.uid());
