-- ============================================================
-- Inmueble de renta — deuda ligada (C-1b)
-- ============================================================
-- Vincula una posición (inmueble) con la deuda que la financia (hipoteca),
-- para descontar la cuota mensual del flujo neto. Enlace estructural directo
-- (FK), no vía linked_kind/linked_id (eso es para transacciones).
-- on delete set null: borrar la deuda solo desvincula, no borra el inmueble.

alter table public.investment_holdings
  add column if not exists debt_id uuid references public.debts(id) on delete set null;

create index if not exists idx_investment_holdings_debt
  on public.investment_holdings(user_id, debt_id)
  where debt_id is not null;
