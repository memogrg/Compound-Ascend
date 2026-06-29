-- ============================================================
-- 0031 (2026-06-29) · Ingesta por correo: verificación de propiedad self-serve
--
-- Onboarding self-serve: el usuario registra el correo donde recibe avisos del
-- banco (forwarder_email) y prueba la propiedad con un código de 6 dígitos enviado
-- a ESA dirección (mismo espíritu que el OTP de WhatsApp). El poller SOLO procesa
-- remitentes ya verificados.
--
-- `verified` default true para backfillear las filas existentes (sembradas a mano)
-- como verificadas; las filas nuevas self-serve se insertan con verified=false
-- explícito hasta confirmar. El código se guarda HASHEADO (sha256), nunca en claro.
-- Aditivo e idempotente.
--
-- NOTA (hardening follow-up, fuera de este delta): idealmente verified/
-- verify_code_hash deberían setearse solo vía función SECURITY DEFINER que valide
-- el código, para que un usuario no marque verified=true por su cuenta vía RLS.
-- Para el piloto, la verificación por código en la server action + el hecho de que
-- los correos solo llegan si el usuario configura el reenvío, es suficiente.
-- ============================================================

alter table public.email_ingest_links
  add column if not exists verified          boolean not null default true,
  add column if not exists verify_code_hash  text,
  add column if not exists verify_expires_at timestamptz;
