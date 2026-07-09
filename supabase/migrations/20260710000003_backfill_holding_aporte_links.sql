-- ============================================================
-- (2026-07-10) · Backfill: vincular aportes/compras de inversión huérfanos
--
-- Antes de Fase 4.1 (2026-06-10, commit c079aa6) algunos gastos de inversión
-- ("Aporte — X", "Compra — X") nacieron con linked_kind='none'. La barra
-- "aportado" de Libertad Financiera solo cuenta transactions con
-- linked_kind='holding', así que esos aportes no sumaban en el frasco.
-- Este backfill los vincula. El camino de escritura actual ya nace vinculado
-- (holdingPurchaseToTxn → linked_kind='holding'), así que esto es one-shot para
-- datos previos; no hay bug de código que arreglar.
--
-- Idempotente: solo toca filas con linked_kind='none'/null. Dos señales, la
-- fiable primero:
--   A) Backlink directo: holding_contributions.transaction_id → holding_id.
--      Cero ambigüedad (cubre DCA/prima/adelanto pre-4.1).
--   B) Heurística acotada: gasto sin vincular que parece de inversión (categoría
--      'inversiones' o descripción "Verbo — …") cuyo merchant_or_source coincide
--      con EXACTAMENTE UN holding del usuario. Las coincidencias ambiguas (0 ó
--      >1 holdings) se dejan a la conciliación manual (UI de reconciliación, que
--      ya las ofrece con 1 tap porque la categoría 'inversiones' es linked_kind).
--
-- SECURITY: se corre como service-role (SQL Editor). Filtra por user_id en cada
-- join para no cruzar datos entre usuarios/hogares.
-- ============================================================

-- A) Backlink fiable por holding_contributions (cero ambigüedad).
update public.transactions t
set linked_kind = 'holding', linked_id = hc.holding_id, updated_at = now()
from public.holding_contributions hc
where hc.transaction_id = t.id
  and hc.user_id = t.user_id
  and coalesce(t.linked_kind, 'none') = 'none';

-- B) Coincidencia ÚNICA por merchant dentro de gastos que parecen de inversión.
with inv_cat as (
  select id from public.expense_categories where key = 'inversiones'
),
matches as (
  select t.id                as txn_id,
         (array_agg(h.id))[1] as holding_id,  -- uuid: no hay min(uuid); con n_match=1 es el único
         count(*)             as n_match
    from public.transactions t
    join public.investment_holdings h
      on h.user_id = t.user_id
     and coalesce(h.label, h.symbol) = t.merchant_or_source
   where coalesce(t.linked_kind, 'none') = 'none'
     and t.kind = 'gasto'
     and t.merchant_or_source is not null
     and ( t.category_id in (select id from inv_cat)
        or t.description like 'Compra — %'
        or t.description like 'Aporte — %'
        or t.description like 'Prima — %'
        or t.description like 'Adelanto — %' )
   group by t.id
)
update public.transactions t
set linked_kind = 'holding', linked_id = m.holding_id, updated_at = now()
from matches m
where t.id = m.txn_id
  and m.n_match = 1;      -- solo cuando hay exactamente un holding candidato
