-- Tipo de ahorro: 'meta' (con objetivo, como hasta hoy) o 'sobre' (acumulador
-- puro, sin meta ni recurrencia). Defensa se sigue detectando por goal_type
-- ('defensa:*') y es kind='meta'. Default 'meta' → no afecta metas existentes.
alter table public.savings_goals
  add column if not exists kind text not null default 'meta'
    check (kind in ('meta','sobre'));

-- Un sobre no tiene meta: target_amount pasa a nullable (null = sin objetivo).
-- Las metas existentes conservan su valor; el progreso ya guarda target > 0.
alter table public.savings_goals
  alter column target_amount drop not null;
