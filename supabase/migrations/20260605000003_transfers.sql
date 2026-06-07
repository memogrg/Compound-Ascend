-- ============================================================
-- 0017 · Transferencias entre cuentas
-- Permite kind='transferencia' en transactions (neutro: NO cuenta como
-- ingreso ni gasto en los agregados, que filtran por 'ingreso'/'gasto').
-- ============================================================
do $$
declare c text;
begin
  -- Elimina cualquier CHECK existente sobre la columna kind.
  for c in
    select conname from pg_constraint
    where conrelid = 'public.transactions'::regclass
      and contype = 'c'
      and pg_get_constraintdef(oid) ilike '%kind%'
  loop
    execute format('alter table public.transactions drop constraint %I', c);
  end loop;

  alter table public.transactions
    add constraint transactions_kind_chk check (kind in ('ingreso', 'gasto', 'transferencia'));
end $$;
