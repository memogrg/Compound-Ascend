-- % rendimiento anual para renta fija (bono/CDP). Informativo + cálculo del pago.
alter table public.investment_holdings
  add column if not exists annual_rate_pct numeric;
