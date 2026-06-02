-- ============================================================
-- 0001 · Extensiones, funciones helper y triggers base
-- Compound Ascend — Supabase Postgres
-- ============================================================

-- Las funciones helper (is_household_member/editor) referencian tablas creadas
-- en migraciones posteriores; desactivamos la validación de cuerpos de función
-- en esta sesión para permitir esa dependencia hacia adelante.
set check_function_bodies = off;

create extension if not exists "pgcrypto";       -- gen_random_uuid()
create extension if not exists "citext";          -- correos case-insensitive

-- ---------- updated_at automático ----------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ---------- Pertenencia a hogar (evita recursión en RLS) ----------
-- SECURITY DEFINER: consulta household_members sin disparar sus propias RLS.
create or replace function public.is_household_member(hid uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from public.household_members hm
    where hm.household_id = hid
      and hm.user_id = auth.uid()
      and hm.status = 'active'
  );
$$;

create or replace function public.is_household_editor(hid uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from public.household_members hm
    where hm.household_id = hid
      and hm.user_id = auth.uid()
      and hm.status = 'active'
      and hm.role in ('owner','adult')
  );
$$;

-- ---------- Alta de usuario: crea profile + user_settings ----------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, display_name, locale)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'display_name', split_part(new.email, '@', 1)),
    'es'
  )
  on conflict (id) do nothing;

  insert into public.user_settings (user_id)
  values (new.id)
  on conflict (user_id) do nothing;

  return new;
end;
$$;

-- El trigger sobre auth.users se crea en 0002 (tras existir profiles).

-- ============================================================
-- Helper: aplica el patrón estándar de RLS (dueño + hogar), índices y
-- trigger updated_at a una lista de tablas de datos de usuario.
-- Requisito: cada tabla tiene columnas user_id (uuid) y household_id (uuid null),
-- created_at y updated_at.
-- ============================================================
create or replace function public.apply_user_data_policies(tables text[])
returns void
language plpgsql
as $fn$
declare
  t text;
begin
  foreach t in array tables loop
    execute format('alter table public.%I enable row level security;', t);
    execute format('alter table public.%I force row level security;', t);

    execute format('drop trigger if exists trg_%s_updated on public.%I;', t, t);
    execute format(
      'create trigger trg_%s_updated before update on public.%I '
      || 'for each row execute function public.set_updated_at();', t, t);

    execute format('create index if not exists idx_%s_user on public.%I(user_id);', t, t);
    execute format('create index if not exists idx_%s_household on public.%I(household_id);', t, t);
    execute format('create index if not exists idx_%s_created on public.%I(created_at);', t, t);

    execute format(
      'create policy %s_sel on public.%I for select using ('
      || 'user_id = auth.uid() or (household_id is not null and public.is_household_member(household_id)));',
      t, t);
    execute format(
      'create policy %s_ins on public.%I for insert with check (user_id = auth.uid());', t, t);
    execute format(
      'create policy %s_upd on public.%I for update using ('
      || 'user_id = auth.uid() or (household_id is not null and public.is_household_editor(household_id))) '
      || 'with check (user_id = auth.uid() or (household_id is not null and public.is_household_editor(household_id)));',
      t, t);
    execute format(
      'create policy %s_del on public.%I for delete using ('
      || 'user_id = auth.uid() or (household_id is not null and public.is_household_editor(household_id)));',
      t, t);
  end loop;
end;
$fn$;
