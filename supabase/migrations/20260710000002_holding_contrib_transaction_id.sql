-- El gasto de aporte vive en `transactions`, no en `budget_items`.
-- Renombrar expense_item_id -> transaction_id y apuntar la FK a transactions.
-- Idempotente.

do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_name = 'holding_contributions' and column_name = 'expense_item_id'
  ) then
    alter table public.holding_contributions
      drop constraint if exists holding_contributions_expense_item_id_fkey;
    alter table public.holding_contributions
      rename column expense_item_id to transaction_id;
  end if;
end $$;

alter table public.holding_contributions
  drop constraint if exists holding_contributions_transaction_id_fkey;
alter table public.holding_contributions
  add constraint holding_contributions_transaction_id_fkey
  foreign key (transaction_id) references public.transactions(id) on delete set null;
