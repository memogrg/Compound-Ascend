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

/** Un turno de chat terminó: qué carril lo resolvió, qué costó y cuánto midió la respuesta. */
export type AiLaneEvent = {
  kind: "lane";
  lane: string;
  tokensIn: number;
  tokensOut: number;
  replyLen: number;
};

export type AiEvent = AiToolEvent | AiLaneEvent;

const int = (n: number | undefined): number | null =>
  typeof n === "number" && Number.isFinite(n) ? Math.max(0, Math.round(n)) : null;

/**
 * Persiste un evento. Sin userId no se llama (WhatsApp/cron sin sesión siguen solo con el log).
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
    } else {
      row.name = e.lane;
      row.tokens_in = int(e.tokensIn);
      row.tokens_out = int(e.tokensOut);
      row.reply_len = int(e.replyLen);
    }
    const { error } = await supabase.from("ai_events").insert(row);
    if (error) throw new Error(error.message);
  } catch (err) {
    logger.warn("recordAiEvent fallido", { message: err instanceof Error ? err.message : "?" });
  }
}
