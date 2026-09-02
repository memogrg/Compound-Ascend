import "server-only";

/**
 * EVENTOS DE IA (observabilidad durable). Los mismos números que ya se loguean, persistidos para
 * poder contestarlos semanas después: console.log en Vercel se retiene 1 hora (Hobby) o 1 día
 * (Pro), y el primer mes de uso real es el más informativo.
 *
 * PRIVACIDAD: acá NO entra contenido. Ni el mensaje, ni la respuesta, ni el resumen redactado.
 * Solo métricas — el tipo `AiEvent` es la lista completa de lo que se puede escribir, y no tiene
 * ningún campo de texto libre. `replyLen`/`resumenLen` son largos (un entero).
 *
 * BEST-EFFORT, mismo molde que recordUsage: service-role (omite RLS, el usuario no puede fabricar
 * ni borrar su telemetría), try/catch que loguea y sigue. Nunca hace fallar una respuesta del chat.
 */
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { isSupabaseConfigured } from "@/lib/auth/session";
import { logger } from "@/lib/logger";
import type { AiEventRow } from "@/lib/supabase/database.types";

/** Una herramienta se invocó: cuál, cuánto tardó, si salió bien, y cuánto medía su bloque redactado. */
export type AiToolEvent = {
  kind: "tool";
  name: string;
  ms: number;
  ok: boolean;
  resumenLen?: number;
};

/** Un turno de chat terminó: qué carril lo resolvió, qué costó, cuánto tardó y cuánto midió. */
export type AiLaneEvent = {
  kind: "lane";
  lane: string;
  tokensIn: number;
  tokensOut: number;
  replyLen: number;
  /** Latencia del TURNO COMPLETO en ms (no de una herramienta). Alimenta el p50/p95 por carril. */
  ms?: number;
};

/**
 * Un guard DETERMINISTA frenó la respuesta. La causa ya se distinguía en los logs
 * (`assistant.movimientos_bloqueados` y sus hermanos), pero eso dura horas en Vercel: acá queda.
 * Es la tasa de "preferí no saber antes que inventar", que es una métrica de HONESTIDAD y no de
 * error — sube cuando el modelo intenta rellenar y la red lo ataja.
 */
export type AiGuardEvent = {
  kind: "guard";
  /** 'movimientos' | 'tendencia' | 'deuda_fantasma' | 'propuesta_ajena' */
  causa: string;
};

/**
 * Una acción se PROPUSO o se CONFIRMÓ. Las dos mitades de la tasa de acción: cuántos consejos
 * llegaron a ser ejecutables de un tap, y cuántos el usuario efectivamente ejecutó.
 */
export type AiActionEvent = {
  kind: "action";
  /** Tipo de la acción (`create_goal`, `debt_extra_payment`, …). */
  tipo: string;
  /** `false` = recién propuesta; `true` = el usuario confirmó. */
  confirmada: boolean;
};

/**
 * El proveedor falló, con la CAUSA REAL. `gemini.ts` ya la normaliza
 * (`timeout` | `network` | `http` + status) y la manda en el `detail` del AppError; lo único que
 * faltaba era persistirla. Sin esto, "la IA anda mal" no se puede separar de "nos rate-limitearon".
 */
export type AiProviderErrorEvent = {
  kind: "provider_error";
  /** 'timeout' | 'network' | 'http_429' | 'http_5xx' | 'http_401' | … */
  razon: string;
};

export type AiEvent =
  AiToolEvent | AiLaneEvent | AiGuardEvent | AiActionEvent | AiProviderErrorEvent;

const int = (n: number | undefined): number | null =>
  typeof n === "number" && Number.isFinite(n) ? Math.max(0, Math.round(n)) : null;

/**
 * Persiste un evento. Sin userId no se llama (cron/ingesta sin sesión siguen solo con el log).
 * Cualquier fallo se loguea y se sigue: la telemetría nunca degrada la respuesta del usuario.
 */
export async function recordAiEvent(userId: string, e: AiEvent): Promise<void> {
  if (!isSupabaseConfigured() || !userId) return;
  try {
    const supabase = createServiceRoleClient();
    // Fila explícita: solo las columnas de la métrica, nunca contenido.
    const row: Partial<AiEventRow> & { user_id: string } = { user_id: userId, event: e.kind };
    if (e.kind === "tool") {
      row.name = e.name;
      row.ms = int(e.ms);
      row.ok = e.ok;
      row.resumen_len = int(e.resumenLen);
    } else if (e.kind === "lane") {
      row.name = e.lane;
      row.tokens_in = int(e.tokensIn);
      row.tokens_out = int(e.tokensOut);
      row.reply_len = int(e.replyLen);
      row.ms = int(e.ms);
    } else if (e.kind === "guard") {
      row.name = e.causa;
    } else if (e.kind === "action") {
      // El prefijo es lo que después separa las dos mitades de la tasa de acción en el rollup, sin
      // tener que emparejar filas (una propuesta puede confirmarse al día siguiente).
      row.name = `${e.confirmada ? "confirmada" : "propuesta"}:${e.tipo}`;
    } else {
      row.name = e.razon;
      row.ok = false;
    }
    const { error } = await supabase.from("ai_events").insert(row);
    if (error) throw new Error(error.message);
  } catch (err) {
    logger.warn("recordAiEvent fallido", { message: err instanceof Error ? err.message : "?" });
  }
}
