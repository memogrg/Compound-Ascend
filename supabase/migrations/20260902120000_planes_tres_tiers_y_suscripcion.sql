-- ============================================================================
-- Tres planes de verdad + ciclo de suscripción.
--
-- Antes había dos planes ('free','premium') y ninguna noción de facturación:
-- ni prueba, ni fin de período, ni cambio programado. La landing vende
-- Esencial+ / Pro+ / Max+, así que el modelo tenía que existir de verdad.
--
-- `ninguno` NO es un tier gratuito: es una cuenta viva SIN suscripción activa.
-- Ahí cae quien nunca pagó, quien canceló y —lo importante— el miembro de un
-- hogar que quedó huérfano porque el titular bajó de plan. Conserva todos sus
-- datos y puede exportarlos; lo que no puede es seguir usando la app.
--
-- Mapeo de los existentes: 'free' → 'ninguno', 'premium' → 'max'. En prod son
-- 13 cuentas de prueba, así que nadie pierde nada; se manda a 'max' para que
-- ninguna cuenta interna se quede sin acceso de un día para otro.
-- ============================================================================

-- ---------- 1. El check de planes ----------
-- El check viejo tiene que caer ANTES de tocar los datos, si no rechaza el update.
alter table public.profiles drop constraint if exists profiles_plan_check;

update public.profiles set plan = 'max'     where plan = 'premium';
update public.profiles set plan = 'ninguno' where plan = 'free';

alter table public.profiles
  alter column plan set default 'ninguno',
  add constraint profiles_plan_check
    check (plan in ('ninguno', 'esencial', 'pro', 'max'));

-- ---------- 2. El ciclo de suscripción ----------
-- `plan_pending` + `plan_effective_at` son el corazón de la bajada programada:
-- pedir el cambio NO cambia nada hoy. Se guarda la intención y la fecha en que
-- entra, que es cuando vence el mes ya pagado. Subir de plan no usa esto: se
-- aplica de una porque el usuario ya pagó la diferencia.
alter table public.profiles
  add column if not exists plan_pending       text,
  add column if not exists plan_effective_at  timestamptz,
  add column if not exists period_end         timestamptz,
  add column if not exists trial_ends_at      timestamptz,
  add column if not exists stripe_customer_id     text,
  add column if not exists stripe_subscription_id text;

alter table public.profiles
  drop constraint if exists profiles_plan_pending_check;
alter table public.profiles
  add constraint profiles_plan_pending_check
    check (plan_pending is null or plan_pending in ('ninguno', 'esencial', 'pro', 'max'));

comment on column public.profiles.plan_pending is
  'Plan al que se baja cuando venza el período pagado. NULL = sin cambio programado.';
comment on column public.profiles.plan_effective_at is
  'Momento en que plan_pending reemplaza a plan. Lo lee el cron de suscripciones.';
comment on column public.profiles.period_end is
  'Fin del período ya pagado. Lo escribe el webhook de Stripe.';
comment on column public.profiles.trial_ends_at is
  'Fin de los 14 días de prueba. La tarjeta se registra al abrir la cuenta; el primer cobro es acá.';

-- Un cliente de Stripe no puede pertenecer a dos cuentas.
create unique index if not exists profiles_stripe_customer_uidx
  on public.profiles (stripe_customer_id) where stripe_customer_id is not null;

-- El cron busca por acá: sin índice, escanea la tabla entera cada hora.
create index if not exists profiles_plan_effective_idx
  on public.profiles (plan_effective_at) where plan_pending is not null;

-- ---------- 3. Blindaje: el cliente no toca la facturación ----------
-- El trigger viejo solo cuidaba `plan`. Sin esto, un POST a PostgREST podría
-- escribirse `plan_pending = 'max'` y esperar a que el cron se lo regale, o
-- correr `period_end` para estirar el mes pagado. Todas las columnas de
-- facturación se escriben SOLO desde el servidor (service-role).
create or replace function public.protect_profile_plan()
returns trigger
language plpgsql
as $$
begin
  if current_setting('request.jwt.claims', true) is not null
     and (auth.jwt() ->> 'role') = 'authenticated'
     and (new.plan                   is distinct from old.plan
       or new.plan_pending           is distinct from old.plan_pending
       or new.plan_effective_at      is distinct from old.plan_effective_at
       or new.period_end             is distinct from old.period_end
       or new.trial_ends_at          is distinct from old.trial_ends_at
       or new.stripe_customer_id     is distinct from old.stripe_customer_id
       or new.stripe_subscription_id is distinct from old.stripe_subscription_id)
  then
    raise exception 'No puedes cambiar tu plan ni tu facturación desde el cliente';
  end if;
  return new;
end;
$$;
