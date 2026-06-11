-- ============================================================
-- 0017 · Invitaciones de hogar (household_invitations) + ensure_household()
--        Conecta el flujo de invitación al modelo de hogar ya existente.
-- ============================================================

-- ------------------------------------------------------------
-- ensure_household(): devuelve el hogar activo del usuario; si no tiene
-- ninguno, crea uno y lo registra como miembro 'owner'.
--
-- SECURITY DEFINER resuelve el bootstrap: la política hm_insert exige
-- is_household_editor(household_id), pero el dueño recién creado todavía no es
-- miembro, así que no podría insertarse a sí mismo bajo RLS. Esta función
-- corre con privilegios de definidor y respeta la identidad vía auth.uid().
-- ------------------------------------------------------------
create or replace function public.ensure_household(p_name text default null)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  hid uuid;
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
  end if;

  -- 4) Asegura la membresía 'owner' activa.
  insert into public.household_members (household_id, user_id, role, status)
  values (hid, auth.uid(), 'owner', 'active')
  on conflict (household_id, user_id)
    do update set status = 'active', role = 'owner';

  return hid;
end;
$$;

revoke all on function public.ensure_household(text) from public;
grant execute on function public.ensure_household(text) to authenticated;

-- ------------------------------------------------------------
-- household_invitations
-- ------------------------------------------------------------
create table public.household_invitations (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  email citext not null,
  token uuid not null default gen_random_uuid(),
  invited_by uuid not null references auth.users(id) on delete cascade,
  role text not null default 'adult' check (role in ('owner','adult','member','viewer')),
  status text not null default 'pending' check (status in ('pending','accepted','revoked')),
  expires_at timestamptz not null default (now() + interval '14 days'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (token)
);

create index idx_hh_invit_household on public.household_invitations(household_id);
create index idx_hh_invit_email on public.household_invitations(email);
-- Una sola invitación pendiente por (hogar, correo).
create unique index uq_hh_invit_pending
  on public.household_invitations(household_id, email)
  where status = 'pending';

create trigger trg_household_invitations_updated before update on public.household_invitations
  for each row execute function public.set_updated_at();

-- ------------------------------------------------------------
-- RLS: el editor del hogar gestiona sus invitaciones. El invitado NO lee esta
-- tabla directamente: el acceso por token se hace vía función SECURITY DEFINER
-- (se añade en la migración de aceptación).
-- ------------------------------------------------------------
alter table public.household_invitations enable row level security;
alter table public.household_invitations force row level security;

create policy hh_invit_select on public.household_invitations
  for select using (public.is_household_editor(household_id));
create policy hh_invit_insert on public.household_invitations
  for insert with check (public.is_household_editor(household_id) and invited_by = auth.uid());
create policy hh_invit_update on public.household_invitations
  for update using (public.is_household_editor(household_id))
  with check (public.is_household_editor(household_id));
create policy hh_invit_delete on public.household_invitations
  for delete using (public.is_household_editor(household_id));
