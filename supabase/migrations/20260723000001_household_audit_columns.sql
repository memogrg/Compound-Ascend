-- ============================================================
-- 20260723000001 · Auditoría del hogar: created_by / last_edited_by
--
-- Con la edición compartida, una fila del hogar puede ser creada por un miembro
-- y editada por otro. `user_id` sigue siendo el DUEÑO de la fila (lo usan las
-- RLS y el scoping); estas dos columnas registran quién la creó y quién la tocó
-- por última vez.
--
-- Alcance: las mismas tablas del backfill (household_backfillable_tables()),
-- derivadas de information_schema — NO hardcodeadas. Una tabla nueva con
-- household_id + user_id queda cubierta al correr esto de nuevo.
--
-- Aditivo e idempotente: columnas NULLABLE (`add column if not exists`), sin
-- default, y el backfill solo toca las que están en NULL. Nada se rompe si se
-- corre dos veces.
--
-- ⚠️ ON DELETE SET NULL, deliberado
-- --------------------------------
-- `user_id` es `on delete cascade`: si se borra la cuenta, se borran SUS datos.
-- Para created_by/last_edited_by eso sería catastrófico: borrar a un miembro
-- arrastraría las filas del DUEÑO que ese miembro llegó a editar.
-- Y sin cláusula (NO ACTION, que es lo que quedaba por defecto) pasaría lo
-- contrario: la baja de cualquier cuenta FALLARÍA mientras exista una fila que
-- la referencie.
-- `set null` es la única semántica correcta: se pierde el puntero de auditoría,
-- los datos sobreviven. Es el mismo criterio que ya usa household_id.
--
-- Aplicación: manual por SQL Editor; luego
--   supabase migration repair --status applied 20260723000001
-- ============================================================

do $$
declare
  t text;
begin
  for t in select hbt.table_name from public.household_backfillable_tables() hbt loop
    execute format(
      'alter table public.%I add column if not exists created_by uuid '
      || 'references auth.users(id) on delete set null', t);
    execute format(
      'alter table public.%I add column if not exists last_edited_by uuid '
      || 'references auth.users(id) on delete set null', t);

    -- Retroactivo: lo existente lo creó su dueño. `last_edited_by` se deja en
    -- NULL a propósito — significa "nunca se editó", que es la verdad; ponerle
    -- el dueño inventaría una edición que nunca ocurrió.
    execute format(
      'update public.%I set created_by = user_id where created_by is null', t);
  end loop;
end;
$$;

-- ------------------------------------------------------------
-- Verificación: tablas que ya tienen ambas columnas y cuántas filas quedaron
-- sin created_by (debe ser 0 salvo filas sin user_id).
-- ------------------------------------------------------------
create or replace function public.household_audit_coverage()
returns table (table_name text, has_columns boolean, missing_created_by bigint)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  t text;
  ok boolean;
  n bigint;
begin
  for t in select hbt.table_name from public.household_backfillable_tables() hbt loop
    select count(*) = 2 into ok
    from information_schema.columns c
    where c.table_schema = 'public'
      and c.table_name = t
      and c.column_name in ('created_by', 'last_edited_by');

    if ok then
      execute format('select count(*) from public.%I where created_by is null', t) into n;
    else
      n := null;
    end if;

    table_name := t;
    has_columns := ok;
    missing_created_by := n;
    return next;
  end loop;
end;
$$;

revoke all on function public.household_audit_coverage() from public;
grant execute on function public.household_audit_coverage() to authenticated;
