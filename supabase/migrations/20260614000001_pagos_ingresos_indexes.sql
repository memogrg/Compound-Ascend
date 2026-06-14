-- Perf: índices compuestos para el detalle de deuda y el filtro por hogar del
-- periodo. Aditivo e idempotente (no destructivo).

-- Detalle de deuda: lista los pagos de una deuda ordenados por fecha
-- (listDebtPayments: where debt_id = ? order by occurred_on). El índice
-- existente idx_debt_payments_debt cubre solo debt_id; este lo extiende.
create index if not exists idx_debt_payments_debt_occurred
  on public.debt_payments (debt_id, occurred_on);

-- Transacciones del periodo filtradas por hogar (RLS por household_id). El
-- índice por user_id ya existe (idx_transactions_user_occurred); este sirve a
-- las lecturas que scopean por household.
create index if not exists idx_transactions_household_occurred
  on public.transactions (household_id, occurred_on desc);
