-- ============================================================
-- 20260901000002 · Borrado de cuenta (#82) — compuerta OTP propia
--
-- El re-auth por OTP protege a un usuario real de un borrado accidental o de un
-- tercero con la sesión abierta. Los flujos nativos de Supabase no gatean acá
-- (reauthenticate()+updateUser({nonce}) es no-op con secure_password_change=false;
-- verifyOtp('reauthentication') es incompatible en esta versión de GoTrue).
--
-- Por eso: OTP propio. El código se genera y verifica en el server (hash + TTL +
-- tope de intentos); solo se guarda su HASH. Tabla service-role-only (RLS on,
-- sin políticas → anon/authenticated no acceden; el service-role bypassa RLS).
-- Se limpia sola al borrar el auth user (FK cascade).
--
-- Aplicación manual por SQL Editor; luego
--   supabase migration repair --status applied 20260901000002
-- ============================================================

create table if not exists public.account_deletion_otps (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  code_hash  text not null,
  expires_at timestamptz not null,
  attempts   int not null default 0,
  created_at timestamptz not null default now()
);

alter table public.account_deletion_otps enable row level security;
revoke all on public.account_deletion_otps from anon, authenticated;
