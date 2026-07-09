-- Agrega 'plan_inversion' al CHECK de category (faltó en la migración de P1).
-- Idempotente: drop + re-add.

alter table public.investment_holdings
  drop constraint if exists investment_holdings_category_check;

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
    'cripto','alternativo',
    -- plan a plazo (unit-linked)
    'plan_inversion'
  ));
