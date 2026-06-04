-- ============================================================
-- 0015 · Indicadores económicos (BCCR + FRED)
-- ============================================================
--
-- Datos GLOBALES, no por usuario: son información macro compartida, no
-- personal. Por eso la tabla NO lleva user_id. Mismo patrón que
-- market_price_cache (ver 0006): RLS de solo lectura para autenticados,
-- escritura exclusiva del service-role (sin policy de write para usuarios).
--
-- La unicidad (indicator_code, observed_date) hace el refresh idempotente:
-- cada corrida del cron hace upsert y nunca duplica una observación.

create table public.economic_indicators (
  id             uuid primary key default gen_random_uuid(),
  indicator_code text not null,        -- "TBP", "USDCRC_VENTA", "FED_PRIME"...
  source         text not null,        -- "BCCR" | "FRED"
  value          numeric(24,8) not null,
  unit           text not null,        -- "percent" | "currency" | "index"
  observed_date  date not null,
  fetched_at     timestamptz not null default now(),
  unique (indicator_code, observed_date)
);

-- Lectura del histórico por código, más reciente primero.
create index idx_econ_ind_code_date on public.economic_indicators(indicator_code, observed_date desc);

alter table public.economic_indicators enable row level security;

-- Cualquier usuario autenticado puede leer los indicadores.
create policy econ_ind_read on public.economic_indicators
  for select to authenticated using (true);

-- Sin policy de INSERT/UPDATE/DELETE: la escritura solo ocurre vía service-role
-- (el cron de /api/indicators/refresh), que omite RLS por diseño.
