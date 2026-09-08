-- ============================================================================
-- 20260908000001 · La nota estructurada también vive en FLUJO DE CAJA
--
-- Una nota puede pagar cupón periódico (flujo) o acumular hasta el vencimiento
-- (crecimiento). Es el MISMO instrumento —mismos términos, misma lectura de
-- riesgo, mismo `asset_type`—, así que se resuelve con dos CATEGORÍAS y no con
-- un tipo de activo nuevo. La categoría es catálogo en código; lo único que hay
-- que tocar en la base son dos CHECK.
--
-- ── OJO: 'nota_estructurada' NUNCA ENTRÓ AL CHECK DE CATEGORY ───────────────
-- 20260907000002 agregó el asset_type pero NO la categoría, y el CHECK de
-- category (20260713000003) sigue sin conocerla. Si esa restricción está activa,
-- guardar una nota desde el wizard viene fallando desde entonces. Verificado
-- read-only: hoy hay 0 filas con esa categoría o ese asset_type, así que no hay
-- datos que reparar — sólo el agujero. Esta migración lo cierra de paso.
--
-- ── 'al_vencimiento' NO ES UNA FRECUENCIA ──────────────────────────────────
-- Se guarda en la misma columna `payout_frequency` porque describe lo mismo
-- (cuándo se cobra), pero deliberadamente NO es una `FrecuenciaPago`:
-- `esFrecuenciaPago('al_vencimiento')` es false, y de ahí sale gratis que un
-- pago único NO se proyecte como ingreso mensual en el presupuesto derivado ni
-- en el recordatorio de cobro. Su aviso ya existe: el vencimiento genera una
-- alerta por fecha (`price_alerts kind='vesting'`) desde 20260907000002.
--
-- Aplicación: manual por el SQL Editor; luego
--   supabase migration repair --status applied 20260908000001
-- ============================================================================

-- 1) category: agrega la nota (que faltaba) y su variante de flujo.
alter table public.investment_holdings
  drop constraint if exists investment_holdings_category_check;

alter table public.investment_holdings
  add constraint investment_holdings_category_check
  check (category is null or category in (
    -- cashflow (11)
    'cuenta_remunerada','deposito_plazo','bono_gobierno','bono_empresa',
    'nota_estructurada_flujo',
    'fondo_conservador','prestamo_interes','propiedad_alquiler','reit',
    'accion_dividendo','negocio_ingreso',
    -- growth (12)
    'accion_crecimiento','etf_crecimiento','indexado_global','roboadvisor',
    'propiedad_plusvalia','proyecto_inmobiliario','startup','compra_negocio',
    'cripto','alternativo','nota_estructurada',
    -- plan a plazo (unit-linked)
    'plan_inversion'
  ));

-- 2) payout_frequency: suma el pago único al vencimiento.
--    El CHECK conserva su nombre viejo (`..._dividend_frequency_check`): lo puso
--    20260907000001 y el rename de 20260907000003 no renombra restricciones.
alter table public.investment_holdings
  drop constraint if exists investment_holdings_dividend_frequency_check;

alter table public.investment_holdings
  add constraint investment_holdings_dividend_frequency_check
  check (payout_frequency is null or payout_frequency in
    ('mensual','bimensual','trimestral','cuatrimestral','semestral','anual',
     'al_vencimiento'));
