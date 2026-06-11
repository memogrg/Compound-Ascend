-- ============================================================
-- 0018 · Aceptación de invitaciones de hogar (acceso por token)
--        Funciones SECURITY DEFINER: el invitado todavía no es miembro, así que
--        no puede leer household_invitations ni insertarse en household_members
--        bajo RLS. Estas funciones validan el token y hacen el alta con
--        privilegios de definidor, respetando la identidad vía auth.uid().
-- ============================================================

-- ------------------------------------------------------------
-- get_invitation_by_token(): datos mínimos para pintar la pantalla de
-- aceptación (incluso sin sesión: el token es el secreto). No expone otros
-- correos ni datos del hogar más allá del nombre.
-- ------------------------------------------------------------
create or replace function public.get_invitation_by_token(p_token uuid)
returns table (
  household_id uuid,
  email text,
  role text,
  status text,
  expired boolean,
  inviter_name text,
  household_name text
)
language sql
security definer
set search_path = public
as $$
  select
    i.household_id,
    i.email::text,
    i.role,
    i.status,
    (i.expires_at < now()) as expired,
    coalesce(p.display_name, 'Un familiar') as inviter_name,
    h.name as household_name
  from public.household_invitations i
  join public.households h on h.id = i.household_id
  left join public.profiles p on p.id = i.invited_by
  where i.token = p_token
  limit 1;
$$;

revoke all on function public.get_invitation_by_token(uuid) from public;
grant execute on function public.get_invitation_by_token(uuid) to anon, authenticated;

-- ------------------------------------------------------------
-- accept_household_invitation(): valida (pendiente, no expirada, correo
-- coincide con el de la sesión), inserta la membresía 'active' con el rol de la
-- invitación, marca la invitación 'accepted' y completa el onboarding del
-- invitado SIN correr el wizard. Devuelve el household_id.
-- ------------------------------------------------------------
create or replace function public.accept_household_invitation(p_token uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  inv public.household_invitations;
  uid uuid := auth.uid();
  uemail text;
begin
  if uid is null then
    raise exception 'No autenticado';
  end if;

  select * into inv from public.household_invitations
  where token = p_token
  for update;

  if inv.id is null then
    raise exception 'Invitación no encontrada';
  end if;
  if inv.status <> 'pending' then
    raise exception 'La invitación ya no está disponible';
  end if;
  if inv.expires_at < now() then
    raise exception 'La invitación expiró';
  end if;

  select email into uemail from auth.users where id = uid;
  if lower(uemail) <> lower(inv.email::text) then
    raise exception 'La invitación es para otro correo';
  end if;

  insert into public.household_members (household_id, user_id, role, status)
  values (inv.household_id, uid, inv.role, 'active')
  on conflict (household_id, user_id)
    do update set status = 'active', role = excluded.role;

  update public.household_invitations
    set status = 'accepted'
    where id = inv.id;

  -- El invitado hereda el perfil del hogar: marca onboarding completo para no
  -- forzar el wizard (el gating de UI lo trata como miembro, no owner).
  update public.profiles
    set onboarding_completed = true
    where id = uid;

  return inv.household_id;
end;
$$;

revoke all on function public.accept_household_invitation(uuid) from public;
grant execute on function public.accept_household_invitation(uuid) to authenticated;
