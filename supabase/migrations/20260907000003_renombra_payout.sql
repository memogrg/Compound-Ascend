-- ============================================================================
-- 20260907000003 · dividend_* → payout_*
--
-- Las columnas nacieron en 20260907000001 pensando sólo en dividendos de
-- acciones/ETF. Al sumar las notas estructuradas (20260907000002) quedó claro
-- que representan algo más general: RENDIMIENTO PERIÓDICO CONFIGURADO — el
-- dividendo de una acción y el cupón de una nota son el mismo cálculo, lo
-- resuelve el mismo motor (`lib/finance/rendimiento-periodico`) y alimentan la
-- misma proyección de ingreso pasivo y el mismo recordatorio de cobro.
--
-- Dejarlas con prefijo `dividend_` obligaba a que el código de notas leyera
-- columnas llamadas "dividendo". Se renombran antes de que haya datos: hoy
-- ninguna fila tiene la configuración puesta, así que el cambio es sólo de
-- nombre y no hay backfill que hacer.
--
-- `rename column` conserva los CHECK y sus expresiones. Los NOMBRES de esas
-- restricciones siguen diciendo `..._dividend_..._check` (Postgres no los
-- renombra solo); es cosmético y no se tocan para no arriesgar el drop/add de
-- una restricción que ya está funcionando.
--
-- Aplicación: manual por el SQL Editor; luego
--   supabase migration repair --status applied 20260907000003
-- ============================================================================

alter table public.investment_holdings rename column pays_dividends to payout_enabled;
alter table public.investment_holdings rename column dividend_mode to payout_mode;
alter table public.investment_holdings rename column dividend_yield_pct to payout_rate_pct;
alter table public.investment_holdings rename column dividend_amount to payout_amount;
alter table public.investment_holdings rename column dividend_frequency to payout_frequency;
alter table public.investment_holdings
  rename column dividend_withholding_pct to payout_withholding_pct;
alter table public.investment_holdings rename column dividend_next_date to payout_next_date;

-- El índice parcial del recordatorio de cobro apuntaba a los nombres viejos.
drop index if exists idx_holdings_dividend_next;
create index if not exists idx_holdings_payout_next
  on public.investment_holdings (payout_next_date)
  where payout_enabled;
