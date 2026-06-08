-- ============================================================
-- 0017 · Deudas — banco, tasa introductoria y recordatorios
-- ============================================================
-- No destructiva: solo agrega columnas. La RLS por user_id de debts ya existe
-- (migración 0005). El cron de recordatorios usa service-role.

alter table public.debts
  add column if not exists bank              text,        -- banco / acreedor (informativo)
  add column if not exists intro_fixed_months int,        -- meses a tasa fija inicial (intro)
  add column if not exists intro_apr         numeric(6,3),-- TAE fija inicial (%) durante intro
  add column if not exists last_reminded_on  date;        -- último día que se envió recordatorio
