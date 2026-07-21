/**
 * POST /api/assistant/chat — Modo "Finanzas AI".
 * Envía mensaje + historial + contexto financiero autorizado a la IA y devuelve
 * la respuesta y, opcionalmente, una acción PROPUESTA (que el usuario confirma).
 * La IA nunca crea nada aquí.
 */
import { NextResponse } from "next/server";
import { chatRequestSchema } from "@/modules/assistant/schemas";
import {
  financeChatWithTools,
  normalizeDebtsForTool,
  type ToolContext,
} from "@/lib/ai/orchestrator";
import { buildFinancialContext } from "@/lib/ai/context-engine";
import { listDebts, listGoals } from "@/modules/control";
import { getPrimaryCurrency } from "@/modules/financial-base";
import { getPatrimonioReport } from "@/modules/wealth/services/patrimonio-service";
import { getFxRates } from "@/lib/market-data/fx-rates";
import { convertCurrency } from "@/lib/fx";
import { assertTokenBudget, recordUsage } from "@/lib/ai/usage";
import { getUser, isSupabaseConfigured } from "@/lib/auth/session";
import { rateLimit, clientIp, RATE_LIMITS } from "@/lib/rate-limit";
import { assertTrustedOrigin, corsHeaders } from "@/lib/security/cors";
import { toSafeResponse, AppError } from "@/lib/errors";
import { alert } from "@/server/observability/alerts";
import type { ChatMessage } from "@/lib/ai/provider";
import { loadRecentTurns, appendTurns } from "@/lib/ai/conversation-store";

export const runtime = "nodejs";
// El chat (contexto + embedding de la Biblia + tool-loop de gemini-3.5-flash) puede
// tardar; sin maxDuration Vercel lo mataría en el default. 60s da margen (Fluid Compute).
export const maxDuration = 60;

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
    // Memoria persistente (fuente de verdad): historial reciente del usuario. `history` del cliente
    // se sigue aceptando por compat en el schema, pero NO se usa para el contexto.
    const recent = await loadRecentTurns();
    const messages: ChatMessage[] = [...recent, { role: "user", content: parsed.data.message }];

    // Habilita las herramientas (function-calling) sólo con sesión: lee las deudas del
    // usuario como datos de SOLO lectura y las normaliza a la moneda principal con FX
    // antes de pasarlas (deudas en USD+CRC no se pueden sumar crudas). Best-effort: si
    // la lectura falla, se sigue sin herramientas; si falla FX, no convierte y marca
    // fxUnavailable para que la IA aclare que el cálculo asume una sola moneda.
    let toolContext: ToolContext | undefined;
    if (user) {
      try {
        // Para CÁLCULO usamos la moneda PRINCIPAL (user_settings.primary_currency),
        // no getDisplayCurrency(): esta honra la cookie de visualización y haría que el
        // toolContext use la moneda con la que el usuario mira el dashboard, no la suya.
        const [debts, primary] = await Promise.all([listDebts(), getPrimaryCurrency()]);
        let rates: Record<string, number> | null = null;
        try {
          rates = await getFxRates();
        } catch {
          rates = null;
        }
        toolContext = {
          currency: primary,
          fxUnavailable: !rates,
          debts: normalizeDebtsForTool(debts, primary, rates),
        };
        // Número de Libertad + patrimonio invertible (datos reales), normalizados a la moneda
        // PRINCIPAL. Best-effort: si falla, la tool de libertad degrada con un motivo explicable.
        try {
          const pat = await getPatrimonioReport();
          // El "freedomNumber" de las tools = capital para sostener la vida ACTUAL
          // = numeroDeIndependencia (sucesor real del viejo numeroDeLibertad, siempre
          // presente). El nuevo numeroDeLibertad (estilo de vida deseado) es nullable
          // y se maneja aparte; nunca se inventa.
          let numero = pat.report.numeroDeIndependencia;
          let invertible = pat.report.investableWealth;
          if (pat.currency !== primary) {
            if (rates) {
              numero = convertCurrency(numero, pat.currency, primary, rates);
              invertible = convertCurrency(invertible, pat.currency, primary, rates);
            } else {
              numero = NaN; // sin FX no podemos pasar a principal → dejamos los campos fuera
            }
          }
          if (Number.isFinite(numero)) {
            toolContext.freedomNumber = numero;
            toolContext.investableWealth = invertible;
          }
        } catch {
          // deja freedomNumber/investableWealth undefined
        }
        // Metas de ahorro (datos reales) normalizadas a la moneda PRINCIPAL. Best-effort.
        try {
          const goals = await listGoals();
          const mapped = goals
            .filter((g) => g.targetAmount > 0 && (g.currency === primary || !!rates))
            .map((g) => {
              const conv = (n: number) =>
                g.currency === primary ? n : convertCurrency(n, g.currency, primary, rates!);
              return {
                nombre: g.name,
                objetivo: conv(g.targetAmount),
                actual: conv(g.currentAmount),
                aporte_mensual: conv(g.monthlyContribution),
                fecha_objetivo: g.targetDate ?? null,
              };
            });
          if (mapped.length) toolContext.goals = mapped;
        } catch {
          // deja goals undefined
        }
      } catch {
        toolContext = undefined;
      }
    }

    const result = await financeChatWithTools(messages, ctx, toolContext);
    if (user) await recordUsage(user.id, result.tokensIn, result.tokensOut);

    // Persistir el turno (best-effort; no bloquea la respuesta si falla).
    await appendTurns(undefined, [
      { role: "user", content: parsed.data.message, channel: "web" },
      { role: "assistant", content: result.reply, channel: "web" },
    ]);

    return NextResponse.json({ reply: result.reply, action: result.action }, { headers: corsHeaders(req.headers.get("origin")) });
  } catch (err) {
    const { status, body } = toSafeResponse(err);
    return NextResponse.json(body, { status, headers: corsHeaders(req.headers.get("origin")) });
  }
}

// buildContext() vive ahora en src/lib/ai/context-engine.ts (Fase 5):
// perfil + deudas + metas + patrimonio + portafolio + entidades vinculables.
