-- Delta 3b (#437): la tabla `investments` no guardaba la moneda del monto invertido.
-- `createInvestment`/`updateInvestment` descartaban `input.currency` al escribir y
-- `rowToInvestment` la falseaba como 'CRC' al leer, así que un investment en otra moneda se
-- contaba mal en el patrimonio (invested_amount se asumía en la principal).
--
-- Esta migración agrega la columna SIN default 'CRC' (un default re-hardcodearía el bug) y
-- backfillea a la PRIMARIA de cada dueño. La moneda original se descartó (irrecuperable), así
-- que el backfill es BEST-EFFORT: preserva el comportamiento actual (las filas legacy ya se
-- contaban como la principal) y el usuario corrige por fila editando (create/update ya persisten
-- la moneda resuelta a la principal).
--
-- SECUENCIA DE DEPLOY (crítica): correr este SQL en PROD **antes** de mergear el código que
-- lee/escribe la columna. La lectura es tolerante (columna nullable + `?? fallback`), pero la
-- escritura del código nuevo fallaría si la columna no existe.

-- 1) columna nullable, SIN default (no re-hardcodear CRC)
alter table public.investments
  add column if not exists currency char(3);

-- 2) backfill BF-1: la primaria del dueño (user_settings.primary_currency); 'CRC' solo si el
--    usuario no tiene una fijada.
update public.investments i
set currency = coalesce(
  (select us.primary_currency from public.user_settings us where us.user_id = i.user_id),
  'CRC'
)
where i.currency is null;

-- 3) (opcional, tras verificar el backfill) endurecer a NOT NULL: toda fila ya tiene moneda y
--    create/update la escriben resuelta. Dejar comentado para tolerar una ventana de deploy.
-- alter table public.investments alter column currency set not null;
