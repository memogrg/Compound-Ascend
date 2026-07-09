-- budget_items.holding_id nació sin FK → huérfanos posibles al borrar un holding.
-- Este FK con ON DELETE CASCADE lo cierra: la DB borra lo vinculado y prohíbe
-- referencias colgadas. Idempotente.

-- 1) Limpiar holding_id COLGADOS (apuntan a un holding inexistente); si no, el FK falla.
delete from public.budget_items bi
where bi.holding_id is not null
  and not exists (select 1 from public.investment_holdings h where h.id = bi.holding_id);

-- 2) FK con ON DELETE CASCADE (hoy holding_id no tiene FK).
alter table public.budget_items
  drop constraint if exists budget_items_holding_id_fkey;
alter table public.budget_items
  add constraint budget_items_holding_id_fkey
  foreign key (holding_id) references public.investment_holdings(id) on delete cascade;
