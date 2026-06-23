-- Fase 0 · Saco de Liquidez ("Tu Liquidez"): stock real de dinero disponible.
-- Una fila = un movimiento de liquidez (apertura, transaccion, ajuste).
-- Saldo actual = SUM(delta) del hogar/usuario. RLS estándar dueño+hogar.
create table public.liquidity_ledger (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users(id) on delete cascade,
  household_id    uuid references public.households(id) on delete set null,
  delta           numeric(18,2) not null,
  currency        text not null,
  reason          text not null check (reason in ('apertura','transaccion','ajuste')),
  transaction_id  uuid references public.transactions(id) on delete cascade,
  occurred_on     date not null default now(),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

-- RLS estándar (dueño + hogar) + trigger updated_at + índices user/household/created.
select public.apply_user_data_policies(array['liquidity_ledger']);

create index if not exists idx_liquidity_ledger_user on public.liquidity_ledger(user_id, occurred_on);
-- Una fila de liquidez por transacción (permite upsert sobre transaction_id).
create unique index if not exists uq_liquidity_ledger_txn
  on public.liquidity_ledger(transaction_id) where transaction_id is not null;
