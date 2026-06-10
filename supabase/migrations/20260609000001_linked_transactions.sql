-- ============================================================
-- 0020 · Vínculo transacción↔entidad + plan derivado (Fase 0, ADITIVA)
-- ------------------------------------------------------------
-- Objetivo: preparar el schema para interconectar transacciones con
-- entidades del resto de la app (deudas, metas, inversiones, pólizas,
-- rentas) y para que los budget_items puedan derivarse de una fuente.
-- SOLO schema: cero cambios de lógica. La integridad del vínculo
-- polimórfico (linked_id / source_id) la garantizará el orquestador
-- en Fase 1 — por eso no llevan FK.
--
-- Garantías:
--   · Aditiva, no destructiva, idempotente (re-ejecutable).
--   · RLS no cambia: todas las columnas viven en tablas con policies.
-- ============================================================

-- ------------------------------------------------------------
-- 1) transactions: vínculo polimórfico + origen recurrente
-- ------------------------------------------------------------
alter table public.transactions
  add column if not exists linked_kind text not null default 'none'
    check (linked_kind in ('none', 'debt', 'goal', 'holding', 'policy', 'rental')),
  add column if not exists linked_id uuid,
  add column if not exists recurring_item_id uuid
    references public.recurring_items(id) on delete set null;

-- Índice parcial: solo las transacciones vinculadas (la gran mayoría no lo está).
create index if not exists idx_transactions_linked
  on public.transactions (user_id, linked_kind, linked_id)
  where linked_kind <> 'none';

-- ------------------------------------------------------------
-- 2) expense_categories: la categoría puede sugerir un vínculo
-- ------------------------------------------------------------
alter table public.expense_categories
  add column if not exists linked_kind text
    check (linked_kind in ('debt', 'goal', 'holding', 'policy', 'rental'));

-- ------------------------------------------------------------
-- 3) budget_items: fuente derivada (plan que nace de otra entidad)
-- ------------------------------------------------------------
alter table public.budget_items
  add column if not exists source_kind text not null default 'manual'
    check (source_kind in ('manual', 'debt', 'goal', 'policy', 'recurring', 'dividend')),
  add column if not exists source_id uuid;

create index if not exists idx_budget_items_source
  on public.budget_items (user_id, source_kind, source_id);

-- ------------------------------------------------------------
-- 4) Backfill best-effort sobre categorías de sistema.
--    Keys reales sembrados en 20260601000050_seed.sql /
--    20260605000004_transactions_revamp.sql:
--      · 'deudas'            → pagos de deuda          → 'debt'
--      · 'fondo_emergencia'  → ahorro (fondo)          → 'goal'
--      · 'fondo_paz'         → ahorro (fondo)          → 'goal'
--      · 'retiro'            → ahorro de largo plazo   → 'goal'
--    Solo filas aún sin linked_kind (idempotente, no pisa overrides).
-- ------------------------------------------------------------
update public.expense_categories
set linked_kind = 'debt', updated_at = now()
where is_system and key = 'deudas' and linked_kind is null;

update public.expense_categories
set linked_kind = 'goal', updated_at = now()
where is_system
  and key in ('fondo_emergencia', 'fondo_paz', 'retiro')
  and linked_kind is null;
