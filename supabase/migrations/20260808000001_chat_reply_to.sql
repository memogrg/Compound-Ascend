-- ============================================================
-- 20260808000001 · Responder (citar) un mensaje pasado del chat
--
-- El chat era una lista plana: no había forma de decir "me refiero a ESTE mensaje". Con la
-- retención de una semana (20260804000001 + el cron de retención) el usuario ya puede scrollear
-- días atrás, así que citar es lo que faltaba para que el asesor sepa a qué se refiere.
--
-- Autorreferencia a la MISMA tabla: el mensaje citado es otro chat_messages del usuario.
--
-- ON DELETE SET NULL, no CASCADE, a propósito: cuando el cron de retención borra el mensaje
-- citado, la respuesta que lo citaba NO se borra en cascada — pierde la cita y queda como un
-- mensaje normal. La app degrada eso con un aviso ("ese mensaje ya no está en tu historial").
-- Borrar en cascada perdería conversación buena por limpiar conversación vieja.
--
-- Sin cambio de RLS: la columna vive en chat_messages, que ya tiene política PERSONAL (dueño)
-- para select/insert/update/delete. No hay tabla ni camino de acceso nuevo. Sí queda una
-- salvedad conocida: la FK NO valida que el mensaje citado sea del MISMO usuario (una FK no
-- puede leer auth.uid()); la app resuelve la cita leyendo bajo RLS ANTES de escribirla, así
-- que un id ajeno no se puede citar por más que se fabrique el request.
--
-- Aditivo e idempotente.
-- ============================================================

alter table public.chat_messages
  add column if not exists reply_to_message_id uuid
    references public.chat_messages(id) on delete set null;

comment on column public.chat_messages.reply_to_message_id is
  'Mensaje citado (misma tabla). Null = mensaje suelto, o el citado ya lo borró la retención.';

-- El índice NO es para leer (la cita se resuelve por PK), es para BORRAR: sin él, cada fila que
-- el cron de retención elimina obliga a un seq scan de la tabla para resolver el ON DELETE SET
-- NULL de los hijos. El cron borra en lote todos los días. Parcial porque la enorme mayoría de
-- los mensajes no cita a nadie.
create index if not exists idx_chat_messages_reply_to
  on public.chat_messages(reply_to_message_id)
  where reply_to_message_id is not null;
