-- Alertas de precio para inversiones cotizadas (ETF/acciones/cripto).
-- El usuario fija un precio objetivo + dirección (above/below); un cron compara el precio
-- de mercado y avisa al cruzar. Solo aplica a símbolos con precio (asset_type cotizable).
-- one_shot: se desactiva al dispararse (no re-avisa). RLS estándar (dueño + hogar).

create table if not exists public.price_alerts (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users(id) on delete cascade,
  household_id  uuid references public.households(id) on delete set null,
  -- nullable: la alerta puede ser por símbolo suelto (watchlist), no atada a un holding.
  holding_id    uuid references public.investment_holdings(id) on delete cascade,
  symbol        text not null,
  asset_type    text not null check (asset_type in ('etf','accion','cripto')),
  target_price  numeric(24,8) not null check (target_price > 0),
  currency      char(3) not null default 'USD',
  direction     text not null check (direction in ('above','below')),
  active        boolean not null default true,
  one_shot      boolean not null default true,
  triggered_at  timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- El cron barre por (active) y agrupa por (symbol) → índices dedicados.
create index if not exists idx_price_alerts_active on public.price_alerts (active) where active;
create index if not exists idx_price_alerts_symbol on public.price_alerts (symbol);

-- RLS estándar del repo (SELECT miembros del hogar; INSERT dueño; UPDATE/DELETE dueño o
-- editor del hogar) + trigger updated_at + índices user/household/created. drop-if-exists
-- de las políticas antes, para que la aplicación manual + repair sea re-ejecutable sin drift.
drop policy if exists price_alerts_sel on public.price_alerts;
drop policy if exists price_alerts_ins on public.price_alerts;
drop policy if exists price_alerts_upd on public.price_alerts;
drop policy if exists price_alerts_del on public.price_alerts;
select public.apply_user_data_policies(array['price_alerts']);
