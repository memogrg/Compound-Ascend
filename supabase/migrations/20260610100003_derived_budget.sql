-- ============================================================
-- 0023 · Fase 3 — plan derivado (ADITIVA)
-- ------------------------------------------------------------
-- syncDerivedBudget genera/actualiza líneas de budget_items a partir de
-- entidades (deudas, metas, pólizas, recurrentes, dividendos). Este índice
-- único parcial garantiza una sola línea derivada por entidad+periodo y hace
-- el sync idempotente ante carreras (dos cargas de página simultáneas).
--
-- Garantías: aditiva, no destructiva, idempotente. RLS no cambia.
-- ============================================================

create unique index if not exists uq_budget_items_derived
  on public.budget_items (user_id, period_year, period_month, source_kind, source_id)
  where source_kind <> 'manual' and source_id is not null;
