-- ============================================================
-- 20260901203129 · #82 — cleanup_links_on_entity_delete a SECURITY DEFINER
--
-- El borrado de cuenta fallaba en el paso final. Al borrar el auth user, el cascade
-- de auth.users borra las filas de debts/savings_goals/investment_holdings/
-- insurance_policies; el trigger AFTER DELETE trg_cleanup_links (20260625000003)
-- corría como SECURITY INVOKER. Dentro de ese cascade el rol efectivo es
-- `supabase_auth_admin` (el rol de GoTrue), que NO tiene UPDATE sobre
-- transactions/budget_items → "permission denied" → abortaba admin.deleteUser y la
-- cuenta no se borraba.
--
-- Fix: la función a SECURITY DEFINER (corre como su dueño `postgres`, que sí puede
-- desvincular) + `set search_path = public, pg_temp` (hardening obligatorio en
-- SECURITY DEFINER: evita el secuestro del search_path). El CUERPO es idéntico al
-- original (los dos UPDATE de desvinculación). Los triggers ya existen y referencian
-- la función por nombre, así que basta CREATE OR REPLACE (no se recrean).
--
-- Auditoría (revisión de TODOS los triggers en `public`, tarea 2): el único trigger
-- AFTER DELETE que escribe cross-table es trg_cleanup_links (en esas 4 tablas). El
-- resto son BEFORE UPDATE (set_updated_at, protect_profile_plan) o AFTER
-- INSERT/UPDATE (cat_sin_gemelas) — no se disparan en el cascade de DELETE de
-- auth.users. No hay otros triggers INVOKER cross-table que arreglar.
--
-- Revoke de anon/authenticated/public por higiene (el trigger se dispara igual, no
-- depende de EXECUTE); solo service_role/postgres. Mismo criterio que #82.
--
-- Aplicado a prod manualmente; luego
--   supabase migration repair --status applied 20260901203129
-- ============================================================

create or replace function public.cleanup_links_on_entity_delete()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
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

revoke execute on function public.cleanup_links_on_entity_delete() from public, anon, authenticated;
grant execute on function public.cleanup_links_on_entity_delete() to service_role;
