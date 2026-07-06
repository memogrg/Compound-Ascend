-- Historial de compras por holding (Opción A: reusar investment_transactions).
-- La tabla hoy linkea a `investments` (no usada); agregamos holding_id real.
alter table public.investment_transactions
  add column if not exists holding_id uuid
    references public.investment_holdings(id) on delete cascade;

create index if not exists idx_investment_tx_holding
  on public.investment_transactions (holding_id);
