/**
 * POST /api/assistant/chat — Modo "Finanzas AI".
 * Envía mensaje + historial + contexto financiero autorizado a la IA y devuelve
 * la respuesta y, opcionalmente, una acción PROPUESTA (que el usuario confirma).
 * La IA nunca crea nada aquí.
 */
import { NextResponse } from "next/server";
import { chatRequestSchema } from "@/modules/assistant/schemas";
import { financeChatWithTools, type ToolContext } from "@/lib/ai/orchestrator";
import { buildFinancialContext } from "@/lib/ai/context-engine";
import { listDebts } from "@/modules/control";
import { assertTokenBudget, recordUsage } from "@/lib/ai/usage";
import { getUser, isSupabaseConfigured } from "@/lib/auth/session";
import { rateLimit, clientIp, RATE_LIMITS } from "@/lib/rate-limit";
import { assertTrustedOrigin, corsHeaders } from "@/lib/security/cors";
import { toSafeResponse, AppError } from "@/lib/errors";
import { alert } from "@/server/observability/alerts";
import type { ChatMessage } from "@/lib/ai/provider";

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    if (!assertTrustedOrigin(req)) throw new AppError("FORBIDDEN", "Origen no permitido.");

    const user = await getUser();
    if (isSupabaseConfigured() && !user) throw new AppError("UNAUTHORIZED");

    const rlKey = user ? `ai-chat:${user.id}` : `ai-chat:${clientIp(req)}`;
    const rl = await rateLimit(rlKey, RATE_LIMITS.aiChat);
    if (!rl.ok) {
      alert("rate_limit_storm", "warn", { bucket: "ai-chat" });
      throw new AppError("RATE_LIMITED");
    }

    const parsed = chatRequestSchema.safeParse(await req.json());
    if (!parsed.success) throw new AppError("VALIDATION", "Mensaje inválido.");

    if (user) await assertTokenBudget(user.id);

    const ctx = await buildFinancialContext();
    const messages: ChatMessage[] = [
      ...parsed.data.history.map((m) => ({ role: m.role, content: m.content }) as ChatMessage),
      { role: "user", content: parsed.data.message },
    ];

    // Habilita las herramientas (function-calling) sólo con sesión: lee las deudas
    // del usuario como datos de SOLO lectura para el ejecutor. Best-effort: si la
    // lectura falla, se sigue sin herramientas (chat normal). Asume una sola moneda
    // (la principal); la conversión multi-moneda queda como mejora futura.
    let toolContext: ToolContext | undefined;
    if (user) {
      try {
        const debts = await listDebts();
        toolContext = {
          debts: debts.map((d) => ({
            id: d.id,
            name: d.name,
            balance: d.balance,
            apr: d.apr ?? 0,
            minPayment: d.minPayment,
          })),
        };
      } catch {
        toolContext = undefined;
      }
    }

    const result = await financeChatWithTools(messages, ctx, toolContext);
    if (user) await recordUsage(user.id, result.tokensIn, result.tokensOut);

    return NextResponse.json({ reply: result.reply, action: result.action }, { headers: corsHeaders(req.headers.get("origin")) });
  } catch (err) {
    const { status, body } = toSafeResponse(err);
    return NextResponse.json(body, { status, headers: corsHeaders(req.headers.get("origin")) });
  }
}

// buildContext() vive ahora en src/lib/ai/context-engine.ts (Fase 5):
// perfil + deudas + metas + patrimonio + portafolio + entidades vinculables.
