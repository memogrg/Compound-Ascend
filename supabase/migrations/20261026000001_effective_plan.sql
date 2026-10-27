-- Plan EFECTIVO: el que decide acceso (muros, features, presupuesto de IA).
--
-- Hasta ahora cada muro leía solo `profiles.plan` propio, y `accept_household_invitation` no
-- le da plan al miembro: un integrante activo del hogar de un titular Max+ caía en el muro de
-- «sin plan» (B-2). El plan efectivo es el MAYOR entre el plan propio y el plan del titular
-- de cada hogar donde la persona es miembro ACTIVO, contando al titular solo si su plan
-- incluye hogar.
--
-- Por qué una función y no una lectura desde TS: la única policy de lectura de `profiles` es
-- `profiles_select_own`, así que con su sesión un miembro NO puede leer el plan del titular.
-- SECURITY DEFINER lo resuelve sin abrir `profiles` a nadie (mismo criterio que
-- get_household_profile / is_household_member).
--
-- Reglas:
--  · Solo cuentan membresías `status = 'active'`; cualquier rol (adult, member, viewer)
--    hereda. `invited` y `removed`, no.
--  · Se recorren TODAS las membresías activas, no solo el «hogar activo»: quien alguna vez
--    invitó a alguien es owner de su propio hogar (ensure_household) y aun así hereda del
--    hogar Max+ al que pertenece.
--  · Planes con hogar: ('max'). Es el espejo de `PLAN_FEATURES[p].household` en
--    src/lib/plan.ts; un guard test compara las dos listas.
--  · El orden de planes es PLAN_RANK de src/lib/plan.ts (ninguno 0 · esencial 1 · pro 2 · max 3).
--  · La facturación NO cambia: `profiles.plan` sigue siendo lo que paga cada uno.
--
-- Guardia: con sesión (auth.uid() no nulo) solo se puede consultar el plan propio; pedir el de
-- otro devuelve null. El backend con service-role (auth.uid() nulo) puede pasar cualquier id,
-- que es lo que necesita assertTokenBudget. Por eso anon NO puede ejecutarla: con auth.uid()
-- nulo pasaría la guardia.
--
-- search_path vacío: SECURITY DEFINER sin resolución implícita de nombres.

create or replace function public.effective_plan(p_user uuid default auth.uid())
returns text
language sql
stable
security definer
set search_path = ''
as $$
  with candidatos as (
    select p.plan
    from public.profiles p
    where p.id = p_user
    union all
    select o.plan
    from public.household_members me
    join public.households h
      on h.id = me.household_id and h.owner_id <> me.user_id
    join public.profiles o
      on o.id = h.owner_id
    where me.user_id = p_user
      and me.status = 'active'
      and o.plan in ('max')
  )
  select c.plan
  from candidatos c
  where auth.uid() is null or p_user = auth.uid()
  order by case c.plan
    when 'max' then 3
    when 'pro' then 2
    when 'esencial' then 1
    else 0
  end desc
  limit 1;
$$;

-- anon/authenticated tienen EXECUTE por default privileges, así que no basta con revocar a
-- public (ver increment_ai_usage).
revoke all on function public.effective_plan(uuid) from public;
revoke all on function public.effective_plan(uuid) from anon;
grant execute on function public.effective_plan(uuid) to authenticated;
grant execute on function public.effective_plan(uuid) to service_role;
