-- ============================================================
-- 2026-09-04 · Avisos de la ingesta por correo
--
-- Dos cosas que hasta hoy desaparecían en silencio cuando un correo llegaba con
-- dueño pero ningún parser lo entendía (el poller lo marcaba leído y listo):
--
--   1) gmail_forwarding — la confirmación que Gmail manda cuando el usuario
--      configura el reenvío ("Gmail Forwarding Confirmation", de
--      forwarding-noreply@google.com). Llega a la dirección de ingesta del propio
--      usuario, así que se resuelve por X-Gm-Original-To. NO se puede
--      auto-confirmar desde el servidor (el enlace abre una pantalla con botón),
--      pero SÍ se le puede mostrar al usuario dentro de la app: «Confirmá el
--      reenvío» y un clic. Sin esto, el usuario de Gmail se queda a mitad de
--      camino sin saber por qué.
--   2) unparsed — un aviso de un banco que todavía no sabemos leer (hoy solo hay
--      parser de BAC). Se guarda el remitente, el asunto y un recorte del texto:
--      es la cola de trabajo para escribir los parsers de BNCR, BCR y los demás,
--      y es lo que permite decirle al usuario «lo recibimos, estamos en eso».
--
-- Escritura solo desde el servidor (mismo criterio que ingest_addresses):
-- las inserta el poller con service-role; el usuario solo las lee y las marca
-- resueltas a través de una server action. Aditivo e idempotente.
-- ============================================================

create table if not exists public.ingest_notices (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references auth.users(id) on delete cascade,
  household_id   uuid references public.households(id) on delete set null,
  kind           text not null check (kind in ('gmail_forwarding', 'unparsed')),
  from_address   citext,
  subject        text,
  snippet        text,          -- recorte del cuerpo (máx. ~4000 chars), para escribir parsers
  confirm_url    text,          -- gmail_forwarding: el enlace vf- de confirmación
  confirm_code   text,          -- gmail_forwarding: el código numérico, si vino
  message_id     text,          -- idempotencia por correo
  created_at     timestamptz not null default now(),
  resolved_at    timestamptz,   -- el usuario lo dio por atendido
  created_by     uuid,
  last_edited_by uuid
);

create unique index if not exists uq_ingest_notices_message
  on public.ingest_notices(message_id) where message_id is not null;
create index if not exists idx_ingest_notices_user_open
  on public.ingest_notices(user_id) where resolved_at is null;

alter table public.ingest_notices enable row level security;
alter table public.ingest_notices force row level security;

drop policy if exists ino_sel on public.ingest_notices;
create policy ino_sel on public.ingest_notices
  for select using (
    user_id = auth.uid()
    or (household_id is not null and public.is_household_member(household_id))
  );

revoke insert, update, delete on public.ingest_notices from anon, authenticated;

drop trigger if exists trg_ingest_notices_guard on public.ingest_notices;
create trigger trg_ingest_notices_guard
  before insert or update on public.ingest_notices
  for each row execute function public.email_ingest_guard();

comment on table public.ingest_notices is
  'Avisos de la ingesta por correo: la confirmación de reenvío de Gmail (para mostrarla en la app) y los correos de banco que aún no tienen parser (cola de trabajo). Escritura solo desde el servidor.';
