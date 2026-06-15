-- Ingresos (Fase 2 · recibido parcial): vincula cada transacción de ingreso
-- recibida a su FUENTE (línea budget_items income). La barra buffer "Recibido"
-- se llena con sum(confirmadas vinculadas) ÷ planificado. Aditivo e idempotente.

alter table public.transactions
  add column if not exists income_source_id uuid
    references public.budget_items(id) on delete set null;

-- Lookup de lo recibido por fuente (getRealTotals · barra buffer).
create index if not exists idx_transactions_income_source
  on public.transactions (income_source_id)
  where income_source_id is not null;
