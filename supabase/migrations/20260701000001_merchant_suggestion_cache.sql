-- ============================================================
-- 0032 (2026-07-01) · Caché de sugerencias de sobre por (usuario, comercio)
--
-- La IA sugiere el sobre (categoría) de un comercio ACOTADO A LOS SOBRES DEL
-- PROPIO USUARIO (sin taxonomía canónica). Para ser token-frugal, cada comercio
-- cuesta a lo sumo 1 llamada de IA en su vida: el resultado (incluido "ninguno",
-- category_id null) se cachea por (user_id, merchant_norm normalizado).
--
-- Caché PERSONAL (no se comparte con el hogar): la decisión de sobre es del dueño.
-- RLS dueño. Aditivo e idempotente.
-- ============================================================

create table if not exists public.merchant_suggestion_cache (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users(id) on delete cascade,
  merchant_norm text not null,
  category_id   uuid references public.expense_categories(id) on delete set null,
  confidence    numeric(3,2),
  created_at    timestamptz not null default now(),
  unique (user_id, merchant_norm)
);

create index if not exists idx_merchant_suggestion_cache_user
  on public.merchant_suggestion_cache(user_id);

alter table public.merchant_suggestion_cache enable row level security;
alter table public.merchant_suggestion_cache force row level security;

-- Solo el dueño lee/escribe su caché de sugerencias.
create policy msc_sel on public.merchant_suggestion_cache
  for select using (user_id = auth.uid());
create policy msc_ins on public.merchant_suggestion_cache
  for insert with check (user_id = auth.uid());
create policy msc_upd on public.merchant_suggestion_cache
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy msc_del on public.merchant_suggestion_cache
  for delete using (user_id = auth.uid());
