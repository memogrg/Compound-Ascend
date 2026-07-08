-- ============================================================
-- 20260713000002 · Backfill: comparte las categorías propias existentes con el hogar
--
-- Antes de esta feature, cada categoría custom (is_system=false) era visible solo
-- a su creador (household_id null). Para que el hogar comparta un árbol coherente,
-- se les asigna el household_id del HOGAR ACTIVO de su creador.
--
-- Criterio del hogar activo = EXACTAMENTE el de getActiveHouseholdId
-- (src/lib/household/active.ts): entre las membresías 'active' del usuario, la de
-- rol 'owner' primero; si no hay owner, la más antigua por created_at. Incluye
-- miembros no-owner. Los usuarios SIN hogar (modo solo) no se tocan.
--
-- Aditiva e idempotente: solo actualiza filas custom con household_id null; una
-- segunda corrida no cambia nada. NO toca las de sistema.
--
-- Aplicación: manual por SQL Editor DESPUÉS de 20260713000001; luego
--   supabase migration repair --status applied 20260713000002
-- ============================================================

with active_hh as (
  -- Un hogar activo por usuario, con el mismo desempate que getActiveHouseholdId.
  select distinct on (hm.user_id)
    hm.user_id,
    hm.household_id
  from public.household_members hm
  where hm.status = 'active'
  order by
    hm.user_id,
    (case when hm.role = 'owner' then 0 else 1 end),  -- owner primero
    hm.created_at asc                                 -- si no, el más antiguo
)
update public.expense_categories ec
set household_id = ah.household_id
from active_hh ah
where ec.user_id = ah.user_id
  and ec.is_system = false
  and ec.household_id is null;
