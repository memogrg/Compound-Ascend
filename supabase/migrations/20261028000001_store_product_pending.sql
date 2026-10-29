-- ------------------------------------------------------------
-- profiles.store_product_pending: el producto de tienda que entra al renovar.
--
-- Un PRODUCT_CHANGE diferido de RevenueCat (bajada de plan, o el mismo plan con otro
-- período) no está vigente hasta que vence lo pagado. Antes el webhook escribía el
-- producto nuevo en store_product_id al recibirlo, y la app tomaba como «actual» un
-- producto que la tienda todavía no cobra: un segundo cambio en esa ventana mandaba
-- un oldProductIdentifier que Google Play rechaza. Ahora store_product_id queda con
-- el vigente y el nuevo espera acá hasta que llega la compra o renovación que lo
-- confirma, que lo promueve y limpia esta columna.
--
-- La escribe SOLO el webhook de RevenueCat (service-role), como el resto de las
-- columnas de tienda: se suma a protect_profile_store_billing.
-- ------------------------------------------------------------
alter table public.profiles
  add column if not exists store_product_pending text null;

comment on column public.profiles.store_product_pending is
  'Producto de tienda que entra al renovar; null si no hay cambio diferido.';

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
       or new.store_product_pending     is distinct from old.store_product_pending
       or new.store_period_end          is distinct from old.store_period_end
       or new.revenuecat_app_user_id    is distinct from old.revenuecat_app_user_id)
  then
    raise exception 'No puedes cambiar tu suscripción de la tienda desde el cliente';
  end if;
  return new;
end;
$$;
