/**
 * POST /api/assistant/scan-receipt — Receipt scanner.
 * Recibe una imagen (base64), la envía a Gemini Vision y devuelve los datos
 * extraídos para que el usuario CONFIRME antes de crear la transacción.
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { scanReceipt } from "@/lib/ai/orchestrator";
import { assertTokenBudget, recordUsage } from "@/lib/ai/usage";
import { getUser, isSupabaseConfigured } from "@/lib/auth/session";
import { rateLimit, clientIp, RATE_LIMITS } from "@/lib/rate-limit";
import { assertTrustedOrigin, corsHeaders } from "@/lib/security/cors";
import { toSafeResponse, AppError } from "@/lib/errors";
import { logger } from "@/lib/logger";

export const runtime = "nodejs";

/**
 * PRESUPUESTO DE TIEMPO. Sin esta línea Vercel corta la función en el default de la cuenta
 * (~10-15s) — bastante MENOS que lo que puede tardar la visión, así que el escaneo moría a mitad
 * de camino y el usuario veía un fallo genérico e intermitente. El peor caso real:
 *
 *   intento 1 ... hasta 20s   (TIMEOUT_MS de lib/ai/providers/gemini.ts)
 *   backoff   ... ~0,4-0,6s   (backoffMs(0), solo si el fallo fue 5xx/429 o de red)
 *   intento 2 ... hasta 20s   (MAX_ATTEMPTS = 2)
 *   ───────────────────────
 *   visión    ≈ 40,6s
 *   + sesión, rate-limit, presupuesto de tokens y recordUsage ≈ 1s
 *   ───────────────────────
 *   total     ≈ 41,6s  <  60s   → ~18s de margen
 *
 * Es el mismo número que /api/assistant/chat, y por la misma cuenta: el comentario de
 * TIMEOUT_MS ya está calibrado contra maxDuration=60. Un timeout de la visión NO reintenta
 * (para no apilar esperas), así que ese camino cuesta 20s y no 40.
 */
export const maxDuration = 60;

// ~5 MB en base64 (límite defensivo). El cliente ya comprime a ~1600px/0.8 antes de subir
// (lib/image/prepare-image), así que una foto normal llega en cientos de KB y esto solo frena
// lo que no se pudo comprimir.
const MAX_B64 = 7_000_000;

// Formatos que Gemini acepta para visión. `heic`/`heif` siguen acá porque el iPhone los produce y
// el navegador puede no saber convertirlos (Chrome en Android no trae el códec): en ese caso el
// cliente sube el original y el modelo se encarga. Tras la compresión, lo normal es que todo
// llegue como image/jpeg.
const MIMES = ["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"] as const;

// Dos schemas y no uno: con un `.max()` dentro del objeto, una foto de 9 MB y un mimeType basura
// daban EXACTAMENTE el mismo "Imagen inválida.", que es el error que no dejaba distinguir "hay
// que comprimir" de "el formato no sirve".
const formaSchema = z.object({
  imageBase64: z.string().min(10),
  mimeType: z.enum(MIMES),
});

export async function POST(req: Request) {
  // Se declaran afuera del try para poder loguearlos en el catch: son el contexto que explica
  // el fallo (¿venía enorme? ¿qué formato?) SIN registrar un solo byte de la imagen.
  let bytesB64 = 0;
  let mime = "?";
  try {
    if (!assertTrustedOrigin(req)) throw new AppError("FORBIDDEN", "Origen no permitido.");

    const user = await getUser();
    if (isSupabaseConfigured() && !user) throw new AppError("UNAUTHORIZED");

    const rlKey = user ? `receipt:${user.id}` : `receipt:${clientIp(req)}`;
    const rl = await rateLimit(rlKey, RATE_LIMITS.receiptScan);
    if (!rl.ok)
      throw new AppError("RATE_LIMITED", "Demasiados escaneos seguidos. Probá en un minuto.");

    const parsed = formaSchema.safeParse(await req.json());
    if (!parsed.success) {
      throw new AppError("VALIDATION", "El formato de la imagen no sirve para escanear.");
    }
    bytesB64 = parsed.data.imageBase64.length;
    mime = parsed.data.mimeType;
    // El tamaño se valida APARTE para poder decir qué pasa y qué hacer al respecto.
    if (bytesB64 > MAX_B64) {
      throw new AppError(
        "VALIDATION",
        "La foto es demasiado pesada para escanearla. Probá sacándola de nuevo con menos resolución.",
      );
    }

    if (user) await assertTokenBudget(user.id);

    const { extract, tokensIn, tokensOut } = await scanReceipt(
      parsed.data.imageBase64,
      parsed.data.mimeType,
    );
    if (user) await recordUsage(user.id, tokensIn, tokensOut);

    return NextResponse.json({ extract }, { headers: corsHeaders(req.headers.get("origin")) });
  } catch (err) {
    // Una línea propia ANTES de la genérica de toSafeResponse: deja el contexto del escaneo
    // (peso, formato) junto al motivo, que es lo que hacía falta para diagnosticar los fallos
    // intermitentes. `detail` del AppError del proveedor trae { reason, status } de Gemini.
    logger.warn("[scan-receipt] fallo", {
      bytesB64,
      mime,
      code: err instanceof AppError ? err.code : "UNKNOWN",
      detail: err instanceof AppError ? err.detail : undefined,
      cause: err instanceof Error && !(err instanceof AppError) ? err.message : undefined,
    });
    const { status, body } = toSafeResponse(err);
    return NextResponse.json(body, { status, headers: corsHeaders(req.headers.get("origin")) });
  }
}
