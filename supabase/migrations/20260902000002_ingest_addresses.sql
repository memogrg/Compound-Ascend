-- ============================================================
-- 2026-09-02 · Dirección de ingesta ÚNICA por cuenta
--
-- POR QUÉ. Hasta hoy todos los usuarios reenvían al MISMO buzón
-- (communications@aitechumbrella.com) y la app tiene que adivinar de quién es
-- cada correo leyendo cabeceras. Pero un correo lo escribe quien lo manda: sus
-- cabeceras son afirmaciones, no pruebas. De ahí salieron los tres P0 del
-- blindaje anterior.
--
-- La forma de dejar de adivinar es no tener que hacerlo: cada cuenta recibe su
-- propia dirección (u<token>@in.aitechumbrella.com) y el DESTINATARIO pasa a SER
-- la identidad. Google Workspace entrega todo el subdominio al mismo buzón
-- (regla de enrutamiento con catch-all) y estampa la dirección original en
-- `X-Gm-Original-To`, que es cabecera puesta por el RECEPTOR, no por el emisor.
--
-- Y como la dirección es un secreto de 50 bits que solo conoce su dueño, este
-- carril NO necesita el código de verificación: el usuario copia su dirección,
-- arma el reenvío y listo. `email_ingest_links` (dirección plana + OTP) sigue
-- existiendo como camino heredado.
--
-- NOTA: no es plus-addressing (communications+token@). Ya se probó: Google no
-- deja verificar alias con `+` como destino de reenvío, y varios formularios los
-- rechazan. Tienen que ser direcciones reales distintas.
--
-- Escritura SOLO desde el servidor, igual que email_ingest_links: si el cliente
-- pudiera escribir esta tabla, podría adjudicarse la dirección de otro.
-- Aditivo e idempotente.
-- ============================================================

create table if not exists public.ingest_addresses (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users(id) on delete cascade,
  household_id  uuid references public.households(id) on delete set null,
  address       citext not null,        -- u<token>@<dominio de ingesta>
  created_at    timestamptz not null default now(),
  revoked_at    timestamptz,            -- rotación: la vieja deja de resolver
  created_by    uuid,
  last_edited_by uuid
);

-- La dirección es la identidad: no puede repetirse jamás, ni siquiera revocada
-- (una dirección revocada no se reasigna a nadie más).
create unique index if not exists uq_ingest_addresses_address
  on public.ingest_addresses(address);
-- Una dirección viva por cuenta (hogar si existe, si no el usuario).
create unique index if not exists uq_ingest_addresses_cuenta_viva
  on public.ingest_addresses(coalesce(household_id, user_id))
  where revoked_at is null;
create index if not exists idx_ingest_addresses_user
  on public.ingest_addresses(user_id);

alter table public.ingest_addresses enable row level security;
alter table public.ingest_addresses force row level security;

-- El dueño y su hogar la ven (hay que poder copiarla desde la app). Nadie más.
create policy ia_sel on public.ingest_addresses
  for select using (
    user_id = auth.uid()
    or (household_id is not null and public.is_household_member(household_id))
  );

-- Sin policies de escritura: el alta y la rotación son del servidor (service-role).
revoke insert, update, delete on public.ingest_addresses from anon, authenticated;

-- Defensa en profundidad, misma lógica que email_ingest_links: aunque un
-- `grant all` futuro devolviera el privilegio, un rol del cliente no escribe.
-- Solo insert/update: el guard devuelve NEW, y en un BEFORE DELETE eso sería
-- NULL y cancelaría en silencio los borrados legítimos del servidor.
drop trigger if exists trg_ingest_addresses_guard on public.ingest_addresses;
create trigger trg_ingest_addresses_guard
  before insert or update on public.ingest_addresses
  for each row execute function public.email_ingest_guard();

comment on table public.ingest_addresses is
  'Dirección de ingesta única por cuenta. El destinatario ES la identidad: se resuelve por X-Gm-Original-To (cabecera del receptor), no por cabeceras que pone el emisor. Escritura solo desde el servidor.';
comment on column public.ingest_addresses.revoked_at is
  'Rotación: la dirección revocada deja de resolver y nunca se reasigna.';
