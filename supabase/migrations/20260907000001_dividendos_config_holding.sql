-- ============================================================================
-- 20260907000001 · Configuración de DIVIDENDOS a nivel del holding
--
-- Hoy el dividendo sólo existe como pago suelto: se registra a mano en el detalle
-- y el modo "yield" vive como estado local del formulario, sin persistirse. No
-- hay forma de decir "esta posición paga dividendos" al darla de alta.
--
-- Estas columnas guardan esa configuración. De ahí salen tres cosas:
--   · la vista previa en vivo del alta (bruto → neto → neto/mes);
--   · la proyección de INGRESO PASIVO, vía la línea derivada del presupuesto
--     (source_kind='dividend'), que hoy usa el promedio de los últimos 12 meses
--     y pasa a usar la config cuando el holding la tenga;
--   · el recordatorio de cobro en la fecha de pago.
--
-- NOTA SOBRE LA FRECUENCIA: se usa 'bimensual', NO 'bimestral'. Es la grafía que
-- conocen los factores de `monthlyize`, de los que sale el mensualizado. Dos
-- grafías para lo mismo harían fallar el lookup en silencio (factor 0 → la
-- proyección daría cero sin error). La etiqueta que ve el usuario ya dice
-- "Cada 2 meses (bimestral)" desde #740; lo que se guarda es 'bimensual'.
--
-- La RETENCIÓN es un dato del USUARIO (lo que ve en su estado de cuenta), no una
-- tasa que el producto afirme. Default 0 = no se asume ninguna.
--
-- Aplicación: manual por el SQL Editor; luego
--   supabase migration repair --status applied 20260907000001
-- ============================================================================

alter table public.investment_holdings
  add column if not exists pays_dividends boolean not null default false,

  -- 'yield'  = % anual sobre el valor (actual si cotiza, invertido si no)
  -- 'manual' = monto BRUTO fijo por pago
  add column if not exists dividend_mode text
    check (dividend_mode is null or dividend_mode in ('yield', 'manual')),

  add column if not exists dividend_yield_pct numeric(7, 4)
    check (dividend_yield_pct is null or dividend_yield_pct >= 0),

  add column if not exists dividend_amount numeric(18, 2)
    check (dividend_amount is null or dividend_amount >= 0),

  add column if not exists dividend_frequency text
    check (dividend_frequency is null or dividend_frequency in
      ('mensual', 'bimensual', 'trimestral', 'cuatrimestral', 'semestral', 'anual')),

  -- Retención de impuestos en %, acotada: fuera de [0,100] daría un neto
  -- negativo o mayor al bruto.
  add column if not exists dividend_withholding_pct numeric(5, 2) not null default 0
    check (dividend_withholding_pct >= 0 and dividend_withholding_pct <= 100),

  -- Ancla del próximo pago. Misma idea que recurring_items.next_date en los
  -- ingresos multi-mes: fija la FASE, y de ahí se derivan los pagos siguientes.
  add column if not exists dividend_next_date date;

-- El recordatorio de cobro barre por (pays_dividends, dividend_next_date): sin
-- índice sería un seq scan de toda la tabla en cada corrida del cron.
create index if not exists idx_holdings_dividend_next
  on public.investment_holdings (dividend_next_date)
  where pays_dividends;
