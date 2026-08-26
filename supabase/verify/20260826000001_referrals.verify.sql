-- ============================================================
-- VERIFICACIÓN de 20260826000001_referrals.sql
--
-- Correr en el SQL Editor DESPUÉS de aplicar la migración y antes del
-- `supabase migration repair --status applied 20260826000001`.
-- Cada bloque imprime un veredicto; ninguno escribe datos de verdad.
--
-- Vive en supabase/verify/ y NO en supabase/migrations/ a propósito: comparte
-- el prefijo de versión con la migración, y el CLI la tomaría por una segunda
-- migración con la misma versión.
-- ============================================================

-- ------------------------------------------------------------
-- 1) Todos los perfiles tienen código, y son únicos
--    Esperado: total = con_codigo = codigos_distintos, largo_ok = total
-- ------------------------------------------------------------
select
  count(*)                                            as total,
  count(referral_code)                                as con_codigo,
  count(distinct referral_code)                       as codigos_distintos,
  count(*) filter (where referral_code ~ '^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{8}$') as largo_ok
from public.profiles;

-- ------------------------------------------------------------
-- 2) Ningún código contiene caracteres ambiguos (O/0/I/1/L)
--    Esperado: 0 filas
-- ------------------------------------------------------------
select id, referral_code
from public.profiles
where referral_code ~ '[O0I1L]';

-- ------------------------------------------------------------
-- 3) El generador produce códigos distintos (no es secuencial ni constante)
--    Esperado: 10 valores distintos
-- ------------------------------------------------------------
select count(distinct public.gen_referral_code()) as distintos_de_10
from generate_series(1, 10);

-- ------------------------------------------------------------
-- 4) La columna quedó NOT NULL + UNIQUE
--    Esperado: is_nullable = 'NO', y el índice único existe
-- ------------------------------------------------------------
select is_nullable
from information_schema.columns
where table_schema = 'public' and table_name = 'profiles' and column_name = 'referral_code';

select indexname
from pg_indexes
where schemaname = 'public' and tablename = 'profiles' and indexname = 'uq_profiles_referral_code';

-- ------------------------------------------------------------
-- 5) RLS activa en referrals y SIN políticas de escritura
--    Esperado: rowsecurity = true, y una sola política (SELECT)
-- ------------------------------------------------------------
select relrowsecurity as rls_activa, relforcerowsecurity as rls_forzada
from pg_class where oid = 'public.referrals'::regclass;

select policyname, cmd
from pg_policies
where schemaname = 'public' and tablename = 'referrals';

-- ------------------------------------------------------------
-- 6) Las restricciones que sostienen la idempotencia y el anti-auto-referido
--    Esperado: aparecen el UNIQUE de referred_user_id y el CHECK referrals_no_auto
-- ------------------------------------------------------------
select conname, contype, pg_get_constraintdef(oid) as definicion
from pg_constraint
where conrelid = 'public.referrals'::regclass
order by contype;

-- ------------------------------------------------------------
-- 7) El trigger de alta sigue entero y ahora pone el código
--    Esperado: el cuerpo menciona referral_code, user_settings y profiles
-- ------------------------------------------------------------
select
  prosrc like '%referral_code%'  as pone_codigo,
  prosrc like '%user_settings%'  as sigue_creando_settings,
  prosrc like '%profiles%'       as sigue_creando_perfil
from pg_proc where proname = 'handle_new_user';

-- ------------------------------------------------------------
-- 8) Prueba REAL de las reglas, en una transacción que se revierte.
--    Esperado: los tres bloques imprimen 'OK ...'; al final ROLLBACK, no queda nada.
-- ------------------------------------------------------------
begin;

do $$
declare
  a uuid;
  b uuid;
begin
  -- Dos usuarios cualesquiera que ya existan; si no hay dos, se salta.
  select id into a from public.profiles order by created_at limit 1;
  select id into b from public.profiles where id <> a order by created_at limit 1;
  if a is null or b is null then
    raise notice 'SALTADO: hacen falta 2 perfiles para probar las reglas';
    return;
  end if;

  -- a) auto-referido bloqueado por CHECK
  begin
    insert into public.referrals (referrer_user_id, referred_user_id) values (a, a);
    raise exception 'FALLO: se permitió el auto-referido';
  exception when check_violation then
    raise notice 'OK auto-referido bloqueado';
  end;

  -- b) una fila normal entra
  insert into public.referrals (referrer_user_id, referred_user_id) values (a, b);
  raise notice 'OK referido registrado';

  -- c) el mismo referido NO se cuenta dos veces (UNIQUE)
  begin
    insert into public.referrals (referrer_user_id, referred_user_id) values (a, b);
    raise exception 'FALLO: se duplicó el referido';
  exception when unique_violation then
    raise notice 'OK doble alta no duplica';
  end;

  -- d) el contador refleja la fila
  if (select count(*) from public.referrals where referrer_user_id = a) <> 1 then
    raise exception 'FALLO: el contador no da 1';
  end if;
  raise notice 'OK contador = 1';
end;
$$;

rollback;

-- ------------------------------------------------------------
-- 9) La consulta del equipo (la que documenta el PR)
--    Esperado: corre sin error; con datos nuevos, 0 filas.
-- ------------------------------------------------------------
select user_id, display_name, referral_code, referred_count, last_referral_at
from public.referral_counts
where referred_count > 0
order by referred_count desc, last_referral_at desc
limit 50;
