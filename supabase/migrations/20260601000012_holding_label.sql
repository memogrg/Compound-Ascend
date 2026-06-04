-- 0012 · label descriptivo en posiciones de inversión (no destructivo)
alter table public.investment_holdings
  add column if not exists label text;
