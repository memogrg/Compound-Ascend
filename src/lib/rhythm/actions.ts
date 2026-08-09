"use server";

/**
 * Server Actions del RITMO DEL MES. Viven en lib/ y no en un módulo porque las tres
 * superficies que las consumen cruzan módulos: el pop-up se monta en el layout (web y
 * móvil), el aviso de ventana en el tab de Gastos y el cierre en Transacciones.
 * Precedente: lib/auth/actions.ts.
 *
 * Todas devuelven en vez de lanzar: un fallo del ritmo jamás debe romper la pantalla en
 * la que aparece. Es un acompañante, no una función crítica.
 */
import { logger } from "@/lib/logger";
import { monthPeriod } from "@/modules/financial-base/engine/period";

export type RhythmSnapshot = {
  /** null si no se pudo resolver (sin sesión, Supabase sin configurar, error). */
  state: import("@/lib/rhythm/rhythm-service").RhythmState | null;
  /** Preferencia in-app del usuario: si está apagada, ninguna superficie muestra nada. */
  inApp: boolean;
};

/** Estado en vivo del ritmo para el pop-up. Nunca lanza. */
export async function getRhythmStateAction(): Promise<RhythmSnapshot> {
  try {
    const { isSupabaseConfigured, getUser } = await import("@/lib/auth/session");
    const user = isSupabaseConfigured() ? await getUser() : null;
    if (!user) return { state: null, inApp: true };

    // La misma puerta que respeta la campana: apagar los avisos in-app los apaga TODOS,
    // no solo los de la campana. Un pop-up que sobrevive al interruptor es un bug.
    const { getNotificationPrefs } = await import("@/lib/notifications/preferences");
    const prefs = await getNotificationPrefs(user.id);
    if (!prefs.inApp) return { state: null, inApp: false };

    const { getRhythmState } = await import("@/lib/rhythm/rhythm-service");
    return { state: await getRhythmState(), inApp: true };
  } catch (err) {
    logger.warn("getRhythmStateAction fallido", {
      message: err instanceof Error ? err.message : "?",
    });
    return { state: null, inApp: true };
  }
}

/** Silencia un aviso in-app por el resto del día (la X del pop-up). */
export async function dismissRhythmNudgeAction(kind: string): Promise<{ ok: boolean }> {
  try {
    // Lista blanca: `kind` viene del cliente y termina en una fila de notification_log.
    if (kind !== "ventana_presupuesto" && kind !== "cierre_mes" && kind !== "registro_diario") {
      return { ok: false };
    }
    const { silenciarNudgeHoy } = await import("@/lib/rhythm/rhythm-service");
    await silenciarNudgeHoy(kind);
    return { ok: true };
  } catch {
    return { ok: false };
  }
}

// No hay una acción para LEER las señales de ritmo: las dos pantallas de Gastos (web y
// móvil) son server components y ya las cargan con `getSenalesRitmo` para pasárselas a
// `RitmoPanel`. Pedirlas otra vez desde el cliente sería un viaje de más y un parpadeo —
// las tarjetas aparecerían medio segundo después, empujando los frascos hacia abajo.

/**
 * Aplica la salida "mover" de un aviso de ritmo, en un tap.
 *
 * Los ids y el monto llegan del cliente, así que se revalidan contra el presupuesto REAL en
 * el servicio (que topea el monto a lo que el donante puede ceder). Reusa exactamente el
 * mismo camino que la tarjeta del chat (`confirmMoveBudgetAction`): un solo lugar donde vive
 * la regla de cómo se mueve presupuesto.
 */
export async function aplicarMoverPresupuestoAction(args: {
  desdeCategoryId: string;
  desdeName: string;
  hastaCategoryId: string;
  hastaName: string;
  amount: number;
  currency: string;
}): Promise<{ ok: boolean; message?: string }> {
  try {
    const { userToday } = await import("@/lib/time/user-time");
    const today = await userToday();
    const { confirmMoveBudgetAction } = await import("@/modules/assistant/api/actions");
    const res = await confirmMoveBudgetAction({
      ...args,
      periodMonth: Number(today.slice(5, 7)),
      periodYear: Number(today.slice(0, 4)),
    });
    return { ok: res.ok, message: res.message };
  } catch (err) {
    logger.error("aplicarMoverPresupuesto fallido", {
      message: err instanceof Error ? err.message : "?",
    });
    return { ok: false, message: "No pudimos mover el presupuesto." };
  }
}

/**
 * Fusiona un sobre ocioso dentro de otro (la salida "fusionar" del aviso de ocioso).
 *
 * DESTRUCTIVO e irreversible: `mergeCategory` reasigna todas las referencias del sobre origen
 * —transacciones, líneas de presupuesto, reglas— y después lo borra. La superficie exige una
 * confirmación aparte antes de llamar acá; esta acción no la puede exigir por sí sola, así que
 * lo que sí hace es validar que los dos ids sean distintos y devolver el error en vez de
 * lanzarlo.
 */
export async function fusionarSobresAction(args: {
  fromId: string;
  intoId: string;
}): Promise<{ ok: boolean; message?: string }> {
  try {
    if (!args.fromId || !args.intoId || args.fromId === args.intoId) {
      return { ok: false, message: "Elegí dos sobres distintos." };
    }
    const { fusionarSobres } = await import("@/lib/rhythm/rhythm-service");
    await fusionarSobres(args.fromId, args.intoId);

    const { revalidatePath } = await import("next/cache");
    revalidatePath("/gastos");
    revalidatePath("/m/gastos");
    revalidatePath("/mi-base-financiera");
    return { ok: true };
  } catch (err) {
    logger.error("fusionarSobres fallido", {
      message: err instanceof Error ? err.message : "?",
    });
    return { ok: false, message: "No pudimos fusionar los sobres." };
  }
}

/**
 * Descarta el aviso de UN sobre ocioso por lo que queda del mes.
 *
 * Igual que el de ritmo pero con ancla MENSUAL: un sobre ocioso es una conclusión sobre tres
 * meses de historia, así que "no me lo digas más" tiene que durar más que una semana.
 */
export async function descartarAvisoOciosoAction(categoryId: string): Promise<{ ok: boolean }> {
  try {
    const { requireUser } = await import("@/lib/auth/session");
    const { createSupabaseServerClient } = await import("@/lib/supabase/server");
    const { userToday } = await import("@/lib/time/user-time");

    const user = await requireUser();
    const supabase = await createSupabaseServerClient();
    const relatedId = `ocioso:${categoryId}:${(await userToday()).slice(0, 7)}`;
    await supabase
      .from("user_insights")
      .update({ status: "descartado" })
      .eq("user_id", user.id)
      .eq("kind", "sobre_ocioso")
      .eq("related_id", relatedId);
    return { ok: true };
  } catch {
    return { ok: false };
  }
}

/**
 * Descarta el aviso de ritmo de UN sobre por lo que queda de la semana.
 *
 * Marca el insight como descartado por su clave (`ritmo:{categoryId}:{semana}`). Como la
 * semana está en la clave, el descarte caduca solo el lunes — no hace falta un trabajo de
 * limpieza ni un campo de expiración.
 */
export async function descartarAvisoRitmoAction(categoryId: string): Promise<{ ok: boolean }> {
  try {
    const { requireUser } = await import("@/lib/auth/session");
    const { createSupabaseServerClient } = await import("@/lib/supabase/server");
    const { userToday } = await import("@/lib/time/user-time");
    const { semanaISO } = await import("@/lib/rhythm/spend-pace");

    const user = await requireUser();
    const supabase = await createSupabaseServerClient();
    const relatedId = `ritmo:${categoryId}:${semanaISO(await userToday())}`;
    await supabase
      .from("user_insights")
      .update({ status: "descartado" })
      .eq("user_id", user.id)
      .eq("kind", "ritmo_sobre")
      .eq("related_id", relatedId);
    return { ok: true };
  } catch {
    return { ok: false };
  }
}

/**
 * Cierra (o reabre) la configuración del mes en curso. Cerrar antes del día 5 es válido:
 * es decir "ya está, así queda el mes". Reabrir existe porque cerrar por accidente el
 * día 2 no puede costar tres días de ventana.
 */
export async function setMonthConfigClosedAction(
  closed: boolean,
): Promise<{ ok: boolean; message?: string }> {
  try {
    const { userToday } = await import("@/lib/time/user-time");
    const today = await userToday();
    const period = monthPeriod(Number(today.slice(0, 4)), Number(today.slice(5, 7)));
    const { setMonthConfigClosed } = await import("@/lib/rhythm/rhythm-service");
    await setMonthConfigClosed(period, closed);

    const { revalidatePath } = await import("next/cache");
    revalidatePath("/gastos");
    revalidatePath("/m/gastos");
    return { ok: true };
  } catch (err) {
    logger.error("setMonthConfigClosed fallido", {
      message: err instanceof Error ? err.message : "?",
    });
    return { ok: false, message: "No pudimos guardar el estado de la configuración." };
  }
}
