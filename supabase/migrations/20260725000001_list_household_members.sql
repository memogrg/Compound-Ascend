-- ============================================================
-- 20260725000001 · list_household_members(): miembros del hogar con su email
--
-- La pantalla "Miembros del hogar" (Configuración) necesita mostrar el email de
-- cada miembro. Pero:
--   · profiles RLS es `id = auth.uid()` → un miembro no puede leer a otro.
--   · el email vive en auth.users, no en profiles.
--   · el service-role está prohibido en requests de usuario (CLAUDE.md).
--
-- Esta función SECURITY DEFINER resuelve el email del hogar del que llama, sin
-- exponer nada de otros hogares — mismo patrón que get_household_profile /
-- get_invitation_by_token. Devuelve los miembros NO removidos del hogar ACTIVO
-- del llamador (owner primero, luego por antigüedad, igual que getActiveHouseholdId).
--
-- Aplicación manual por SQL Editor; luego
--   supabase migration repair --status applied 20260725000001
-- ============================================================

create or replace function public.list_household_members()
returns table (
  user_id uuid,
  email text,
  role text,
  status text,
  joined_at timestamptz
)
language plpgsql
security definer
stable
set search_path = public
as $$
declare
  hid uuid;
begin
  if auth.uid() is null then
    return;
  end if;

  -- Hogar activo del que llama (mismo desempate que getActiveHouseholdId).
  select hm.household_id into hid
  from public.household_members hm
  where hm.user_id = auth.uid() and hm.status = 'active'
  order by case when hm.role = 'owner' then 0 else 1 end, hm.created_at
  limit 1;

  if hid is null then
    return; -- sin hogar activo: nada que listar
  end if;

  return query
    select m.user_id, u.email::text, m.role, m.status, m.created_at
    from public.household_members m
    join auth.users u on u.id = m.user_id
    where m.household_id = hid
      and m.status <> 'removed'   -- los removidos quedan de rastro, no se listan
    order by (case when m.role = 'owner' then 0 else 1 end), m.created_at;
end;
$$;

revoke all on function public.list_household_members() from public;
grant execute on function public.list_household_members() to authenticated;
