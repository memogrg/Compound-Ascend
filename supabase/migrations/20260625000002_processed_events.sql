-- ============================================================
-- 0026 (2026-06-25) · Idempotencia de eventos entrantes (P0)
--
-- Los webhooks (Meta/WhatsApp, pagos) pueden reenviarse: sin deduplicación, un
-- reenvío re-dispara la IA / re-inserta movimientos. Esta tabla registra los
-- eventos ya procesados por (provider, event_id) para ignorar duplicados.
--
-- Solo el service-role escribe (los webhooks no tienen sesión de usuario).
-- enable+force RLS SIN políticas → deny-all a anon/authenticated (mismo patrón
-- que audit_logs / security_events). Aditivo e idempotente.
-- ============================================================

create table if not exists public.processed_events (
  provider     text not null,
  event_id     text not null,
  processed_at timestamptz not null default now(),
  primary key (provider, event_id)
);

alter table public.processed_events enable row level security;
alter table public.processed_events force row level security;

-- Sin políticas para anon/authenticated: la tabla queda deny-all para ellos.
-- El service-role omite RLS y es el único que inserta (desde los webhooks).
grant all on table public.processed_events to service_role;
revoke all on table public.processed_events from anon, authenticated;
