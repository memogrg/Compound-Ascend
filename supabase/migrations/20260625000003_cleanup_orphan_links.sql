-- ============================================================
-- 0027 (2026-06-25) · Limpieza de vínculos huérfanos (P1-6)
--
-- `transactions.linked_id` y `budget_items.source_id` son polimórficos SIN FK
-- (decisión de diseño). Al borrar una deuda/meta/inversión/póliza, esas filas
-- quedaban apuntando a un UUID muerto (puntero huérfano).
--
-- Solución: trigger AFTER DELETE en cada tabla vinculable que DESVINCULA las
-- filas que la referenciaban (las transacciones/líneas de presupuesto NO se
-- borran — el movimiento siguió ocurriendo —, solo pierden el vínculo).
--
-- Como los UUID son globalmente únicos, basta con `linked_id = OLD.id` (no hace
-- falta filtrar por tipo: un id de deuda nunca coincide con uno de inversión).
-- Se filtra además por `user_id` para aprovechar los índices existentes.
--
-- SECURITY INVOKER (default): el UPDATE corre con los permisos de quien borra;
-- las filas son del mismo usuario, así que RLS las permite. Aditivo/idempotente.
-- ============================================================

create or replace function public.cleanup_links_on_entity_delete()
returns trigger
language plpgsql
as $$
begin
  -- Desvincula las transacciones que apuntaban a la entidad borrada.
  update public.transactions
  set linked_kind = 'none', linked_id = null, updated_at = now()
  where user_id = OLD.user_id and linked_id = OLD.id and linked_kind <> 'none';

  -- Desvincula las líneas de presupuesto derivadas de la entidad.
  update public.budget_items
  set source_kind = 'manual', source_id = null, updated_at = now()
  where user_id = OLD.user_id and source_id = OLD.id and source_kind <> 'manual';

  return OLD;
end;
$$;

-- Triggers en cada tabla vinculable (holding y rental viven en investment_holdings).
drop trigger if exists trg_cleanup_links on public.debts;
create trigger trg_cleanup_links after delete on public.debts
  for each row execute function public.cleanup_links_on_entity_delete();

drop trigger if exists trg_cleanup_links on public.savings_goals;
create trigger trg_cleanup_links after delete on public.savings_goals
  for each row execute function public.cleanup_links_on_entity_delete();

drop trigger if exists trg_cleanup_links on public.investment_holdings;
create trigger trg_cleanup_links after delete on public.investment_holdings
  for each row execute function public.cleanup_links_on_entity_delete();

drop trigger if exists trg_cleanup_links on public.insurance_policies;
create trigger trg_cleanup_links after delete on public.insurance_policies
  for each row execute function public.cleanup_links_on_entity_delete();

-- ------------------------------------------------------------
-- Backfill: limpia huérfanos que YA existan (puntero a entidad borrada antes
-- de este trigger). Idempotente.
-- ------------------------------------------------------------
update public.transactions t
set linked_kind = 'none', linked_id = null, updated_at = now()
where linked_id is not null
  and linked_kind <> 'none'
  and not exists (
    select 1 from public.debts d                where d.id = t.linked_id
    union all select 1 from public.savings_goals g        where g.id = t.linked_id
    union all select 1 from public.investment_holdings h  where h.id = t.linked_id
    union all select 1 from public.insurance_policies p   where p.id = t.linked_id
  );

update public.budget_items b
set source_kind = 'manual', source_id = null, updated_at = now()
where source_id is not null
  and source_kind in ('debt', 'goal', 'policy')
  and not exists (
    select 1 from public.debts d              where d.id = b.source_id
    union all select 1 from public.savings_goals g      where g.id = b.source_id
    union all select 1 from public.insurance_policies p where p.id = b.source_id
  );
