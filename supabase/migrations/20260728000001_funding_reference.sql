-- ============================================================
-- 20260728000001 · Referencia de fondeo ("dónde está el dinero")
--
-- Texto libre, INFORMATIVO, para anotar dónde vive la plata (banco, nº de cuenta:
-- "BAC ···1234"). No entra en ningún cálculo.
--
--   · insurance_policies → columna NUEVA `funding_reference` (no existía nada).
--   · savings_goals      → NO se agrega columna: se REUSA la existente `stored_in`
--     (mismo concepto "dónde está el ahorro"; ya la lee savingsLiquidity para la
--     liquidez de Rich Life). Un solo campo, sin duplicar. Por eso esta migración
--     solo toca insurance_policies.
--   · debts ya tiene `bank`; no se toca.
--
-- Es dato del hogar: viaja con user_id/household_id de la fila (RLS por fila ya lo
-- cubre; una columna nueva en tabla compartida no necesita política aparte).
--
-- Aplicación manual por SQL Editor; luego
--   supabase migration repair --status applied 20260728000001
-- ============================================================

alter table public.insurance_policies
  add column if not exists funding_reference text;
