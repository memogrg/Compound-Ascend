-- ============================================================
-- 0021 · Fase 1 — puente ledger especializado ↔ transacción (ADITIVA)
-- ------------------------------------------------------------
-- El orquestador (registerLinkedTransaction) crea la transacción y el
-- registro especializado en la misma operación. Estas columnas guardan
-- el id de la transacción creada para poder limpiar/navegar con precisión
-- (sin heurísticas por fecha+monto). on delete set null: borrar la
-- transacción no borra el registro especializado.
--
-- Garantías: aditiva, no destructiva, idempotente (re-ejecutable).
-- RLS no cambia (columnas en tablas que ya tienen policies).
-- ============================================================

alter table public.debt_payments
  add column if not exists transaction_id uuid
    references public.transactions(id) on delete set null;

alter table public.dividends
  add column if not exists transaction_id uuid
    references public.transactions(id) on delete set null;

alter table public.rental_payments
  add column if not exists transaction_id uuid
    references public.transactions(id) on delete set null;

create index if not exists idx_debt_payments_txn on public.debt_payments(transaction_id);
create index if not exists idx_dividends_txn on public.dividends(transaction_id);
create index if not exists idx_rental_payments_txn on public.rental_payments(transaction_id);
