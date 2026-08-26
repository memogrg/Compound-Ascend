-- ============================================================
-- 20260826000003 · referral_code con DEFAULT
--
-- SÍNTOMA: tras 20260826000001, el seed del E2E dejó de marcar
-- `onboarding_completed`, /dashboard empezó a redirigir a /bienvenida y el smoke
-- falló de forma determinista. El seed hace un upsert sobre `profiles` sin
-- `referral_code` y recibía 23502 (not_null_violation) — que además descartaba
-- en silencio, así que el fallo aparecía cinco pasos más adelante y disfrazado.
--
-- CAUSA: 000001 dejó la columna NOT NULL y SIN default. El código lo pone el
-- trigger `handle_new_user`, así que toda alta que pase por auth.users está
-- cubierta... pero cualquier otro camino que inserte en `profiles` sin nombrar
-- la columna revienta. Y ese INSERT falla incluso cuando la fila YA EXISTE: en
-- `insert ... on conflict do update`, Postgres valida las restricciones de la
-- tupla PROPUESTA antes de detectar el conflicto, así que un upsert de rutina
-- —el patrón normal para "asegurá esta fila"— quedó roto para toda la tabla.
--
-- ARREGLO: darle un DEFAULT. `gen_unique_referral_code()` es VOLATILE, así que
-- se evalúa POR FILA en cada INSERT (a diferencia del backfill de 000001, donde
-- el default habría dado el mismo valor a todas). El trigger sigue poniéndolo
-- explícitamente; esto es la red para todos los demás caminos.
--
-- No cambia ninguna fila existente: un DEFAULT solo aplica a inserciones que
-- OMITEN la columna.
--
-- Idempotente: re-ejecutable sin efectos colaterales.
-- ============================================================

alter table public.profiles
  alter column referral_code set default public.gen_unique_referral_code();

-- ------------------------------------------------------------
-- Verificación en el acto: reproduce el upsert que rompía.
--
-- Inserta un perfil SIN referral_code sobre un id inexistente, comprueba que la
-- fila recibió un código válido, y revierte. Si volviera el 23502, la migración
-- falla acá en vez de dejar el problema para el próximo CI.
--
-- Se hace sobre auth.users con un id sintético dentro de una subtransacción que
-- SIEMPRE se revierte, para no depender de que exista un usuario de prueba.
-- ------------------------------------------------------------
do $$
declare
  fake_id constant uuid := '00000000-0000-4000-8000-000000000001';
  code    text;
begin
  begin
    -- La FK a auth.users obliga a crear el usuario primero; todo se revierte.
    insert into auth.users (id, instance_id, aud, role, email)
    values (fake_id, '00000000-0000-0000-0000-000000000000', 'authenticated',
            'authenticated', 'verificacion-000003@invalido.local')
    on conflict (id) do nothing;

    -- El trigger ya habrá creado el perfil; lo borramos para probar el INSERT
    -- desnudo, que es el camino que fallaba.
    delete from public.profiles where id = fake_id;

    insert into public.profiles (id, display_name, onboarding_completed)
    values (fake_id, 'Verificación 000003', true);

    select referral_code into code from public.profiles where id = fake_id;
    if code !~ '^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{8}$' then
      raise exception 'El DEFAULT no generó un código válido: %', code;
    end if;
    raise notice 'OK insert sin referral_code recibe código por DEFAULT (%).', code;

    -- Revierte TODO lo de este bloque.
    raise exception 'rollback_de_verificacion';
  exception
    when others then
      if sqlerrm = 'rollback_de_verificacion' then
        raise notice 'OK verificación revertida, no quedó nada.';
      else
        raise;
      end if;
  end;
end;
$$;
