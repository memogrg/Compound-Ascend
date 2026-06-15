-- Ingresos (Fase 3 · vínculo con Inversiones): un ingreso pasivo por renta o
-- dividendos crea un "stub" de inversión por completar, vinculado a la fuente.
-- Aditivo e idempotente.

-- La fuente de ingreso (línea budget_items income) enlaza su inversión. La
-- relación es bidireccional: holding -> fuentes = budget_items where holding_id.
alter table public.budget_items
  add column if not exists holding_id uuid
    references public.investment_holdings(id) on delete set null;

create index if not exists idx_budget_items_holding
  on public.budget_items (holding_id)
  where holding_id is not null;

-- Stub por completar: creado desde un ingreso pasivo, pendiente de detalle
-- (badge en nav + card "Pendientes de completar" en Inversiones).
alter table public.investment_holdings
  add column if not exists needs_detail boolean not null default false;

create index if not exists idx_holdings_needs_detail
  on public.investment_holdings (user_id)
  where needs_detail = true;
