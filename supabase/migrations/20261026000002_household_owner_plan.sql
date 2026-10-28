-- Plan del TITULAR del hogar activo de quien llama: el que define el CUPO del hogar.
--
-- El cupo (HOUSEHOLD_MEMBER_LIMITS en src/lib/plan.ts) depende de lo que PAGA el titular, no
-- del plan de quien mira ni del plan efectivo del titular. Un `adult` gestiona el hogar
-- (invita, revoca) pero con su sesión no puede leer el `profiles.plan` del titular, porque la
-- única policy de lectura de `profiles` es la propia. Y `effective_plan` no sirve: con sesión
-- devuelve null para otro id, y además un titular Pro+ que es miembro de un hogar Max+ ajeno
-- tiene efectivo `max` mientras su hogar tiene el cupo de Pro+.
--
-- Sin parámetros a propósito: el hogar sale de auth.uid(), así nadie puede pedir el plan de un
-- hogar ajeno. Solo devuelve algo si quien llama tiene una membresía `active`; si no (sin
-- hogar, invited, removed, sin sesión), null.
--
-- Hogar activo: el mismo desempate que resolveActiveMembership (src/lib/household/active.ts),
-- list_household_members y ensure_household — la membresía con rol owner primero, si no la
-- activa más antigua. Así el cupo es el del mismo hogar que la lista de miembros que se muestra
-- y que el hogar en el que ensure_household crea la invitación.
--
-- search_path vacío: SECURITY DEFINER sin resolución implícita de nombres.

create or replace function public.household_owner_plan()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  with activa as (
    select hm.household_id
    from public.household_members hm
    where hm.user_id = auth.uid()
      and hm.status = 'active'
    order by case when hm.role = 'owner' then 0 else 1 end, hm.created_at
    limit 1
  )
  select o.plan
  from activa a
  join public.households h
    on h.id = a.household_id
  join public.profiles o
    on o.id = h.owner_id;
$$;

-- anon/authenticated tienen EXECUTE por default privileges, así que no basta con revocar a
-- public (ver increment_ai_usage). Sin service_role: el backend no la necesita, y sin sesión
-- auth.uid() es null y no devolvería nada.
revoke all on function public.household_owner_plan() from public;
revoke all on function public.household_owner_plan() from anon;
grant execute on function public.household_owner_plan() to authenticated;
