-- ============================================================
-- 20260730000001 · Preferencia personal: meses del fondo de paz
-- ============================================================
-- Aplicar manualmente (SQL Editor) y luego:
--   supabase migration repair --status applied 20260730000001
--
-- N × gasto esencial mensual dimensiona el fondo de paz. N lo elige el usuario (3-6, default 3).
-- Es PERSONAL (por usuario), no del hogar → vive en user_settings.
-- ============================================================

alter table public.user_settings
  add column if not exists peace_fund_months smallint not null default 3
    check (peace_fund_months between 3 and 6);
