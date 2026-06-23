-- 2026-06-23 · Aporte mensual separado en investment_holdings.
--
-- Hasta ahora el aporte recurrente (Aporto cada mes) se mezclaba con cost_basis:
-- para una posición recurrente, cost_basis representaba el monto mensual. Esta
-- columna lo separa explícitamente:
--   cost_basis           = total invertido a la fecha
--   monthly_contribution = aporte mensual del recurrente (NULL si no aplica)
--
-- Decisión de modelo (manual / independiente): el usuario captura ambos por
-- separado; no hay acumulación automática (cost_basis no crece solo).
alter table public.investment_holdings
  add column if not exists monthly_contribution numeric(18,2);
