-- ============================================================
-- 0020 · Enrolamiento de WhatsApp por OTP (whatsapp_links)
--        El número que llega en un webhook es falsificable, así que el vínculo
--        número<->usuario SOLO se establece tras verificar un OTP que el usuario
--        envía desde la app. pending_action guarda confirmaciones (foto/texto).
-- ============================================================
create table public.whatsapp_links (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  household_id uuid references public.households(id) on delete set null,
  phone_e164 citext unique,                 -- null hasta verificar
  status text not null default 'pending' check (status in ('pending','active','revoked')),
  otp_code text,
  otp_expires_at timestamptz,
  pending_action jsonb,                      -- confirmación pendiente (gasto/ingreso)
  created_at timestamptz not null default now(),
  verified_at timestamptz,
  last_seen_at timestamptz,
  updated_at timestamptz not null default now()
);

-- Un vínculo por usuario (el upsert de generación de OTP usa esta llave).
create unique index uq_whatsapp_links_user on public.whatsapp_links(user_id);
create index idx_whatsapp_links_phone on public.whatsapp_links(phone_e164);
create index idx_whatsapp_links_otp on public.whatsapp_links(otp_code) where status = 'pending';

create trigger trg_whatsapp_links_updated before update on public.whatsapp_links
  for each row execute function public.set_updated_at();

-- ------------------------------------------------------------
-- RLS: cada usuario gestiona SOLO su propio vínculo desde la app. El webhook usa
-- el cliente service-role (omite RLS) y solo tras verificar el OTP.
-- ------------------------------------------------------------
alter table public.whatsapp_links enable row level security;
alter table public.whatsapp_links force row level security;

create policy wal_select on public.whatsapp_links
  for select using (user_id = auth.uid());
create policy wal_insert on public.whatsapp_links
  for insert with check (user_id = auth.uid());
create policy wal_update on public.whatsapp_links
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy wal_delete on public.whatsapp_links
  for delete using (user_id = auth.uid());
