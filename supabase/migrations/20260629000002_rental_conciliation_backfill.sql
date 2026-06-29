-- ============================================================
-- Conciliación de renta (C-2b) — limpieza de datos existentes
-- ============================================================
-- Idempotente y re-ejecutable. La RE-ATRIBUCIÓN de las transacciones de renta
-- a su línea derivada (income_source_id) ocurre en RUNTIME al cargar cada
-- periodo: syncDerivedBudget → relinkRentalReceipts (best-effort, solo toca
-- transacciones con income_source_id null). Aquí solo hacemos los pasos puros
-- de datos que esa lógica necesita o que eliminan el duplicado heredado:
--
--   (1) Sembrar la proyección (rental_income/_frequency) en holdings de flujo
--       que tienen pagos pero aún no tienen proyección, para que la línea
--       derivada (y su barra "Recibido") exista al sincronizar el periodo.
--   (2) Eliminar el income_sources duplicado que se creaba POR pago (C-2b ya no
--       lo crea; la proyección la representa la línea derivada de C-2a). La FK
--       rental_payments.income_id es ON DELETE SET NULL, así que el borrado
--       limpia la referencia automáticamente.

-- (1) Siembra desde el pago más reciente por holding.
update public.investment_holdings h
set rental_income = p.amount,
    rental_frequency = coalesce(p.frequency, 'mensual')
from (
  select distinct on (holding_id) holding_id, amount, frequency
  from public.rental_payments
  order by holding_id, received_on desc
) p
where h.id = p.holding_id
  and h.nature = 'cashflow'
  and (h.rental_income is null or h.rental_income <= 0);

-- (2) Borra el income_sources por pago (1:1 con rental_payments.income_id).
delete from public.income_sources s
where s.id in (
  select income_id from public.rental_payments where income_id is not null
);

-- (3) Defensa explícita e idempotente: income_id nulo en los pagos (el ON
--     DELETE SET NULL del paso 2 ya lo hace; esto cubre cualquier rezagado).
update public.rental_payments
set income_id = null
where income_id is not null;
