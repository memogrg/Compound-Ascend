-- ============================================================
-- 20260903000001 · Retiro de WhatsApp de CARTERA+
--
-- WhatsApp deja de existir como canal (registro, consulta y notificación pasan a
-- la app móvil y la web). Esta migración limpia el rastro de WhatsApp en la BD:
--
--   1) Borra la tabla `whatsapp_links` (2 filas en prod; NINGUNA FK apunta a ella,
--      así que `drop table` sin cascade es seguro — sus policies, trigger e índices
--      caen con la tabla). Si `cascade` hiciera falta, algo cambió → parar y revisar.
--   2) Saca el literal 'whatsapp_links' de household_backfillable_tables() y del
--      array `retain` de purge_household(): ambas nombraban la tabla por literal.
--      Las funciones consultan information_schema, así que el literal era inofensivo
--      (la tabla ya no existe); se limpia igual. Cuerpo VERBATIM de prod salvo ese
--      literal. purge_household es SECURITY DEFINER (borrado de cuenta #82): se
--      reproduce carácter por carácter + se re-declara el revoke/grant de #82.
--   3) Turnos de conversación con channel='whatsapp' (12 filas de prueba en prod) +
--      el CHECK del canal → solo 'web'. Ver NOTA en el bloque 3 (decisión de Memo).
--   4) Higiene idempotente: quita la clave 'whatsapp' de user_settings.notifications.
--
-- notification_log.channel es text libre y tiene 0 filas de WhatsApp → no requiere
-- cambio. Aplicación MANUAL por SQL Editor; luego
--   supabase migration repair --status applied 20260903000001
-- ============================================================

-- ------------------------------------------------------------
-- 1) Tabla del canal. Sin cascade a propósito (verificado: ninguna FK la apunta).
-- ------------------------------------------------------------
drop table if exists public.whatsapp_links;

-- ------------------------------------------------------------
-- 2a) household_backfillable_tables(): idéntica menos 'whatsapp_links' del not-in.
-- ------------------------------------------------------------
create or replace function public.household_backfillable_tables()
returns table (table_name text)
language sql
stable
set search_path = public
as $$
  select c.table_name::text
  from information_schema.columns c
  where c.table_schema = 'public'
    and c.column_name = 'household_id'
    and c.is_nullable = 'YES'
    and exists (
      select 1 from information_schema.columns u
      where u.table_schema = 'public'
        and u.table_name = c.table_name
        and u.column_name = 'user_id'
    )
    and c.table_name not in (
      'household_members', 'household_invitations'
    )
  order by c.table_name;
$$;

-- ------------------------------------------------------------
-- 2b) purge_household(uuid): VERBATIM de prod (#82) menos 'whatsapp_links' del array
-- `retain`. SECURITY DEFINER + search_path; se re-declara el revoke/grant service-role
-- (idempotente: create-or-replace preserva la ACL, esto solo la hace explícita).
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
    'user_priorities', 'dependents', 'financial_goals_profile'
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

revoke all on function public.purge_household(uuid) from public, anon, authenticated;
grant execute on function public.purge_household(uuid) to service_role;

-- ------------------------------------------------------------
-- 3) Memoria conversacional: sacar los turnos de WhatsApp y cerrar el CHECK a 'web'.
--
-- NOTA (decisión de Memo al aplicar): en prod hay 12 filas channel='whatsapp' de una
-- conversación de PRUEBA. La memoria es rodante por usuario, así que borrarlas no
-- degrada el chat web. Si preferís NO perder ese texto, en vez del DELETE de abajo
-- usá la línea comentada que las migra a 'web'. Elegí UNA.
-- ------------------------------------------------------------
delete from public.ai_conversation_turns where channel = 'whatsapp';
-- Alternativa (conservar el texto): comentá el delete de arriba y usá esta línea:
-- update public.ai_conversation_turns set channel = 'web' where channel = 'whatsapp';

alter table public.ai_conversation_turns
  drop constraint if exists ai_conversation_turns_channel_check;
alter table public.ai_conversation_turns
  add constraint ai_conversation_turns_channel_check check (channel = 'web');

-- ------------------------------------------------------------
-- 4) Higiene: quitar la preferencia de canal 'whatsapp' guardada. Idempotente.
-- ------------------------------------------------------------
update public.user_settings
  set notifications = notifications - 'whatsapp'
  where notifications ? 'whatsapp';
