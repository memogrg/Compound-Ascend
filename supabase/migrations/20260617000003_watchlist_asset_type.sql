-- ============================================================
-- watchlist_symbols.kind → asset_type (Monitor de Fondos)
-- ============================================================
-- Aditiva e idempotente: alinea el nombre de columna con el resto del esquema
-- (que usa asset_type). Solo renombra si 'kind' existe y 'asset_type' aún no, de
-- modo que correrla dos veces o sobre una BD ya migrada es un no-op. El CHECK
-- definido sobre la columna se conserva: Postgres actualiza la expresión del
-- constraint automáticamente al renombrar la columna.
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'watchlist_symbols' and column_name = 'kind'
  ) and not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'watchlist_symbols' and column_name = 'asset_type'
  ) then
    alter table public.watchlist_symbols rename column kind to asset_type;
  end if;
end $$;
