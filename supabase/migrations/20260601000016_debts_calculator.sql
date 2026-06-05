-- ============================================================
-- 0016 · Calculadora de deudas — campos de amortización y pagos
-- ============================================================
-- No destructiva: solo agrega columnas (add column if not exists). La RLS por
-- user_id de debts y debt_payments ya existe (migración 0005).

-- Extiende debts con los campos de la calculadora/amortización.
alter table public.debts
  add column if not exists original_amount numeric(18,2),                       -- monto original (barra de progreso)
  add column if not exists rate_type       text check (rate_type in ('fija','variable')),
  add column if not exists rate_index       text check (rate_index in ('prime','tbp','tri')),
  add column if not exists rate_spread      numeric(6,3),                        -- margen sumado al índice
  add column if not exists term_months      int,                                 -- plazo total en meses
  add column if not exists start_date       date,
  add column if not exists extra_monthly    numeric(18,2),                       -- pago extra mensual opcional
  add column if not exists insurance        numeric(18,2),                       -- seguro mensual opcional
  add column if not exists notes            text;

-- Extiende debt_payments (ya existe con amount/principal/interest/occurred_on)
-- con el pago extra reportado y qué reduce (tiempo o cuota).
alter table public.debt_payments
  add column if not exists extra_amount numeric(18,2) not null default 0,
  add column if not exists extra_mode   text check (extra_mode in ('tiempo','cuota'));
