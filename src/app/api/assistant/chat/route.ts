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
  resolveDeterministic,
  normalizeDebtsForTool,
  type ToolContext,
} from "@/lib/ai/orchestrator";
import { matchIntent } from "@/lib/ai/router";
import { buildFinancialContext } from "@/lib/ai/context-engine";
import { scopeForIntent, type ToolNeed } from "@/lib/ai/lazy-context";
import { listDebts, listGoals } from "@/modules/control";
import { getDisplayCurrency } from "@/modules/financial-base";
import { getPatrimonioReport } from "@/modules/wealth/services/patrimonio-service";
import { getFxRates } from "@/lib/market-data/fx-rates";
import { convertCurrency } from "@/lib/fx";
import { assertTokenBudget, recordUsage } from "@/lib/ai/usage";
import { recordAiEvent } from "@/lib/ai/events";
import { getUser, isSupabaseConfigured } from "@/lib/auth/session";
import { rateLimit, clientIp, RATE_LIMITS } from "@/lib/rate-limit";
import { assertTrustedOrigin, corsHeaders } from "@/lib/security/cors";
import { toSafeResponse, AppError } from "@/lib/errors";
import { alert } from "@/server/observability/alerts";
import { logger } from "@/lib/logger";
import type { ChatMessage } from "@/lib/ai/provider";
import { loadTodayChat, appendChatMessages } from "@/lib/ai/chat-store";

export const runtime = "nodejs";
// El chat (contexto + embedding de la Biblia + tool-loop de gemini-3.5-flash) puede
// tardar; sin maxDuration Vercel lo mataría en el default. 60s da margen (Fluid Compute).
export const maxDuration = 60;

/**
 * Arma el toolContext leyendo SOLO lo que el carril pide. `numbers` (los tres números patrimoniales)
 * es la lectura cara (getPatrimonioReport) — se salta salvo que el intent los use. Best-effort en cada
 * parte, igual que antes. `currency` (moneda principal) siempre; deudas/metas/números según `need`.
 */
async function buildToolContext(need: ToolNeed, userId?: string): Promise<ToolContext | undefined> {
  try {
    // Moneda de VISUALIZACIÓN (la que ve en la app; cookie). Todo el toolContext se normaliza a ella,
    // igual que el FinancialContext → el asesor nunca mezcla monedas.
    const display = await getDisplayCurrency();
    let rates: Record<string, number> | null = null;
    try {
      rates = await getFxRates();
    } catch {
      rates = null;
    }
    const toolContext: ToolContext = { currency: display, fxUnavailable: !rates, debts: [], userId };
    if (need.debts) {
      try {
        toolContext.debts = normalizeDebtsForTool(await listDebts(), display, rates);
      } catch {
        toolContext.debts = [];
      }
    }
    if (need.numbers) {
      try {
        const pat = await getPatrimonioReport();
        const toDisplay = (v: number): number =>
          pat.currency === display ? v : rates ? convertCurrency(v, pat.currency, display, rates) : NaN;
        const seguridad = toDisplay(pat.report.numeroDeSeguridad);
        const independencia = toDisplay(pat.report.numeroDeIndependencia);
        const invertible = toDisplay(pat.report.investableWealth);
        const libertad = pat.report.numeroDeLibertad != null ? toDisplay(pat.report.numeroDeLibertad) : null;
        if (Number.isFinite(seguridad)) toolContext.securityNumber = seguridad;
        if (Number.isFinite(independencia)) toolContext.independenceNumber = independencia;
        if (libertad != null && Number.isFinite(libertad)) toolContext.libertyNumber = libertad;
        if (Number.isFinite(invertible)) toolContext.investableWealth = invertible;
      } catch {
        // números undefined
      }
    }
    if (need.goals) {
      try {
        const goals = await listGoals();
        const mapped = goals
          .filter((g) => g.targetAmount > 0 && (g.currency === display || !!rates))
          .map((g) => {
            const conv = (n: number) => (g.currency === display ? n : convertCurrency(n, g.currency, display, rates!));
            return {
              nombre: g.name,
              objetivo: conv(g.targetAmount),
              actual: conv(g.currentAmount),
              aporte_mensual: conv(g.monthlyContribution),
              fecha_objetivo: g.targetDate ?? null,
              recurrence: g.recurrence,
            };
          });
        if (mapped.length) toolContext.goals = mapped;
      } catch {
        // goals undefined
      }
    }
    return toolContext;
  } catch {
    return undefined;
  }
}

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

    const userMessage = parsed.data.message;

    // ── CONTEXTO PEREZOSO: rutear PRIMERO (matchIntent es texto puro, 0 IO), y construir SOLO lo que
    //    ese carril usa. Una consulta que el router resuelve determinista NO paga el contexto completo
    //    (portafolio con precios en vivo, patrimonio, bloques flavor). Solo si escala → contexto full. ──
    let result: Awaited<ReturnType<typeof financeChatWithTools>> | null = null;
    const matched = user ? matchIntent(userMessage) : null;
    if (matched) {
      const scope = scopeForIntent(matched.intent, matched.params);
      const liteCtx =
        scope.context === null
          ? { currency: await getDisplayCurrency().catch(() => "CRC") }
          : await buildFinancialContext(scope.context);
      const liteTool = await buildToolContext(scope.tool, user?.id);
      if (liteTool) {
        // Turno único: los intents deterministas resuelven con el mensaje actual (no necesitan historial).
        const det = await resolveDeterministic(matched, [{ role: "user", content: userMessage }], liteCtx, liteTool);
        if (det) result = det;
      }
    }

    if (!result) {
      // Fallback: sin patrón (o el determinista escaló). AHÍ sí se arma el contexto COMPLETO + tools.
      const ctx = await buildFinancialContext();
      // Memoria persistente (fuente de verdad): el chat del DÍA del usuario (chat_messages). El
      // `history` del cliente se acepta por compat en el schema, pero NO se usa. El LLM ve solo los
      // últimos N (capHistory en el orquestador), aunque se persista todo el día.
      const today = await loadTodayChat();
      const messages: ChatMessage[] = [
        ...today.map((m) => ({ role: m.role, content: m.content }) as ChatMessage),
        { role: "user", content: userMessage },
      ];
      // Herramientas (function-calling) sólo con sesión; deudas/metas/números normalizados a la moneda
      // de VISUALIZACIÓN. Best-effort: si falla, se sigue sin herramientas.
      const toolContext = user ? await buildToolContext({ debts: true, goals: true, numbers: true }, user.id) : undefined;
      result = await financeChatWithTools(messages, ctx, toolContext);
    }
    if (user) await recordUsage(user.id, result.tokensIn, result.tokensOut);

    // Enriquecer una propuesta de gasto/ingreso con el SOBRE sugerido (hoja REAL del usuario),
    // para que la card lo muestre preseleccionado y editable ("Frasco › Sobre"). La IA sugiere
    // acotada a los sobres del usuario (fallback historial); el usuario confirma/corrige. La
    // suma cae en el sobre elegido, no en null. Best-effort: si falla, la card cae a "Sin sobre".
    if (user && result.action?.type === "create_transaction") {
      try {
        const p = result.action.payload as Record<string, unknown>;
        const kind = p.kind === "ingreso" ? "ingreso" : "gasto";
        const description = typeof p.description === "string" ? p.description : "";
        if (description) {
          const { suggestSobreForChat } = await import("@/modules/financial-base");
          const sug = await suggestSobreForChat(description, kind);
          p.categoryId = sug.categoryId;
          p.categoryPath = sug.categoryPath;
        }
      } catch {
        // deja la acción sin sobre sugerido; la card ofrece el selector igual
      }
    }
    // Carril del router (template/lite/reasoning) para medir el ahorro de tokens antes/después.
    logger.info("assistant.chat.lane", {
      lane: result.lane ?? "reasoning",
      provider: result.provider,
      tokensIn: result.tokensIn,
      tokensOut: result.tokensOut,
      // Largo del reply final: contra el `resumenLen` de assistant.tool dice si el modelo pasó
      // entero un bloque ya redactado (comparador, informe) o lo recortó.
      replyLen: result.reply?.length ?? 0,
    });
    // Y persistido: el log dura horas en Vercel, y la pregunta ("¿se usa? ¿cuánto tarda? ¿el
    // modelo pasa el bloque entero?") se contesta dentro de semanas. Best-effort.
    if (user) {
      await recordAiEvent(user.id, {
        kind: "lane",
        lane: result.lane ?? "reasoning",
        tokensIn: result.tokensIn,
        tokensOut: result.tokensOut,
        replyLen: result.reply?.length ?? 0,
      });
    }

    // Persistir el turno en el chat del usuario (best-effort; no bloquea la respuesta si falla).
    await appendChatMessages(undefined, [
      { role: "user", content: parsed.data.message },
      { role: "assistant", content: result.reply },
    ]);

    return NextResponse.json({ reply: result.reply, action: result.action }, { headers: corsHeaders(req.headers.get("origin")) });
  } catch (err) {
    const { status, body } = toSafeResponse(err);
    return NextResponse.json(body, { status, headers: corsHeaders(req.headers.get("origin")) });
  }
}

// buildContext() vive ahora en src/lib/ai/context-engine.ts (Fase 5):
// perfil + deudas + metas + patrimonio + portafolio + entidades vinculables.
