-- ============================================================
-- 20260804000001 · Chat del asesor persistido por usuario (UI web + móvil)
--
-- El chat del cliente vivía en memoria (useState) → se perdía al minimizar, refrescar o cambiar
-- entre web y móvil. Esta tabla persiste la conversación del DÍA por usuario, para que el hilo
-- sobreviva y para poder enviar el TRANSCRIPT por correo.
--
-- PERSONAL (no del hogar): el chat es de quien pregunta, aunque las finanzas sean compartidas.
-- household_id queda como columna reservada (siempre null); la RLS es solo del DUEÑO — NO usa
-- apply_user_data_policies (que abre lectura a todo el hogar). Distinta de ai_conversation_turns,
-- que es la memoria rodante del LLM (ventana corta, ambos canales); esta es el log del día para UI.
-- El tope de crecimiento se acota en la app (corte "del día" + límite de filas leídas).
-- Aditivo e idempotente.
-- ============================================================

create table if not exists public.chat_messages (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users(id) on delete cascade,
  -- Reservada; el chat es personal, así que va siempre null (RLS por dueño, no por hogar).
  household_id uuid references public.households(id) on delete set null,
  role         text not null check (role in ('user', 'assistant')),
  content      text not null,
  created_at   timestamptz not null default now()
);

create index if not exists idx_chat_messages_user_created
  on public.chat_messages(user_id, created_at desc);

alter table public.chat_messages enable row level security;
alter table public.chat_messages force row level security;

-- RLS PERSONAL: solo el dueño lee/escribe sus mensajes (idempotente: drop antes de crear).
drop policy if exists chat_messages_sel on public.chat_messages;
drop policy if exists chat_messages_ins on public.chat_messages;
drop policy if exists chat_messages_upd on public.chat_messages;
drop policy if exists chat_messages_del on public.chat_messages;
create policy chat_messages_sel on public.chat_messages
  for select using (user_id = auth.uid());
create policy chat_messages_ins on public.chat_messages
  for insert with check (user_id = auth.uid());
create policy chat_messages_upd on public.chat_messages
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy chat_messages_del on public.chat_messages
  for delete using (user_id = auth.uid());
