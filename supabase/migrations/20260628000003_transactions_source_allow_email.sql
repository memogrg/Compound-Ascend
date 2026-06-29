-- ============================================================
-- 0030 (2026-06-28) · transactions.source admite 'email'
--
-- Las propuestas de ingesta por correo, al confirmarse (WhatsApp o la bandeja
-- "Por revisar"), crean la transacción con origin='imported' y source='email'.
-- El CHECK original (migración 0004) solo permitía ('manual','chat','receipt',
-- 'recurring'), así que el insert fallaba con 23514. Esto amplía el CHECK para
-- incluir 'email'. Aditivo e idempotente.
--
-- NOTA: ya aplicada en la BB.DD. por otro medio; este archivo va al repo solo
-- para mantener el historial (no re-ejecutar).
-- ============================================================

alter table public.transactions drop constraint if exists transactions_source_check;

alter table public.transactions
  add constraint transactions_source_check
  check (source in ('manual', 'chat', 'receipt', 'recurring', 'email'));
