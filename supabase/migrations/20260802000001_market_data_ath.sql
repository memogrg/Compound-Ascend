-- Store persistente de datos de mercado: extiende market_price_cache con el MÁXIMO (ATH real de
-- cripto / máx. 52 semanas de acciones) + high_24h, para que el recolector (cron) los guarde y la
-- app/AI/valuación/alertas LEAN del store — sin pegarle a CoinGecko en vivo por consulta (el fetch
-- en vivo desde serverless fallaba por timeout/rate-limit). Todo nullable: una fila puede tener
-- precio sin máximo (o al revés) según la fuente. Sin datos de usuario → sin RLS nueva (la tabla ya
-- es service-role write / lectura pública de solo precios de mercado).

alter table public.market_price_cache
  add column if not exists ath_usd    numeric(24, 8),
  add column if not exists ath_date   date,
  add column if not exists high_24h   numeric(24, 8),
  add column if not exists high_kind  text check (high_kind is null or high_kind in ('ath', '52w'));
