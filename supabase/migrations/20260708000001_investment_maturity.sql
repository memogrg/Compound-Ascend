-- Fecha de vencimiento para renta fija con pago único (al_vencimiento).
alter table public.investment_holdings
  add column if not exists maturity_date date;
