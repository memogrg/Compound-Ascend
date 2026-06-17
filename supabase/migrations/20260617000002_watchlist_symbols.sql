-- ============================================================
-- Watchlist de símbolos (Monitor de Fondos · Fase 4)
-- ============================================================
-- Aditiva. Símbolos que el usuario sigue en el Monitor de Fondos. RLS por
-- user_id (mismo helper que dividends/rental_payments); household_id compartido.

create table if not exists public.watchlist_symbols (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users(id) on delete cascade,
  household_id uuid references public.households(id) on delete set null,
  symbol       text not null,
  kind         text not null default 'stock' check (kind in ('stock', 'etf', 'crypto')),
  created_at   timestamptz not null default now(),
  unique (user_id, symbol)
);

create index if not exists idx_watchlist_user on public.watchlist_symbols(user_id);
create index if not exists idx_watchlist_household on public.watchlist_symbols(household_id);

-- RLS por user_id (mismo helper que el resto de tablas de datos del usuario).
select public.apply_user_data_policies(array['watchlist_symbols']);
