-- Retira el carril heredado de ingesta por correo: el "reenviador verificado"
-- (correo del usuario + código OTP) que existía cuando todos reenviaban al mismo
-- buzón. Desde 20260902000002 la identidad es la dirección de ingesta única por
-- cuenta (ingest_addresses); el poller ya no consulta esta tabla ni usa el From.
--
-- Regla del proyecto: la base nunca se adelanta al código. Aplicar DESPUÉS de
-- desplegar el código que deja de leer email_ingest_links (PR de esta migración).
--
-- La función email_ingest_guard() se conserva: la usan los triggers de
-- ingest_addresses e ingest_notices.

drop trigger if exists trg_email_ingest_guard on public.email_ingest_links;
drop table if exists public.email_ingest_links;
