-- 0014 · Dividendos: yield_pct, frequency, income_id (no destructivo)
alter table public.dividends
  add column if not exists yield_pct  numeric,
  add column if not exists frequency  text,
  add column if not exists income_id  uuid references public.income_sources(id) on delete set null;
