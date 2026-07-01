-- Permitir source_kind = 'rental' en budget_items.
-- El feature de ingreso de inversión (líneas derivadas 'rental') se envió sin
-- actualizar el CHECK, que solo admitía manual/debt/goal/policy/recurring/dividend.
-- Idempotente: drop-if-exists + re-add, seguro de re-correr.
alter table public.budget_items
  drop constraint if exists budget_items_source_kind_check;

alter table public.budget_items
  add constraint budget_items_source_kind_check
  check (source_kind in
    ('manual','debt','goal','policy','recurring','dividend','rental'));
