-- ============================================================================
-- 20260907000002 · NOTAS ESTRUCTURADAS como tipo de activo
--
-- Una nota estructurada es un instrumento no cotizado (valuación manual) con
-- términos propios: emisor, subyacente, protección de capital, barrera, autocall.
--
-- ── LO QUE NO SE AGREGA, PORQUE YA EXISTE ───────────────────────────────────
--   capital invertido + moneda → quantity/average_cost + currency
--   fecha de inicio            → purchase_date
--   fecha de VENCIMIENTO       → maturity_date        (20260708000001)
--   tasa/cupón anual (%)       → annual_rate_pct      (20260706000001)
--   valor actual manual        → current_value_manual
--
--   frecuencia del cupón, retención y próximo pago → las columnas dividend_*
--   de 20260907000001. El cupón de una nota y el dividendo de una acción son el
--   MISMO cálculo (lo resuelve `lib/finance/rendimiento-periodico`), y un mismo
--   holding nunca es las dos cosas, así que comparten columnas en vez de
--   duplicar cinco y, con ellas, la proyección de ingreso pasivo y el
--   recordatorio de cobro. El prefijo `dividend_` queda como deuda de nombre;
--   lo que representan es "rendimiento periódico configurado".
--
-- ── OJO: EL CHECK DE asset_type NO ESTABA ACTIVO ────────────────────────────
-- Verificado contra producción: la base aceptaba un asset_type arbitrario. El
-- `create table` de 20260601000006 lo declara, pero la restricción no está
-- puesta (se habrá perdido en alguna aplicación manual). Se recrea acá CON el
-- valor nuevo, así que esta migración además tapa ese agujero de integridad.
--
-- Aplicación: manual por el SQL Editor; luego
--   supabase migration repair --status applied 20260907000002
-- ============================================================================

-- 1) asset_type: recrear el CHECK incluyendo 'nota_estructurada'.
alter table public.investment_holdings
  drop constraint if exists investment_holdings_asset_type_check;

alter table public.investment_holdings
  add constraint investment_holdings_asset_type_check
  check (asset_type in
    ('etf','accion','bono','fondo','certificado','inmueble','cripto',
     'negocio','pension','commodity','arte','nft','nota_estructurada','otro'));

-- 2) Términos propios de la nota. Columnas nullables (no un JSON opaco: se
--    filtran, se leen desde el asesor y entran en la lectura de riesgo).
alter table public.investment_holdings
  add column if not exists note_issuer text,
  add column if not exists note_underlying text,

  -- % del capital protegido al vencimiento. 100 = capital garantizado.
  add column if not exists note_capital_protection_pct numeric(5, 2)
    check (note_capital_protection_pct is null or
           (note_capital_protection_pct >= 0 and note_capital_protection_pct <= 100)),

  -- Barrera / knock-in: si el subyacente cae por debajo de este % del inicial,
  -- el capital queda expuesto. Nullable: no todas las notas tienen barrera.
  add column if not exists note_barrier_pct numeric(5, 2)
    check (note_barrier_pct is null or
           (note_barrier_pct >= 0 and note_barrier_pct <= 100)),

  add column if not exists note_autocall boolean not null default false,
  add column if not exists note_autocall_date date,

  -- Tasa de participación en la subida del subyacente. Puede superar 100%.
  add column if not exists note_participation_pct numeric(7, 2)
    check (note_participation_pct is null or note_participation_pct >= 0),

  add column if not exists note_isin text;

-- El vencimiento y la observación de autocall generan alertas por fecha
-- (price_alerts kind='vesting'); el barrido de creación las busca por acá.
create index if not exists idx_holdings_note_fechas
  on public.investment_holdings (maturity_date, note_autocall_date)
  where asset_type = 'nota_estructurada';
