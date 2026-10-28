-- ------------------------------------------------------------
-- invitation_email_has_account(p_token): ¿el correo de esta invitación ya tiene
-- cuenta? Lo usa /invitacion/aceptar SIN sesión para ordenar los botones
-- («Iniciar sesión y unirme» primero si ya la tiene; «Crear cuenta» si no).
--
-- No es un oráculo de correos: solo responde por el correo de una invitación
-- pendiente y vigente, y para pedirla hay que tener su token (uuid aleatorio que
-- solo llega en el correo de invitación). Quien tiene el token ya ve ese correo
-- con get_invitation_by_token. Devuelve un booleano y nada más: false en todo
-- otro caso (token inexistente, aceptada, revocada, expirada), nunca un error.
-- ------------------------------------------------------------
create or replace function public.invitation_email_has_account(p_token uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (
      select exists (
        select 1
        from auth.users u
        where lower(u.email) = lower(i.email::text)
      )
      from public.household_invitations i
      where i.token = p_token
        and i.status = 'pending'
        and i.expires_at >= pg_catalog.now()
      limit 1
    ),
    false
  );
$$;

revoke all on function public.invitation_email_has_account(uuid) from public;
grant execute on function public.invitation_email_has_account(uuid) to anon, authenticated;
