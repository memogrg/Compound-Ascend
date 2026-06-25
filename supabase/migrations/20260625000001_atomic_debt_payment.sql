-- ============================================================
-- 0025 (2026-06-25) · Atomicidad real en el pago de deuda (P0)
--
-- Antes, registrar/editar/borrar un pago hacía DOS escrituras secuenciales
-- (transactions + debt_payments) con compensación best-effort en TS. Si el
-- proceso moría entre ambas, o si un update fallaba a mitad, quedaban datos
-- inconsistentes (transacción huérfana, o pago editado con gasto viejo).
--
-- Estas funciones envuelven ambas escrituras en UNA transacción (cada función
-- plpgsql corre en su propia transacción) → atomicidad ACID real.
--
-- Diseño:
-- - La lógica de negocio (FX, reglas, categoría, split, household) sigue en TS:
--   TS construye los valores y se los pasa ya resueltos a estas RPC delgadas.
-- - SECURITY DEFINER para poder envolver la transacción, pero con verificación
--   explícita de `auth.uid()` en cada fila (la identidad manda; no se confía en
--   user_id enviado por el cliente: se fuerza al del token).
-- - `record_debt_payment` usa jsonb_populate_record para mapear las columnas
--   que existan en `transactions`/`debt_payments` (resiliente a cambios de
--   esquema). TS ya provee todas las columnas NOT NULL; aquí se fuerzan las
--   que controla la BD (id, user_id, created_at, updated_at, transaction_id).
--
-- Aditivo e idempotente (create or replace). No altera tablas ni datos.
-- ============================================================

-- ------------------------------------------------------------
-- 1) Alta atómica: inserta la transacción y el debt_payment ligados.
--    Devuelve { transaction_id, payment_id }.
-- ------------------------------------------------------------
create or replace function public.record_debt_payment(p_txn jsonb, p_payment jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_txn public.transactions;
  v_pay public.debt_payments;
begin
  if v_uid is null then
    raise exception 'No autenticado';
  end if;
  -- La identidad manda: el user_id enviado debe coincidir con el del token.
  if (p_txn->>'user_id')::uuid is distinct from v_uid then
    raise exception 'user_id de la transacción no coincide con el usuario autenticado';
  end if;
  if (p_payment->>'user_id')::uuid is distinct from v_uid then
    raise exception 'user_id del pago no coincide con el usuario autenticado';
  end if;

  -- Construye la fila de transacción desde el jsonb (ignora claves extra).
  v_txn := jsonb_populate_record(null::public.transactions, p_txn);
  -- Columnas controladas por la BD: nunca se confían del cliente.
  v_txn.id := gen_random_uuid();
  v_txn.user_id := v_uid;
  v_txn.created_at := now();
  v_txn.updated_at := now();
  insert into public.transactions select (v_txn).*;

  -- Construye la fila de pago y la liga a la transacción recién creada.
  v_pay := jsonb_populate_record(null::public.debt_payments, p_payment);
  v_pay.id := gen_random_uuid();
  v_pay.user_id := v_uid;
  v_pay.transaction_id := v_txn.id;
  v_pay.created_at := now();
  v_pay.updated_at := now();
  insert into public.debt_payments select (v_pay).*;

  return jsonb_build_object('transaction_id', v_txn.id, 'payment_id', v_pay.id);
end;
$$;

revoke all on function public.record_debt_payment(jsonb, jsonb) from public;
grant execute on function public.record_debt_payment(jsonb, jsonb) to authenticated;

-- ------------------------------------------------------------
-- 2) Edición atómica: actualiza el debt_payment y su transacción ligada
--    (monto = cuota + extra, fecha) en una sola transacción.
-- ------------------------------------------------------------
create or replace function public.update_debt_payment(
  p_payment_id   uuid,
  p_occurred_on  date,
  p_amount       numeric,
  p_extra_amount numeric,
  p_extra_mode   text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_txn uuid;
begin
  if v_uid is null then
    raise exception 'No autenticado';
  end if;

  select transaction_id into v_txn
  from public.debt_payments
  where id = p_payment_id and user_id = v_uid;
  if not found then
    raise exception 'Pago no encontrado';
  end if;

  update public.debt_payments
  set occurred_on  = p_occurred_on,
      amount       = p_amount,
      extra_amount = p_extra_amount,
      extra_mode   = p_extra_mode,
      updated_at   = now()
  where id = p_payment_id and user_id = v_uid;

  -- El gasto vinculado refleja el total (cuota + extra) y la fecha del pago.
  if v_txn is not null then
    update public.transactions
    set amount      = p_amount + p_extra_amount,
        occurred_on = p_occurred_on,
        updated_at  = now()
    where id = v_txn and user_id = v_uid;
  end if;
end;
$$;

revoke all on function public.update_debt_payment(uuid, date, numeric, numeric, text) from public;
grant execute on function public.update_debt_payment(uuid, date, numeric, numeric, text) to authenticated;

-- ------------------------------------------------------------
-- 3) Borrado atómico: elimina el debt_payment y su transacción ligada.
-- ------------------------------------------------------------
create or replace function public.delete_debt_payment(p_payment_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_txn uuid;
begin
  if v_uid is null then
    raise exception 'No autenticado';
  end if;

  select transaction_id into v_txn
  from public.debt_payments
  where id = p_payment_id and user_id = v_uid;
  if not found then
    raise exception 'Pago no encontrado';
  end if;

  delete from public.debt_payments where id = p_payment_id and user_id = v_uid;
  if v_txn is not null then
    delete from public.transactions where id = v_txn and user_id = v_uid;
  end if;
end;
$$;

revoke all on function public.delete_debt_payment(uuid) from public;
grant execute on function public.delete_debt_payment(uuid) to authenticated;
