-- ============================================================
-- Dividendos (conciliación) — limpieza del income_sources LEGADO
-- ============================================================
-- Espejo de lo que el backfill de renta (20260629000002) ya hizo para
-- rental_payments. Tras #196, createDividend ya no inserta un income_sources por
-- pago (la proyección la representa la línea derivada source_kind='dividend' y la
-- barra "Recibido" se llena por transactions.income_source_id). Pero los
-- dividendos creados ANTES de #196 dejaron una fila income_sources por pago
-- (dividends.income_id), que duplica en el panel de fuentes. Esto las elimina.
--
-- La FK dividends.income_id es ON DELETE SET NULL → el borrado limpia la
-- referencia automáticamente. Idempotente y re-ejecutable.

delete from public.income_sources s
where s.id in (
  select income_id from public.dividends where income_id is not null
);

-- Defensa explícita e idempotente (el ON DELETE SET NULL de arriba ya lo hace).
update public.dividends
set income_id = null
where income_id is not null;
