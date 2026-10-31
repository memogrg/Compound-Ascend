-- ============================================================
-- Suscripciones compradas en las tiendas (App Store / Google Play) vía RevenueCat.
--
-- Stripe sigue siendo el canal de la web. Una compra dentro de la app la cobra Apple o
-- Google, RevenueCat la valida y nos avisa por webhook (/api/webhooks/revenuecat), que
-- escribe estas columnas y, de ahí, `profiles.plan` con el mismo `aplicarPlan` de Stripe.
--
-- Aditiva e idempotente: se puede correr dos veces sin efecto.
-- ============================================================

alter table public.profiles
  add column if not exists store_subscription_active boolean not null default false,
  add column if not exists store_platform            text,
  add column if not exists store_product_id          text,
  add column if not exists store_period_end          timestamptz,
  add column if not exists revenuecat_app_user_id    text;

alter table public.profiles
  drop constraint if exists profiles_store_platform_check;
alter table public.profiles
  add constraint profiles_store_platform_check
    check (store_platform is null or store_platform in ('ios', 'android'));

comment on column public.profiles.store_subscription_active is
  'La cuenta tiene una suscripción viva comprada en App Store o Google Play (la escribe el webhook de RevenueCat). Mientras sea true, Stripe no la baja a ninguno.';
comment on column public.profiles.store_platform is
  'Tienda donde se compró la suscripción: ios | android.';
comment on column public.profiles.store_product_id is
  'Producto de la tienda (cartera_pro_mensual, …), tal como lo manda RevenueCat.';
comment on column public.profiles.store_period_end is
  'Fin del período pagado en la tienda (expiration_at_ms de RevenueCat).';
comment on column public.profiles.revenuecat_app_user_id is
  'original_app_user_id de RevenueCat, para encontrar la cuenta cuando el evento no trae nuestro UUID.';

-- Un usuario de RevenueCat no puede pertenecer a dos cuentas (y el webhook lo busca por acá).
create unique index if not exists profiles_revenuecat_app_user_uidx
  on public.profiles (revenuecat_app_user_id) where revenuecat_app_user_id is not null;

-- ---------- Blindaje de las columnas de tienda ----------
-- `protect_profile_plan` solo conoce las columnas de Stripe y no se toca acá. Sin este
-- trigger, un PATCH a PostgREST podría escribirse `store_subscription_active = true`, y con
-- eso Stripe dejaría de bajarle el plan al cancelar. Mismo criterio que aquel: solo el
-- servidor (service-role) escribe facturación.
create or replace function public.protect_profile_store_billing()
returns trigger
language plpgsql
as $$
begin
  if current_setting('request.jwt.claims', true) is not null
     and (auth.jwt() ->> 'role') = 'authenticated'
     and (new.store_subscription_active is distinct from old.store_subscription_active
       or new.store_platform            is distinct from old.store_platform
       or new.store_product_id          is distinct from old.store_product_id
       or new.store_period_end          is distinct from old.store_period_end
       or new.revenuecat_app_user_id    is distinct from old.revenuecat_app_user_id)
  then
    raise exception 'No puedes cambiar tu suscripción de la tienda desde el cliente';
  end if;
  return new;
end;
$$;

drop trigger if exists protect_profile_store_billing on public.profiles;
create trigger protect_profile_store_billing
  before update on public.profiles
  for each row execute function public.protect_profile_store_billing();
