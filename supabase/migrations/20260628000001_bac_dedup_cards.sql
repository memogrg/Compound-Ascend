-- ============================================================
-- 0029 (2026-06-28) · Ingesta BAC: dedup por cuenta+referencia, card_last4 y
--                     tabla de tarjetas por cuenta (etiquetado por último-4)
--
-- (a) La misma compra puede llegar a 2 correos (auto-forward + reenvío manual).
--     El dedup pasa a ser por (cuenta, referencia), donde cuenta = el hogar si
--     existe, si no el usuario. Reemplaza el índice (household_id, external_ref).
-- (b) ingest_proposals.card_last4: últimos 4 de la tarjeta (etiqueta, no llave).
-- (c) account_cards: tarjetas por cuenta. last4 etiqueta DENTRO de la cuenta (no
--     es llave de propiedad ni única global): único por (cuenta, last4). La
--     propiedad correo→cuenta ya vive en email_ingest_links.
--
-- RLS dueño + hogar (mismas expresiones que email_ingest_links). Migración
-- aditiva e idempotente. La aplico yo en el SQL Editor.
-- ============================================================

-- (a) Dedup por cuenta + referencia ---------------------------------------
drop index if exists public.uq_ingest_proposals_extref;

create unique index if not exists uq_ingest_proposals_account_ref
  on public.ingest_proposals ((coalesce(household_id, user_id)), external_ref)
  where external_ref is not null;

-- (b) Último-4 de la tarjeta en la propuesta ------------------------------
alter table public.ingest_proposals add column if not exists card_last4 text;

-- (c) Tarjetas por cuenta -------------------------------------------------
create table if not exists public.account_cards (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users(id) on delete cascade,
  household_id uuid references public.households(id) on delete set null,
  last4        text not null check (last4 ~ '^[0-9]{4}$'),
  label        text not null,
  holder_name  text,
  created_at   timestamptz not null default now()
);

-- Una etiqueta por (cuenta, último-4). cuenta = hogar si existe, si no usuario.
create unique index if not exists uq_account_cards_account_last4
  on public.account_cards ((coalesce(household_id, user_id)), last4);
create index if not exists idx_account_cards_user
  on public.account_cards(user_id);

alter table public.account_cards enable row level security;
alter table public.account_cards force row level security;

-- Lectura: dueño + miembro del hogar. Escritura: dueño o editor del hogar.
create policy ac_sel on public.account_cards
  for select using (
    user_id = auth.uid()
    or (household_id is not null and public.is_household_member(household_id))
  );
create policy ac_ins on public.account_cards
  for insert with check (
    user_id = auth.uid()
    or (household_id is not null and public.is_household_editor(household_id))
  );
create policy ac_upd on public.account_cards
  for update using (
    user_id = auth.uid()
    or (household_id is not null and public.is_household_editor(household_id))
  ) with check (
    user_id = auth.uid()
    or (household_id is not null and public.is_household_editor(household_id))
  );
create policy ac_del on public.account_cards
  for delete using (
    user_id = auth.uid()
    or (household_id is not null and public.is_household_editor(household_id))
  );
