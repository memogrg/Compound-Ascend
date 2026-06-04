-- 0013 · broker del plan DCA en tabla investments (no destructivo)
alter table public.investments
  add column if not exists dca_broker text;
