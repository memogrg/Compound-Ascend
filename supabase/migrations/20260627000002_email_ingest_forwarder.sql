-- ============================================================
-- 0028 (2026-06-27) · Ingesta por correo: identificar por forwarder_email
--
-- Cambio de estrategia de identificación. Antes: alias de destinatario con
-- plus-addressing (communications+<token>@dominio). Ahora: el usuario reenvía a
-- la dirección PLANA (communications@aitechumbrella.com) y se identifica por el
-- DESTINATARIO ORIGINAL del correo reenviado, que en auto-forward de Gmail viaja
-- en cabeceras (Delivered-To apiladas, X-Forwarded-For/To) y coincide con
-- email_ingest_links.forwarder_email.
--
-- ingest_alias queda OPCIONAL (legado); forwarder_email pasa a ser la llave de
-- match. Aditivo e idempotente.
-- ============================================================

alter table public.email_ingest_links alter column ingest_alias drop not null;

-- forwarder_email es ahora la llave de identificación: única por usuario.
-- (NULL no choca: Postgres trata los NULL como distintos en índices únicos.)
create unique index if not exists uq_email_ingest_links_forwarder
  on public.email_ingest_links(forwarder_email);
