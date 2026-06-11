-- ============================================================
-- 0019 · Lectura del perfil del hogar para invitados
--        El perfil del owner (personal_profiles) tiene household_id NULL, así que
--        la rama de RLS por hogar no aplica y el invitado no podría leerlo. Esta
--        función SECURITY DEFINER devuelve el perfil del owner del hogar al que
--        pertenece el invitado (solo lectura), sin exponer otros datos.
-- ============================================================
create or replace function public.get_household_profile()
returns jsonb
language sql
security definer
stable
set search_path = public
as $$
  select pp.extra
  from public.household_members me
  join public.households h
    on h.id = me.household_id and h.owner_id <> me.user_id
  join public.personal_profiles pp
    on pp.user_id = h.owner_id
  where me.user_id = auth.uid() and me.status = 'active'
  order by me.created_at
  limit 1;
$$;

revoke all on function public.get_household_profile() from public;
grant execute on function public.get_household_profile() to authenticated;
