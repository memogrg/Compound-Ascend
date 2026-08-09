import "server-only";

/**
 * BITÁCORA DE AVISOS — "¿ya le dijimos esto hoy?".
 *
 * Es el candado de idempotencia de los tres crons del ritmo. Sin esto, el cron diario
 * —que corre CADA HORA para atrapar las 19:00 de cada zona horaria— mandaría 24 correos,
 * y un reintento de Vercel duplicaría los de ventana y cierre.
 *
 * El candado real es el ÍNDICE ÚNICO `(user_id, kind, channel, sent_on)`, no un `if` en
 * JS: dos invocaciones concurrentes del mismo cron pasarían las dos por cualquier
 * chequeo previo. Por eso `reclamarEnvio()` inserta y le pregunta a Postgres quién ganó,
 * en vez de leer-y-después-escribir.
 *
 * Y reclama ANTES de enviar, no después: si el envío revienta a mitad, se pierde UN
 * aviso. Al revés se pierde el candado y se mandan veinticuatro.
 *
 * Con `ctx` (service-role, sin sesión) toda query filtra por `userId` explícito — RLS no
 * está para protegernos ahí.
 */
import { resolveAuth, type AuthContext } from "@/lib/auth/auth-context";
import { getActiveHouseholdId } from "@/lib/household/active";
import { logger } from "@/lib/logger";
import type { NotificationChannel } from "@/lib/notifications/preferences";

/** Tipos de aviso del ritmo. Coinciden con los `InsightKind` correspondientes. */
export type RhythmNotificationKind = "ventana_presupuesto" | "cierre_mes" | "registro_diario";

/**
 * Reclama el derecho a enviar UN aviso hoy. Devuelve true si lo consiguió (hay que
 * enviar) y false si alguien ya lo había reclamado (no enviar).
 *
 * `sentOn` es el día EN LA ZONA DEL USUARIO, resuelto por quien llama. Dejarlo a la base
 * (`current_date`) usaría el reloj del servidor: en Vercel es UTC, y para un usuario en
 * Costa Rica (UTC−6) el aviso de las 19:00 cae en el "mañana" de UTC — el candado se
 * abriría a mitad de su tarde y mandaría dos.
 */
export async function reclamarEnvio(args: {
  kind: RhythmNotificationKind;
  channel: NotificationChannel;
  sentOn: string;
  ctx?: AuthContext;
}): Promise<boolean> {
  try {
    const { db, userId } = await resolveAuth(args.ctx);
    const household_id = await getActiveHouseholdId(db, userId);
    const { error } = await db.from("notification_log").insert({
      user_id: userId,
      household_id,
      kind: args.kind,
      channel: args.channel,
      sent_on: args.sentOn,
    });
    // 23505 = unique_violation: ya estaba reclamado. Es el camino ESPERADO, no un fallo
    // — el cron pasa 24 veces al día y 23 de ellas tienen que rebotar acá en silencio.
    if (error) {
      if (error.code === "23505") return false;
      // Cualquier otro error sí es un problema: se registra y NO se envía. Ante la duda,
      // callar es mejor que arriesgarse a repetir.
      logger.warn("reclamarEnvio: insert rechazado", {
        kind: args.kind,
        channel: args.channel,
        message: error.message,
      });
      return false;
    }
    return true;
  } catch (err) {
    logger.warn("reclamarEnvio fallido", {
      kind: args.kind,
      message: err instanceof Error ? err.message : "?",
    });
    return false;
  }
}

/**
 * ¿Ya se reclamó este aviso hoy? Lectura sin efectos, para las superficies in-app: el
 * pop-up pregunta esto antes de mostrarse, así descartarlo lo calla el resto del día.
 */
export async function yaNotificadoHoy(args: {
  kind: RhythmNotificationKind;
  channel: NotificationChannel;
  sentOn: string;
  ctx?: AuthContext;
}): Promise<boolean> {
  try {
    const { db, userId } = await resolveAuth(args.ctx);
    const { data } = await db
      .from("notification_log")
      .select("id")
      .eq("user_id", userId)
      .eq("kind", args.kind)
      .eq("channel", args.channel)
      .eq("sent_on", args.sentOn)
      .maybeSingle();
    return Boolean(data);
  } catch {
    // Ante un fallo de lectura, NO suprimir: es peor tragarse un aviso legítimo que
    // repetirlo una vez. (El criterio opuesto al de `reclamarEnvio`, porque acá el
    // costo del error es callar de más, no escribir de más.)
    return false;
  }
}
