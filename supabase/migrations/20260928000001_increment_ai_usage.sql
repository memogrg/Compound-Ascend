-- Incremento ATÓMICO del ledger de consumo de IA.
--
-- Reemplaza el read-modify-write de src/lib/ai/usage.ts (select tokens_used -> upsert) por un
-- unico INSERT ... ON CONFLICT DO UPDATE, que Postgres serializa por fila con un lock. Bajo
-- concurrencia el camino viejo perdia incrementos (dos llamadas leian el mismo valor y una
-- pisaba a la otra); esta funcion suma exacto.
--
-- Aditiva: NO cambia el esquema de ai_usage_ledger (mismas columnas, mismo unique user_id+period).
-- Escritura solo para el backend service-role, en paridad con la politica actual (el ledger es
-- solo-lectura para el usuario; ver 20260601000008_ai.sql). El trigger set_updated_at ya existente
-- refresca updated_at en el camino de update.

create or replace function public.increment_ai_usage(
  p_user_id uuid,
  p_period date,
  p_tokens bigint,
  p_requests int default 1,
  p_cost numeric default 0
)
returns bigint
language sql
security definer
set search_path = public
as $$
  insert into public.ai_usage_ledger (user_id, period, tokens_used, requests, cost_est)
  values (p_user_id, p_period, greatest(p_tokens, 0), greatest(p_requests, 0), greatest(p_cost, 0))
  on conflict (user_id, period) do update
    set tokens_used = public.ai_usage_ledger.tokens_used + excluded.tokens_used,
        requests    = public.ai_usage_ledger.requests    + excluded.requests,
        cost_est    = public.ai_usage_ledger.cost_est    + excluded.cost_est
  returning tokens_used;
$$;

-- Solo el backend (service-role) puede incrementar el consumo. anon/authenticated tienen EXECUTE
-- por default privileges en Postgres, asi que hay que revocarlo explicito (no basta revoke from
-- public); ver el patron de purge_household / household_audit_coverage.
revoke all on function public.increment_ai_usage(uuid, date, bigint, int, numeric) from public;
revoke all on function public.increment_ai_usage(uuid, date, bigint, int, numeric) from anon;
revoke all on function public.increment_ai_usage(uuid, date, bigint, int, numeric) from authenticated;
grant execute on function public.increment_ai_usage(uuid, date, bigint, int, numeric) to service_role;
