-- ============================================================
-- 20260826000002 · HOTFIX de 20260826000001 — search_path de los generadores
--
-- SÍNTOMA: tras aplicar 000001, NINGÚN usuario podía registrarse.
-- `auth.admin.createUser` devolvía 500 "Database error creating new user" y el
-- job E2E del CI fallaba en el seed.
--
-- CAUSA: `handle_new_user` es SECURITY DEFINER con `set search_path = public`
-- (así estaba desde la migración 0001, y con razón: fija el esquema para no
-- depender del search_path de quien dispare el trigger). Una función llamada
-- desde ahí HEREDA ese search_path si no declara el suyo. `gen_referral_code`
-- no lo declaraba y usa `gen_random_bytes`, que pertenece a pgcrypto — y en
-- Supabase las extensiones NO viven en `public`, sino en `extensions`. Con
-- search_path = public, la función no existe → excepción → el INSERT en
-- auth.users se revierte entero → no hay alta.
--
-- POR QUÉ NO SE VIO ANTES:
--  · El backfill de 000001 SÍ funcionó (los códigos existen) porque corre en la
--    sesión del SQL Editor, cuyo search_path sí incluye `extensions`. Misma
--    función, distinto contexto, distinto resultado.
--  · El job "Migraciones aplican en BD fresca" pasó porque en una base vacía el
--    bucle del backfill no tiene filas que recorrer: la función se define pero
--    nunca se EJECUTA. Aplicar una migración no es ejercitarla.
--
-- ARREGLO: cada generador declara su propio search_path incluyendo `extensions`.
-- Se listan los dos esquemas (`public, extensions`) en vez de calificar
-- `extensions.gen_random_bytes`, para que funcione igual si en algún entorno
-- pgcrypto estuviera instalado en `public`.
--
-- Idempotente: re-ejecutable sin efectos colaterales.
-- ============================================================

create or replace function public.gen_referral_code()
returns text
language plpgsql
volatile
-- LA LÍNEA DEL ARREGLO. Sin ella, esta función hereda el search_path del
-- llamador y deja de encontrar gen_random_bytes dentro del trigger de alta.
set search_path = public, extensions
as $$
declare
  alphabet constant text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; -- 31 chars
  len      constant int  := 8;
  bytes    bytea;
  out      text := '';
  i        int;
begin
  bytes := gen_random_bytes(len);
  for i in 0..len - 1 loop
    -- get_byte da 0-255; el módulo sesga levemente hacia los primeros símbolos
    -- (256 no es múltiplo de 31). El sesgo es < 0,4% por carácter y no afecta
    -- ni la unicidad ni la inenumerabilidad a esta escala.
    out := out || substr(alphabet, (get_byte(bytes, i) % length(alphabet)) + 1, 1);
  end loop;
  return out;
end;
$$;

create or replace function public.gen_unique_referral_code()
returns text
language plpgsql
volatile
set search_path = public, extensions
as $$
declare
  candidate text;
  i         int;
begin
  for i in 1..10 loop
    candidate := public.gen_referral_code();
    if not exists (select 1 from public.profiles where referral_code = candidate) then
      return candidate;
    end if;
  end loop;
  return public.gen_referral_code() || public.gen_referral_code();
end;
$$;

-- ------------------------------------------------------------
-- Verificación en el acto: simula lo que hace el trigger.
--
-- Fija search_path = public (lo que impone handle_new_user) y llama al
-- generador. Antes del arreglo esto lanzaba; ahora tiene que devolver un código
-- de 8 caracteres del alfabeto. Si falla, la migración falla y no queda a medias.
-- ------------------------------------------------------------
do $$
declare
  code text;
begin
  perform set_config('search_path', 'public', true);
  code := public.gen_unique_referral_code();
  if code !~ '^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{8}$' then
    raise exception 'El generador devolvió un código inesperado: %', code;
  end if;
  raise notice 'OK generador operativo con search_path = public (código de prueba: %)', code;
end;
$$;
