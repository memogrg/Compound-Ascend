-- ============================================================
-- 20260727000001 · Flag "esencial" para el número de seguridad
--
-- El usuario marca qué gastos son ESENCIALES (los que no podría dejar de pagar)
-- para calcular su "número de seguridad": el capital que, al 8%, ya cubre lo
-- indispensable. El flag va en las CUATRO fuentes que suman a ese gasto:
--   · expense_categories (sobres de gasto)
--   · debts              (cuotas de deuda)
--   · savings_goals      (aportes que son costos periódicos: marchamo, seguro…)
--   · insurance_policies (primas)
-- Las INVERSIONES NO llevan flag (decisión explícita): no son un costo de vivir.
--
-- is_essential es un eje ORTOGONAL a default_nature (propósito): un seguro es
-- 'proteccion' Y puede ser esencial. Por eso es un boolean propio, no un valor de
-- default_nature; y es uniforme en las 4 tablas (deudas/metas/pólizas no tienen
-- default_nature).
--
-- Backfill: en expense_categories, lo ya marcado default_nature='esencial'
-- arranca is_essential=true. Las otras tres nacen en false (el usuario las marca).
--
-- Aplicación manual por SQL Editor; luego
--   supabase migration repair --status applied 20260727000001
-- ============================================================

alter table public.expense_categories  add column if not exists is_essential boolean not null default false;
alter table public.debts               add column if not exists is_essential boolean not null default false;
alter table public.savings_goals       add column if not exists is_essential boolean not null default false;
alter table public.insurance_policies   add column if not exists is_essential boolean not null default false;

-- Bootstrap desde la señal que ya existía en los sobres.
update public.expense_categories
  set is_essential = true
  where default_nature = 'esencial' and is_essential = false;
