-- ============================================================
-- 20260722000001 · Backfill: sube al hogar los datos que el dueño creó "en modo solo"
--
-- Cuando alguien usó la app ANTES de tener hogar, sus filas nacieron con
-- household_id NULL (getActiveHouseholdId devolvía null). Al formarse el hogar
-- después, ni ensure_household ni accept_household_invitation rellenaban esas
-- filas: quedan visibles solo para su autor y el resto del hogar no las ve.
--
-- Este backfill las etiqueta con el hogar activo de su dueño.
--
-- Complementa (no reemplaza) al scoping de lecturas: la app ya lee con
-- .in("user_id", householdMemberIds) — sin eso el backfill no se vería, porque
-- el filtro de la app corta las filas antes de que el RLS importe.
--
-- La lista de tablas NO está hardcodeada: se deriva de information_schema
-- (toda tabla de public con household_id y user_id). Así una tabla nueva queda
-- cubierta sin que nadie recuerde editar una lista — que es justo cómo nació
-- este bug.
--
-- Aditivo e idempotente: solo toca filas con household_id IS NULL del usuario
-- indicado. Una segunda corrida no cambia nada.
--
-- Aplicación: manual por SQL Editor; luego
--   supabase migration repair --status applied 20260722000001
-- ============================================================

-- ------------------------------------------------------------
-- Tablas candidatas al backfill. Excluye:
--   · household_members / household_invitations → infraestructura del hogar,
--     su household_id es NOT NULL (no puede haber filas huérfanas).
--   · whatsapp_links → su RLS es solo user_id = auth.uid(); NO comparte por
--     hogar, así que etiquetarla sería una escritura sin efecto de lectura
--     sobre un dato sensible (el número de teléfono).
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
      'household_members', 'household_invitations', 'whatsapp_links'
    )
  order by c.table_name;
$$;

-- ------------------------------------------------------------
-- Conteo de filas SIN hogar por tabla, para un usuario. Sirve para verificar
-- el antes/después del backfill (debe quedar en 0).
-- ------------------------------------------------------------
create or replace function public.household_null_counts(p_user_id uuid)
returns table (table_name text, null_rows bigint)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  t text;
  n bigint;
begin
  for t in select hbt.table_name from public.household_backfillable_tables() hbt loop
    execute format(
      'select count(*) from public.%I where user_id = $1 and household_id is null', t
    ) into n using p_user_id;
    if n > 0 then
      table_name := t;
      null_rows := n;
      return next;
    end if;
  end loop;
end;
$$;

-- ------------------------------------------------------------
-- Motor del backfill. Parámetros EXPLÍCITOS (no auth.uid()) para poder
-- invocarlo desde ensure_household sin recursión y sin depender de la sesión.
--
-- Solo toca filas del usuario indicado con household_id NULL. Nunca modifica
-- datos de otros usuarios.
-- ------------------------------------------------------------
create or replace function public.backfill_household_rows(
  p_user_id uuid,
  p_household_id uuid
)
returns table (table_name text, moved_rows bigint)
language plpgsql
security definer
set search_path = public
as $$
declare
  t text;
  n bigint;
begin
  if p_user_id is null or p_household_id is null then
    return;
  end if;

  for t in select hbt.table_name from public.household_backfillable_tables() hbt loop
    execute format(
      'update public.%I set household_id = $1 where user_id = $2 and household_id is null', t
    ) using p_household_id, p_user_id;
    get diagnostics n = row_count;
    if n > 0 then
      table_name := t;
      moved_rows := n;
      return next;
    end if;
  end loop;
end;
$$;

-- ------------------------------------------------------------
-- Backfill del usuario autenticado sobre su hogar activo.
--
-- El criterio de "hogar activo" es EXACTAMENTE el de getActiveHouseholdId
-- (src/lib/household/active.ts) y el del backfill de categorías
-- (20260713000002): entre las membresías 'active', la de rol 'owner' primero;
-- si no hay owner, la más antigua por created_at.
--
-- Si el usuario no pertenece a ningún hogar (modo solo) no hace nada: sus datos
-- son suyos y no hay con quién compartirlos.
-- ------------------------------------------------------------
create or replace function public.backfill_owner_household()
returns table (table_name text, moved_rows bigint)
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  hid uuid;
begin
  if uid is null then
    raise exception 'No autenticado';
  end if;

  select hm.household_id into hid
  from public.household_members hm
  where hm.user_id = uid and hm.status = 'active'
  order by case when hm.role = 'owner' then 0 else 1 end, hm.created_at
  limit 1;

  if hid is null then
    return; -- modo solo: nada que compartir
  end if;

  return query select * from public.backfill_household_rows(uid, hid);
end;
$$;

revoke all on function public.backfill_owner_household() from public;
grant execute on function public.backfill_owner_household() to authenticated;
revoke all on function public.household_null_counts(uuid) from public;
grant execute on function public.household_null_counts(uuid) to authenticated;

-- ------------------------------------------------------------
-- PREVENCIÓN: al CREARSE el hogar por primera vez, los datos que el dueño ya
-- tenía en modo solo pasan al hogar automáticamente. Así este bug no le vuelve
-- a pasar a nadie.
--
-- El backfill se dispara SOLO en la rama de creación (paso 3), no en cada
-- llamada: ensure_household se invoca seguido y correr un update sobre ~48
-- tablas cada vez sería caro e inútil (ya no habría filas NULL).
--
-- Corre con la sesión del OWNER (quien crea el hogar), no con la del invitado
-- — por eso el hook va aquí y no en accept_household_invitation.
-- ------------------------------------------------------------
create or replace function public.ensure_household(p_name text default null)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  hid uuid;
  created boolean := false;
begin
  if auth.uid() is null then
    raise exception 'No autenticado';
  end if;

  -- 1) ¿Ya es miembro activo de algún hogar? (prioriza donde es owner)
  select hm.household_id into hid
  from public.household_members hm
  where hm.user_id = auth.uid() and hm.status = 'active'
  order by case when hm.role = 'owner' then 0 else 1 end, hm.created_at
  limit 1;

  if hid is not null then
    return hid;
  end if;

  -- 2) ¿Es dueño de un hogar sin fila de miembro? reúsalo.
  select h.id into hid
  from public.households h
  where h.owner_id = auth.uid()
  order by h.created_at
  limit 1;

  -- 3) Si no, crea el hogar.
  if hid is null then
    insert into public.households (owner_id, name, type)
    values (auth.uid(), coalesce(nullif(btrim(p_name), ''), 'Mi hogar'), 'familia')
    returning id into hid;
    created := true;
  end if;

  -- 4) Asegura la membresía 'owner' activa.
  insert into public.household_members (household_id, user_id, role, status)
  values (hid, auth.uid(), 'owner', 'active')
  on conflict (household_id, user_id)
    do update set status = 'active', role = 'owner';

  -- 5) Hogar recién creado: sube los datos previos del dueño (modo solo → hogar).
  --    Best-effort: si algo falla, el hogar YA quedó creado y el backfill puede
  --    reintentarse con backfill_owner_household(). No debe tumbar la invitación.
  if created then
    begin
      perform public.backfill_household_rows(auth.uid(), hid);
    exception when others then
      raise warning 'backfill del hogar % fallo: %', hid, sqlerrm;
    end;
  end if;

  return hid;
end;
$$;
