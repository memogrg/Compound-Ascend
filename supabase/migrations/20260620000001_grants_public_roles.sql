-- ============================================================
-- 0020 (2026-06-20) · Grants del esquema public a los roles de Supabase
--
-- Las migraciones creaban las tablas sin conceder privilegios a los roles
-- anon / authenticated / service_role. En Supabase cloud esos grants los
-- aplica la plataforma por fuera de las migraciones, así que el problema
-- quedaba enmascarado; contra un stack levantado solo desde migraciones
-- (p. ej. el job E2E con `supabase start`) la app no podía leer ni escribir
-- ninguna tabla y el dashboard salía vacío. Esto replica los grants estándar
-- para que el esquema sea autocontenido y `supabase start` deje la app
-- operativa por sí solo. Ver issue #98.
--
-- La seguridad NO depende de estos grants: cada tabla tiene RLS (enable +
-- force) y las policies son la capa de autorización real. Conceder privilegios
-- de tabla es seguro — las filas siguen gobernadas por RLS. Las tablas internas
-- (audit_logs, security_events, ai_usage_ledger, ai_rate_limits) no tienen
-- policy de escritura para `authenticated`, así que siguen siendo de facto
-- solo-service-role pese al grant.
-- ============================================================

grant usage on schema public to anon, authenticated, service_role;

-- Objetos existentes.
grant all on all tables    in schema public to anon, authenticated, service_role;
grant all on all sequences in schema public to anon, authenticated, service_role;
grant all on all routines  in schema public to anon, authenticated, service_role;

-- Objetos futuros (creados por el rol que corre las migraciones): heredan el
-- grant, de modo que las próximas migraciones no necesiten repetirlo.
alter default privileges in schema public
  grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public
  grant all on sequences to anon, authenticated, service_role;
alter default privileges in schema public
  grant all on routines to anon, authenticated, service_role;
