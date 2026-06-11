-- ============================================================
-- 0022 · Fase 2 — reglas que auto-vinculan (ADITIVA)
-- ------------------------------------------------------------
-- Una regla de transacción puede fijar, además de categoría/cuenta,
-- el vínculo a una entidad: la segunda vez que pagas "BAC" la
-- transacción nace vinculada a esa deuda sin taps extra.
--
-- Garantías: aditiva, no destructiva, idempotente. RLS no cambia.
-- ============================================================

alter table public.transaction_rules
  add column if not exists linked_kind text
    check (linked_kind in ('debt', 'goal', 'holding', 'policy', 'rental')),
  add column if not exists linked_id uuid;
