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
import { assertTrustedOrigin } from "@/lib/security/cors";
import { toSafeResponse, AppError } from "@/lib/errors";

export const runtime = "nodejs";

// ~5 MB en base64 (límite defensivo).
const MAX_B64 = 7_000_000;
const schema = z.object({
  imageBase64: z.string().min(10).max(MAX_B64),
  mimeType: z.enum(["image/jpeg", "image/png", "image/webp", "image/heic"]),
});

export async function POST(req: Request) {
  try {
    if (!assertTrustedOrigin(req)) throw new AppError("FORBIDDEN", "Origen no permitido.");

    const user = await getUser();
    if (isSupabaseConfigured() && !user) throw new AppError("UNAUTHORIZED");

    const rlKey = user ? `receipt:${user.id}` : `receipt:${clientIp(req)}`;
    const rl = await rateLimit(rlKey, RATE_LIMITS.receiptScan);
    if (!rl.ok) throw new AppError("RATE_LIMITED");

    const parsed = schema.safeParse(await req.json());
    if (!parsed.success) throw new AppError("VALIDATION", "Imagen inválida.");

    if (user) await assertTokenBudget(user.id);

    const { extract, tokensIn, tokensOut } = await scanReceipt(
      parsed.data.imageBase64,
      parsed.data.mimeType,
    );
    if (user) await recordUsage(user.id, tokensIn, tokensOut);

    return NextResponse.json({ extract });
  } catch (err) {
    const { status, body } = toSafeResponse(err);
    return NextResponse.json(body, { status });
  }
}
