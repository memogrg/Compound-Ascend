-- ============================================================
-- 0027 (2026-06-27) · Ingesta por correo (IMAP)
--
-- Dos tablas para la fuente de ingesta por email (el usuario reenvía sus correos
-- de banco a un buzón de ingesta; un poller los lee por IMAP):
--
--   1) email_ingest_links  — allowlist: mapea el ALIAS de ingesta (destinatario
--      con plus-addressing, communications+<token>@dominio) -> usuario. Con
--      auto-forward de Gmail el From es del banco, así que se identifica por el
--      destinatario. SOLO se procesan alias presentes aquí (lo demás se ignora).
--   2) ingest_proposals    — cola de propuestas por confirmar. El poller (service-
--      role) inserta en 'pending'; el usuario las confirma/descarta (Delta 2).
--      Índice único (household_id, external_ref) para no duplicar el mismo
--      movimiento si el correo se reenvía dos veces.
--
-- RLS estándar dueño + hogar (mismas expresiones que apply_user_data_policies,
-- pero escritas a mano: estas tablas NO llevan updated_at, así que no se instala
-- el trigger set_updated_at). Los grants a anon/authenticated/service_role los
-- cubre alter default privileges (migración 0020). Aditivo e idempotente.
-- ============================================================

-- ------------------------------------------------------------
-- 1) email_ingest_links — allowlist alias de destinatario -> usuario
-- ------------------------------------------------------------
create table if not exists public.email_ingest_links (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users(id) on delete cascade,
  household_id    uuid references public.households(id) on delete set null,
  ingest_alias    citext not null,        -- communications+<token>@dominio (destinatario)
  forwarder_email citext,                 -- informativo: correo personal del usuario
  created_at      timestamptz not null default now()
);

-- El alias de ingesta (plus-addressing) mapea a un solo usuario. Con auto-forward
-- el From es del banco, así que se identifica por el DESTINATARIO, no el remitente.
create unique index if not exists uq_email_ingest_links_alias
  on public.email_ingest_links(ingest_alias);
create index if not exists idx_email_ingest_links_user
  on public.email_ingest_links(user_id);

alter table public.email_ingest_links enable row level security;
alter table public.email_ingest_links force row level security;

-- El usuario gestiona su propia allowlist desde la app (Delta 2). El hogar la ve.
create policy eil_sel on public.email_ingest_links
  for select using (
    user_id = auth.uid()
    or (household_id is not null and public.is_household_member(household_id))
  );
create policy eil_ins on public.email_ingest_links
  for insert with check (user_id = auth.uid());
create policy eil_upd on public.email_ingest_links
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy eil_del on public.email_ingest_links
  for delete using (user_id = auth.uid());

-- ------------------------------------------------------------
-- 2) ingest_proposals — cola de propuestas por confirmar
-- ------------------------------------------------------------
create table if not exists public.ingest_proposals (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users(id) on delete cascade,
  household_id uuid references public.households(id) on delete set null,
  kind         text not null check (kind in ('gasto','ingreso')),
  amount       numeric(18,2) not null check (amount > 0),
  currency     text not null,
  occurred_on  date not null,
  merchant     text,
  description  text not null default '',
  bank_code    text,
  external_ref text,
  source_kind  text not null,
  confidence   numeric(3,2) not null default 0,
  status       text not null default 'pending' check (status in ('pending','confirmed','discarded')),
  raw_text     text,
  created_at   timestamptz not null default now()
);

-- Idempotencia de propuestas: el mismo movimiento (por external_ref) no se
-- propone dos veces en el mismo hogar. Nota: external_ref NULL no choca (Postgres
-- trata los NULL como distintos); los movimientos sin ref se revisan a mano.
create unique index if not exists uq_ingest_proposals_extref
  on public.ingest_proposals(household_id, external_ref);
create index if not exists idx_ingest_proposals_user
  on public.ingest_proposals(user_id, status);

alter table public.ingest_proposals enable row level security;
alter table public.ingest_proposals force row level security;

-- Lectura/gestión: dueño + hogar. SIN policy de insert para usuarios: solo el
-- poller (service-role, omite RLS) crea propuestas. El usuario las confirma o
-- descarta (update) en Delta 2.
create policy ip_sel on public.ingest_proposals
  for select using (
    user_id = auth.uid()
    or (household_id is not null and public.is_household_member(household_id))
  );
create policy ip_upd on public.ingest_proposals
  for update using (
    user_id = auth.uid()
    or (household_id is not null and public.is_household_editor(household_id))
  ) with check (
    user_id = auth.uid()
    or (household_id is not null and public.is_household_editor(household_id))
  );
create policy ip_del on public.ingest_proposals
  for delete using (
    user_id = auth.uid()
    or (household_id is not null and public.is_household_editor(household_id))
  );
