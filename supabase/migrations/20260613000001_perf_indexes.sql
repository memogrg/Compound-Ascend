-- Perf (revisión F4 · auditoría §3): índices compuestos para los filtros más
-- calientes. Aditivo e idempotente.
-- transacciones del mes: user_id + occurred_on between
create index if not exists idx_transactions_user_occurred
  on public.transactions (user_id, occurred_on desc);
-- presupuesto del periodo: user_id + period
create index if not exists idx_budget_items_user_period
  on public.budget_items (user_id, period_year, period_month);
