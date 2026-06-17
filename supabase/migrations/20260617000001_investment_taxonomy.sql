-- ============================================================
-- Taxonomía de inversiones — naturaleza + categoría (20 slugs)
-- ============================================================
-- Aditiva e idempotente. No renumera ni toca otras migraciones; no borra
-- columnas; `symbol` sigue NOT NULL (el servicio rellena un placeholder para
-- categorías no cotizadas). Reutiliza current_value_manual / rental_* ya
-- existentes (migración 0018) para el ingreso de flujo de caja.

alter table public.investment_holdings
  add column if not exists nature        text,      -- 'cashflow' | 'growth'
  add column if not exists category      text,      -- uno de los 20 slugs
  add column if not exists income_month  smallint,  -- 1-12: mes de materialización
  add column if not exists region        text,      -- us|cr|eu|latam|global|otro (NULL = sin definir)
  add column if not exists is_recurring  boolean default false;

-- Backfill idempotente: `category` desde `asset_type` (mapeo PLAN §2.2).
update public.investment_holdings set
  category = case asset_type
    when 'cripto'      then 'cripto'
    when 'etf'         then 'etf_crecimiento'
    when 'accion'      then 'accion_crecimiento'
    when 'bono'        then 'bono_gobierno'
    when 'fondo'       then 'fondo_conservador'
    when 'certificado' then 'deposito_plazo'
    when 'inmueble'    then 'propiedad_alquiler'
    when 'negocio'     then 'negocio_ingreso'
    when 'pension'     then 'roboadvisor'
    when 'commodity'   then 'alternativo'
    when 'arte'        then 'alternativo'
    when 'nft'         then 'cripto'
    else 'alternativo'
  end
  where category is null;

-- ...y `nature` desde `category`.
update public.investment_holdings set
  nature = case when category in (
      'cuenta_remunerada','deposito_plazo','bono_gobierno','bono_empresa',
      'fondo_conservador','prestamo_interes','propiedad_alquiler','reit',
      'accion_dividendo','negocio_ingreso'
    ) then 'cashflow' else 'growth' end
  where nature is null;

-- CHECK suaves: toleran NULL (no bloquean el backfill ni filas viejas) y se
-- añaden de forma idempotente (no fallan si la migración se reaplica).
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'investment_holdings_nature_check') then
    alter table public.investment_holdings
      add constraint investment_holdings_nature_check
      check (nature is null or nature in ('cashflow', 'growth'));
  end if;

  if not exists (select 1 from pg_constraint where conname = 'investment_holdings_category_check') then
    alter table public.investment_holdings
      add constraint investment_holdings_category_check
      check (category is null or category in (
        -- cashflow (10)
        'cuenta_remunerada','deposito_plazo','bono_gobierno','bono_empresa',
        'fondo_conservador','prestamo_interes','propiedad_alquiler','reit',
        'accion_dividendo','negocio_ingreso',
        -- growth (10)
        'accion_crecimiento','etf_crecimiento','indexado_global','roboadvisor',
        'propiedad_plusvalia','proyecto_inmobiliario','startup','compra_negocio',
        'cripto','alternativo'
      ));
  end if;

  if not exists (select 1 from pg_constraint where conname = 'investment_holdings_income_month_check') then
    alter table public.investment_holdings
      add constraint investment_holdings_income_month_check
      check (income_month is null or income_month between 1 and 12);
  end if;
end $$;
