-- ============================================================
-- 20260901000001 · Borrado de cuenta (#82) — funciones atómicas
--
-- Dos funciones SECURITY DEFINER, cada una una transacción, validadas por sus
-- ARGUMENTOS (no por auth.uid()) para poder invocarse desde el cliente
-- SERVICE-ROLE de `deleteAccountAction` (donde auth.uid() es null):
--
--   · purge_household(hid): borra TODA la data compartida del hogar (de todos los
--     autores), CONSERVA des-hogarizados los perfiles PERSONALES de los miembros
--     (D1), y borra members/invitations/households.
--   · reassign_member_rows(member, owner): reasigna las filas financieras del
--     miembro al dueño (preserva created_by) y quita su membresía. Paralela a
--     reassign_removed_member_rows pero invocable en el self-delete del miembro.
--
-- Aplicación manual por SQL Editor; luego
--   supabase migration repair --status applied 20260901000001
-- ============================================================

-- ------------------------------------------------------------
-- Tablas COMPARTIDAS del hogar a purgar: las backfillables (household_id+user_id)
-- MENOS las personales que se conservan des-hogarizadas (D1). Dinámico: una tabla
-- financiera nueva queda cubierta sola; una personal nueva se excluye a mano acá.
-- ------------------------------------------------------------
create or replace function public.household_purgeable_tables()
returns table (table_name text)
language sql
stable
set search_path = public
as $$
  select hbt.table_name
  from public.household_backfillable_tables() hbt
  where hbt.table_name not in (
    'personal_profiles', 'risk_profiles', 'behavior_profiles', 'knowledge_profiles',
    'user_priorities', 'dependents', 'financial_goals_profile'
  );
$$;

-- ------------------------------------------------------------
-- purge_household(p_household): disuelve el hogar por completo.
--   1) Des-hogariza (household_id → null) los perfiles PERSONALES de los miembros
--      para que CONSERVEN su ADN financiero al caer a modo-solo (D1).
--   2) Borra la data COMPARTIDA (household_purgeable_tables) de TODOS los autores,
--      en pasadas tolerantes al orden de FK (borra hijos, reintenta padres).
--   3) Borra invitations, members y la fila households.
-- Idempotente. Devuelve un detalle (op, filas) para auditar la corrida.
-- ------------------------------------------------------------
create or replace function public.purge_household(p_household uuid)
returns table (op text, affected bigint)
language plpgsql
security definer
set search_path = public
as $$
declare
  t text;
  n bigint;
  pass int;
  progressed boolean;
  remaining text[];
  still text[];
  retain text[] := array[
    'personal_profiles', 'risk_profiles', 'behavior_profiles', 'knowledge_profiles',
    'user_priorities', 'dependents', 'financial_goals_profile', 'whatsapp_links'
  ];
begin
  if p_household is null then
    return;
  end if;

  -- 1) Conservar (des-hogarizar) los perfiles personales de los miembros.
  foreach t in array retain loop
    if exists (
      select 1 from information_schema.columns
      where table_schema = 'public' and table_name = t and column_name = 'household_id'
    ) then
      execute format('update public.%I set household_id = null where household_id = $1', t)
        using p_household;
      get diagnostics n = row_count;
      if n > 0 then
        op := t || ' → household_id=null';
        affected := n;
        return next;
      end if;
    end if;
  end loop;

  -- 2) Purga de la data compartida, tolerante al orden de FK (multi-pasada).
  remaining := array(select pt.table_name from public.household_purgeable_tables() pt);
  for pass in 1..12 loop
    exit when array_length(remaining, 1) is null;
    progressed := false;
    still := '{}';
    foreach t in array remaining loop
      begin
        execute format('delete from public.%I where household_id = $1', t) using p_household;
        get diagnostics n = row_count;
        progressed := true;
        if n > 0 then
          op := t || ' (deleted)';
          affected := n;
          return next;
        end if;
      exception when foreign_key_violation then
        still := still || t;  -- diferir: sus hijos aún no se borraron
      end;
    end loop;
    remaining := still;
    exit when not progressed;
  end loop;
  if array_length(remaining, 1) is not null then
    raise exception 'purge_household: no se pudieron borrar por FK: %', remaining;
  end if;

  -- 3) Infra del hogar.
  delete from public.household_invitations where household_id = p_household;
  delete from public.household_members where household_id = p_household;
  delete from public.households where id = p_household;
  op := 'households+members+invitations (deleted)';
  affected := 1;
  return next;
end;
$$;

-- ------------------------------------------------------------
-- reassign_member_rows(p_member, p_owner): en el self-delete de un MIEMBRO,
-- mueve sus filas financieras del hogar al dueño (preserva created_by) y quita su
-- membresía, para que el hogar conserve el historial. Valida por argumentos:
-- p_owner debe ser owner activo y p_member miembro activo no-dueño del MISMO hogar.
-- ------------------------------------------------------------
create or replace function public.reassign_member_rows(p_member uuid, p_owner uuid)
returns table (op text, affected bigint)
language plpgsql
security definer
set search_path = public
as $$
declare
  hid uuid;
  t text;
  n bigint;
begin
  if p_member is null or p_owner is null or p_member = p_owner then
    return;
  end if;

  select hm.household_id into hid
  from public.household_members hm
  where hm.user_id = p_owner and hm.status = 'active' and hm.role = 'owner'
  limit 1;
  if hid is null then
    raise exception 'reassign_member_rows: p_owner no es dueño activo de un hogar';
  end if;

  if not exists (
    select 1 from public.household_members hm
    where hm.household_id = hid and hm.user_id = p_member
      and hm.status = 'active' and hm.role <> 'owner'
  ) then
    raise exception 'reassign_member_rows: p_member no es miembro activo (no-dueño) del hogar';
  end if;

  for t in select hrt.table_name from public.household_reassignable_tables() hrt loop
    execute format(
      'update public.%I set user_id = $1 where user_id = $2 and household_id = $3', t
    ) using p_owner, p_member, hid;
    get diagnostics n = row_count;
    if n > 0 then
      op := t;
      affected := n;
      return next;
    end if;
  end loop;

  delete from public.household_members where household_id = hid and user_id = p_member;
  op := 'household_members (removed)';
  affected := 1;
  return next;
end;
$$;

-- Solo el service-role (deleteAccountAction) las invoca; nunca clientes anon/auth.
revoke all on function public.household_purgeable_tables() from public;
revoke all on function public.purge_household(uuid) from public;
revoke all on function public.reassign_member_rows(uuid, uuid) from public;
grant execute on function public.household_purgeable_tables() to service_role;
grant execute on function public.purge_household(uuid) to service_role;
grant execute on function public.reassign_member_rows(uuid, uuid) to service_role;
