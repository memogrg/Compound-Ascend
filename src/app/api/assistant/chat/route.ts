/**
 * POST /api/assistant/chat — Modo "Finanzas AI".
 * Envía mensaje + historial + contexto financiero autorizado a la IA y devuelve
 * la respuesta y, opcionalmente, una acción PROPUESTA (que el usuario confirma).
 * La IA nunca crea nada aquí.
 */
import { NextResponse } from "next/server";
import { chatRequestSchema } from "@/modules/assistant/schemas";
import { financeChat, type FinancialContext } from "@/lib/ai/orchestrator";
import { assertTokenBudget, recordUsage } from "@/lib/ai/usage";
import { getUser, isSupabaseConfigured } from "@/lib/auth/session";
import { rateLimit, clientIp, RATE_LIMITS } from "@/lib/rate-limit";
import { assertTrustedOrigin } from "@/lib/security/cors";
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

    const ctx = await buildContext();
    const messages: ChatMessage[] = [
      ...parsed.data.history.map((m) => ({ role: m.role, content: m.content }) as ChatMessage),
      { role: "user", content: parsed.data.message },
    ];

    const result = await financeChat(messages, ctx);
    if (user) await recordUsage(user.id, result.tokensIn, result.tokensOut);

    return NextResponse.json({ reply: result.reply, action: result.action });
  } catch (err) {
    const { status, body } = toSafeResponse(err);
    return NextResponse.json(body, { status });
  }
}

async function buildContext(): Promise<FinancialContext> {
  const user = await getUser();
  const name = (user?.user_metadata?.display_name as string | undefined) ?? undefined;
  if (!isSupabaseConfigured()) return { name, currency: "CRC" };
  try {
    const { getBaseSummary, getDisplayCurrency } = await import(
      "@/modules/financial-base/services/base-service"
    );
    const [base, currency] = await Promise.all([getBaseSummary(), getDisplayCurrency()]);
    return {
      name,
      currency,
      incomeMonthly: base.indicators.incomeMonthly,
      expenseMonthly: base.indicators.expenseMonthly,
      freeCashflow: base.indicators.freeCashflow,
    };
  } catch {
    return { name, currency: "CRC" };
  }
}
