-- Deudas (Fase B.1): tipo de pago. 'ordinario' = cuota del mes (interés+capital);
-- 'extraordinario' = abono directo a capital (interés 0). Aditivo e idempotente.
alter table public.debt_payments
  add column if not exists kind text not null default 'ordinario'
    check (kind in ('ordinario', 'extraordinario'));
