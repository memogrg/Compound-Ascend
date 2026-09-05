-- Conciliador de ingesta: un movimiento puede tener DOS fuentes (el recibo que
-- escaneó la persona y el aviso del banco que llegó después) sin quedar dos veces.
--
--  · transactions gana external_ref / card_last4 / bank_code: lo que trae el aviso
--    del banco. Se escriben al confirmar una propuesta y al "unir" una propuesta
--    con un movimiento que ya existía.
--  · ingest_proposals gana el estado 'merged' y merged_into: la propuesta no se
--    descartó, se fundió con ese movimiento.
--
-- Aditiva: se aplica ANTES del despliegue del código que la usa.

alter table public.transactions
  add column if not exists external_ref text,
  add column if not exists card_last4 text,
  add column if not exists bank_code text;

create index if not exists idx_transactions_external_ref
  on public.transactions(external_ref) where external_ref is not null;

alter table public.ingest_proposals
  drop constraint if exists ingest_proposals_status_check;
alter table public.ingest_proposals
  add constraint ingest_proposals_status_check
  check (status in ('pending', 'confirmed', 'discarded', 'merged'));

alter table public.ingest_proposals
  add column if not exists merged_into uuid references public.transactions(id) on delete set null;
