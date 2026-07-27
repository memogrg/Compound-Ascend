-- Generaliza price_alerts a VARIOS tipos de alerta de inversión (extensible).
-- Se AGREGAN columnas (sin renombrar la tabla, para no perder datos ni políticas):
--   kind: discriminador ('price' | 'time_held' | 'vesting'). Las filas existentes eran
--         todas de precio → default 'price' las migra sin pérdida.
--   years_threshold: para time_held (avisa cuando hoy − purchaseDate ≥ N años; el cron lee
--         la purchaseDate del holding en cada corrida, robusto si la fecha cambia).
--   trigger_date: para vesting (avisa al llegar la fecha que fija el usuario).
-- Las columnas propias de 'price' (symbol/asset_type/target_price/direction) pasan a
-- NULLABLE porque time_held/vesting no las usan; sus CHECK ya toleran NULL.

alter table public.price_alerts
  add column if not exists kind text not null default 'price'
    check (kind in ('price', 'time_held', 'vesting')),
  add column if not exists years_threshold numeric(6, 2) check (years_threshold is null or years_threshold > 0),
  add column if not exists trigger_date date;

alter table public.price_alerts alter column symbol drop not null;
alter table public.price_alerts alter column asset_type drop not null;
alter table public.price_alerts alter column target_price drop not null;
alter table public.price_alerts alter column direction drop not null;

-- El cron agrupa por kind → índice dedicado (las activas ya tienen idx_price_alerts_active).
create index if not exists idx_price_alerts_kind on public.price_alerts (kind);
