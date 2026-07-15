-- Gasto del frasco (off-budget): una transacción puede quedar excluida del
-- gasto del mes / free cashflow / actuals por categoría sin dejar de ser una
-- transacción real. Un consumo de una meta de ahorro nace con
-- counts_in_budget=false porque ya se contó al aportar; contarlo de nuevo sería
-- doble. Default true: todas las transacciones existentes y futuras siguen
-- contando en el presupuesto como hasta ahora.
alter table public.transactions
  add column if not exists counts_in_budget boolean not null default true;
