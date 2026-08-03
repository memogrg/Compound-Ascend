-- ============================================================
-- 20260809000001 · El par usuario+asistente deja de compartir created_at
--
-- Los dos lados de un turno se insertan en UN solo statement (appendChatMessages,
-- appendTurns). Con `default now()` las dos filas quedan con el MISMO instante, porque now()
-- es el timestamp de la TRANSACCIÓN, no del row. Consecuencia: `order by created_at` no puede
-- desempatar dentro del par y el orden lo termina decidiendo el plan de ejecución.
--
-- Hoy sale bien de casualidad (el scan descendente del índice devuelve los empates en orden
-- inverso de inserción, que al invertirse queda correcto). "De casualidad" no es un contrato:
-- un VACUUM que reubique tuplas, un plan distinto o un índice nuevo lo cambian sin aviso.
--
-- Dos tablas, el mismo defecto y el mismo origen:
--   - chat_messages        → el hilo que LEE el usuario (podría ver la respuesta antes de la
--                            pregunta) y el emparejado de una cita con su respuesta.
--   - ai_conversation_turns → la memoria rodante que se le INYECTA al LLM (WhatsApp). Acá es
--                            peor: el modelo vería su propia respuesta antes de la pregunta.
--
-- clock_timestamp() en vez de now(): es VOLÁTIL y se evalúa una vez POR FILA, así que un
-- INSERT ... VALUES (a),(b) le da a cada una su microsegundo real, en orden de inserción. Se
-- resuelve del lado de la BD a propósito: estampar desde la app metería el reloj de Vercel
-- contra el de Postgres, y una deriva de un segundo ordenaría un mensaje nuevo ANTES de uno
-- viejo — peor que el empate que se está arreglando.
--
-- Aditivo (solo cambia un DEFAULT; nada que reescribir en la tabla) e idempotente.
-- ============================================================

alter table public.chat_messages
  alter column created_at set default clock_timestamp();

alter table public.ai_conversation_turns
  alter column created_at set default clock_timestamp();

-- ── Filas YA escritas: el default nuevo no las toca, así que los empates viejos se corrigen a
-- mano. Se corre la fila del ASISTENTE 1 ms hacia adelante, que es el orden real del turno (la
-- respuesta llegó después de la pregunta). No mueve nada visible: el transcript imprime HH:MM.
--
-- IDEMPOTENTE por la condición misma: después de correrla ya no queda una fila de usuario con
-- ese instante, así que una segunda corrida no encuentra nada que actualizar.
update public.chat_messages a
set created_at = a.created_at + interval '1 millisecond'
where a.role = 'assistant'
  and exists (
    select 1
    from public.chat_messages u
    where u.user_id = a.user_id
      and u.role = 'user'
      and u.created_at = a.created_at
  );

update public.ai_conversation_turns a
set created_at = a.created_at + interval '1 millisecond'
where a.role = 'assistant'
  and exists (
    select 1
    from public.ai_conversation_turns u
    where u.user_id = a.user_id
      and u.channel = a.channel
      and u.role = 'user'
      and u.created_at = a.created_at
  );
