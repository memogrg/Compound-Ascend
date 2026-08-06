/**
 * GET /api/ai/health — verifica en RUNTIME qué modelo de chat corre y si responde en la key actual.
 *
 * Hace un ping mínimo (1 token) al provider de chat y devuelve JSON
 *   { model, ok, latencyMs, error }
 * Así se confirma en vivo el modelo efectivo y si la key lo tiene disponible (p. ej. si
 * gemini-3.1-flash-lite diera 404, `ok:false` + `error` con el código — nunca falla en silencio).
 *
 * PROTEGIDO (no público): mismo patrón admin/cron que /api/debts/reminders — X-Cron-Secret =
 * CRON_SECRET o Authorization: Bearer <CRON_SECRET>. No expone datos del usuario.
 */
import { NextResponse } from "next/server";
import { corsHeaders } from "@/lib/security/cors";
import { cronAuthorized } from "@/lib/security/cron-auth";
import { toSafeResponse, AppError } from "@/lib/errors";
import { logger } from "@/lib/logger";

export const runtime = "nodejs";

function isAdminRequest(req: Request): boolean {
  return cronAuthorized(
    {
      authorization: req.headers.get("authorization"),
      xCronSecret: req.headers.get("x-cron-secret"),
    },
    process.env.CRON_SECRET,
  );
}

export async function GET(req: Request) {
  const cors = corsHeaders(req.headers.get("origin"));
  try {
    if (!isAdminRequest(req)) throw new AppError("UNAUTHORIZED");

    const { createGeminiProvider, CHAT_MODEL } = await import("@/lib/ai/providers/gemini");
    const provider = createGeminiProvider();
    if (!provider) {
      return NextResponse.json(
        { model: CHAT_MODEL, ok: false, latencyMs: 0, error: "GEMINI_API_KEY no configurada" },
        { headers: cors },
      );
    }

    const started = Date.now();
    let ok = false;
    let error: string | null = null;
    try {
      // Ping mínimo: 1 token de salida. Si el modelo no existe/está fuera de la key, el provider
      // lanza un AppError con el código (IA-400/IA-401/…), que capturamos y reportamos.
      await provider.chat({
        system: "ping",
        messages: [{ role: "user", content: "ping" }],
        maxTokens: 1,
      });
      ok = true;
    } catch (err) {
      error = err instanceof Error ? err.message : "error desconocido";
    }
    const latencyMs = Date.now() - started;

    if (!ok) logger.warn("ai-health: ping falló", { model: provider.model, error });
    return NextResponse.json({ model: provider.model, ok, latencyMs, error }, { headers: cors });
  } catch (err) {
    const { status, body } = toSafeResponse(err);
    return NextResponse.json(body, { status, headers: cors });
  }
}

export function OPTIONS(req: Request) {
  return new NextResponse(null, { status: 204, headers: corsHeaders(req.headers.get("origin")) });
}
