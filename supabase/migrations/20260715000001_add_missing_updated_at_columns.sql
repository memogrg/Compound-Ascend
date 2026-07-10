-- Reconcilia el schema con apply_user_data_policies (20260601000001_extensions_helpers.sql):
-- ese helper adjunta a cada tabla que registra un trigger
--   `BEFORE UPDATE ... EXECUTE FUNCTION set_updated_at()`  (fija NEW.updated_at)
-- y su contrato EXIGE que la tabla tenga columna `updated_at`. Cuatro tablas se
-- registraron con el helper pero se crearon SIN esa columna, así que cualquier
-- UPDATE reventaba con:
--   ERROR: record "new" has no field "updated_at"
--
-- Impacto real: en `dividends`, createDividend inserta la fila y luego hace un
-- UPDATE para enlazar la transacción vinculada (transaction_id) → ese UPDATE
-- fallaba y bloqueaba registrar dividendos en TODA la app (web y móvil). Las otras
-- tres (portfolio_snapshots, rental_payments, watchlist_symbols) tienen el mismo
-- defecto latente: hoy pocas o ninguna hace UPDATE, pero rompería igual.
--
-- Origen del faltante:
--   dividends, portfolio_snapshots  → 20260601000011_investment_engine.sql
--   rental_payments                 → 20260608000001_rental_assets.sql
--   watchlist_symbols               → 20260617000002_watchlist_symbols.sql
--
-- Aditivo e idempotente (add column if not exists). No borra ni reescribe datos:
-- las filas existentes reciben updated_at = momento de aplicar (no se habían podido
-- actualizar desde su created_at); las nuevas usan el default now().

alter table public.dividends           add column if not exists updated_at timestamptz not null default now();
alter table public.portfolio_snapshots add column if not exists updated_at timestamptz not null default now();
alter table public.rental_payments     add column if not exists updated_at timestamptz not null default now();
alter table public.watchlist_symbols   add column if not exists updated_at timestamptz not null default now();
