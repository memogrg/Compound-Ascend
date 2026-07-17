-- Meta de ahorro de la prima de un seguro (Defensa), vinculada a su póliza.
-- Un ahorro puede apuntar a la insurance_policy que financia (o quedar sin
-- póliza mientras se ahorra la prima → estado "en progreso"). Aditiva y
-- nullable: no afecta metas existentes. on delete set null: borrar la póliza no
-- rompe el ahorro (queda como "en progreso").
alter table public.savings_goals
  add column if not exists policy_id uuid
    references public.insurance_policies(id) on delete set null;
