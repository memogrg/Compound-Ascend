-- ============================================================
-- 20260803000001 · El pago de deuda alimenta el Saco de Liquidez (Trazabilidad Fase A)
--
-- Contexto: `record_debt_payment` / `update_debt_payment` (migración
-- 20260625000001) insertan la transacción + el debt_payment en UNA transacción
-- ACID, pero NUNCA escriben `liquidity_ledger`. Resultado: pagar una deuda no
-- baja "Tu Liquidez", aunque el tooltip ya lo promete.
--
-- Arreglo (Opción 1 — dentro de la RPC, SQL, atómico): estas funciones ahora
-- escriben también la fila de `liquidity_ledger` en la MISMA transacción de BD,
-- preservando la atomicidad ACID que ganamos en el P0. La regla de signo es la
-- misma tabla de verdad del cash que aplica `recordTransactionDelta` en TS:
-- un pago de deuda es un GASTO → delta = −amount.
--
--   delta          = −(monto de la transacción)   (gasto → baja el cash)
--   currency       = la de la transacción (= la de la deuda)
--   reason         = 'transaccion'
--   transaction_id = la txn recién creada
--   occurred_on    = la fecha del pago
--   household_id   = el del hogar (de la txn)
--
-- El BORRADO no se toca: `liquidity_ledger.transaction_id` tiene ON DELETE
-- CASCADE, así que `delete_debt_payment` (al borrar la txn) se lleva la fila.
--
-- `update_debt_payment` hace UPSERT por `transaction_id` (índice único
-- `uq_liquidity_ledger_txn`): si un pago viejo no tiene fila de liquidez, la
-- crea al editarse (back-fill on-touch).
--
-- Aditivo e idempotente (create or replace). No altera tablas ni datos.
-- ============================================================

-- ------------------------------------------------------------
-- 1) Alta atómica: transacción + debt_payment + fila de liquidez.
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

  -- Saco de Liquidez: el pago es un GASTO → baja el cash por su monto. En la
  -- misma transacción ACID (nunca queda un pago sin su movimiento de liquidez).
  insert into public.liquidity_ledger
    (user_id, household_id, delta, currency, reason, transaction_id, occurred_on)
  values
    (v_uid, v_txn.household_id, -v_txn.amount, v_txn.currency,
     'transaccion', v_txn.id, v_txn.occurred_on);

  return jsonb_build_object('transaction_id', v_txn.id, 'payment_id', v_pay.id);
end;
$$;

revoke all on function public.record_debt_payment(jsonb, jsonb) from public;
grant execute on function public.record_debt_payment(jsonb, jsonb) to authenticated;

-- ------------------------------------------------------------
-- 2) Edición atómica: debt_payment + su transacción + su fila de liquidez.
--    UPSERT por transaction_id → cubre pagos viejos sin fila de liquidez.
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
  v_total numeric := p_amount + p_extra_amount;
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
    set amount      = v_total,
        occurred_on = p_occurred_on,
        updated_at  = now()
    where id = v_txn and user_id = v_uid;

    -- Saco de Liquidez: re-sincroniza el delta (−total) y la fecha. UPSERT por
    -- transaction_id: si el pago es viejo y no tenía fila, se crea aquí.
    update public.liquidity_ledger
    set delta       = -v_total,
        occurred_on = p_occurred_on,
        updated_at  = now()
    where transaction_id = v_txn;

    if not found then
      insert into public.liquidity_ledger
        (user_id, household_id, delta, currency, reason, transaction_id, occurred_on)
      select t.user_id, t.household_id, -v_total, t.currency,
             'transaccion', t.id, p_occurred_on
      from public.transactions t
      where t.id = v_txn and t.user_id = v_uid;
    end if;
  end if;
end;
$$;

revoke all on function public.update_debt_payment(uuid, date, numeric, numeric, text) from public;
grant execute on function public.update_debt_payment(uuid, date, numeric, numeric, text) to authenticated;

-- ------------------------------------------------------------
-- 3) (OPCIONAL) Back-fill de pagos de deuda HISTÓRICOS sin fila de liquidez.
--
--    Los pagos creados ANTES de esta migración no tienen fila de liquidez y no
--    se reflejan en "Tu Liquidez" hasta que se editen. Este bloque reconstruye
--    esas filas (idempotente: solo inserta las que faltan).
--
--    ⚠️ CUIDADO: al correrlo, "Tu Liquidez" BAJARÁ por la suma de todos los
--    pagos de deuda históricos. Es correcto (ese dinero salió), pero si el saldo
--    de apertura se fijó DESPUÉS de esos pagos, los estarías contando dos veces.
--    Descoméntalo solo si el saldo de apertura es ANTERIOR a esos pagos (o no
--    hay apertura). Memo decide al correr el SQL.
--
-- insert into public.liquidity_ledger
--   (user_id, household_id, delta, currency, reason, transaction_id, occurred_on)
-- select t.user_id, t.household_id, -t.amount, t.currency,
--        'transaccion', t.id, t.occurred_on
-- from public.debt_payments p
-- join public.transactions t on t.id = p.transaction_id
-- where p.transaction_id is not null
--   and not exists (
--     select 1 from public.liquidity_ledger l where l.transaction_id = t.id
--   );
