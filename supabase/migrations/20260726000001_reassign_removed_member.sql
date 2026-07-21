-- ============================================================
-- 20260726000001 · Revocación total al quitar un miembro del hogar
--
-- Quitar un miembro pone household_members.status='removed', pero las filas que
-- ese miembro creó siguen con SU user_id → él las sigue viendo (el RLS matchea
-- `user_id = auth.uid()`). Para una revocación TOTAL, sus filas FINANCIERAS del
-- hogar se reasignan al titular (owner): pierde acceso también a lo que creó.
--
-- NO se reasignan las tablas PERSONALES (perfil de riesgo/comportamiento/
-- conocimiento, preferencias, dependientes, perfil del wizard, insights): son la
-- IDENTIDAD del miembro, no datos del hogar. Al quedar removido, el RLS del hogar
-- ya deja de mostrarlas; siguen siendo suyas y privadas. Reasignarlas le daría al
-- titular dos perfiles y borraría el del miembro.
--
-- `user_id` cambia al titular (dueño de la fila). `created_by` se conserva: sigue
-- diciendo quién la creó originalmente (auditoría). La visibilidad la decide el
-- RLS por user_id/household, no por created_by.
--
-- Aplicación manual por SQL Editor; luego
--   supabase migration repair --status applied 20260726000001
-- ============================================================

-- ------------------------------------------------------------
-- Tablas FINANCIERAS del hogar reasignables: las backfillables MENOS las
-- personales. Derivado de information_schema (no hardcodeado); una tabla nueva
-- financiera queda cubierta sola, y una personal nueva hay que excluirla acá.
-- ------------------------------------------------------------
create or replace function public.household_reassignable_tables()
returns table (table_name text)
language sql
stable
set search_path = public
as $$
  select hbt.table_name
  from public.household_backfillable_tables() hbt
  where hbt.table_name not in (
    'personal_profiles', 'risk_profiles', 'behavior_profiles', 'knowledge_profiles',
    'user_priorities', 'financial_goals_profile', 'profile_snapshots', 'dependents',
    'user_insights'
  );
$$;

-- ------------------------------------------------------------
-- Reasigna al TITULAR las filas financieras del hogar creadas por un miembro ya
-- removido. SECURITY DEFINER: valida que quien llama es el OWNER del hogar y que
-- p_removed_user quedó 'removed' en ese hogar (o sea, se acaba de quitar). Solo
-- entonces mueve las filas. Idempotente (una segunda corrida no mueve nada).
-- ------------------------------------------------------------
create or replace function public.reassign_removed_member_rows(p_removed_user uuid)
returns table (table_name text, moved_rows bigint)
language plpgsql
security definer
set search_path = public
as $$
declare
  hid uuid;
  t text;
  n bigint;
begin
  if auth.uid() is null or p_removed_user is null then
    return;
  end if;

  -- El que llama debe ser OWNER activo de su hogar.
  select hm.household_id into hid
  from public.household_members hm
  where hm.user_id = auth.uid() and hm.status = 'active' and hm.role = 'owner'
  limit 1;
  if hid is null then
    raise exception 'Solo el titular del hogar puede reasignar filas de un miembro.';
  end if;

  -- p_removed_user debe estar 'removed' en ESE hogar (se acaba de quitar).
  if not exists (
    select 1 from public.household_members hm
    where hm.household_id = hid and hm.user_id = p_removed_user and hm.status = 'removed'
  ) then
    raise exception 'Ese usuario no está removido de tu hogar; no hay nada que reasignar.';
  end if;

  for t in select hrt.table_name from public.household_reassignable_tables() hrt loop
    execute format(
      'update public.%I set user_id = $1 where user_id = $2 and household_id = $3', t
    ) using auth.uid(), p_removed_user, hid;
    get diagnostics n = row_count;
    if n > 0 then
      table_name := t;
      moved_rows := n;
      return next;
    end if;
  end loop;
end;
$$;

revoke all on function public.reassign_removed_member_rows(uuid) from public;
grant execute on function public.reassign_removed_member_rows(uuid) to authenticated;
