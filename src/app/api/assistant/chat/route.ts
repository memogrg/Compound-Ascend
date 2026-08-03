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
import { loadRetainedChat, appendChatMessages, loadQuotedContext } from "@/lib/ai/chat-store";
import { capHistory } from "@/lib/ai/history";
import { annotateReply, buildQuotedContext } from "@/lib/ai/chat-quote";

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

    // ── CITA: el usuario está respondiendo a un mensaje pasado. Se resuelve ACÁ, bajo RLS, y de
    //    eso salen tres cosas: el contexto extra para el modelo, el aviso si ya no existe y el
    //    reply_to_message_id que se persiste (que NO se escribe si el id no resolvió: la FK
    //    rechazaría el insert y se perdería el turno entero). ──
    const quoteRef = parsed.data.replyToMessageId ?? null;
    const quote = quoteRef && user ? await loadQuotedContext(quoteRef) : null;
    // Pedida pero irrecuperable = la borró la retención (o no es suya). Se avisa, no se inventa.
    const quoteMissing = !!quoteRef && !quote;

    // ── CONTEXTO PEREZOSO: rutear PRIMERO (matchIntent es texto puro, 0 IO), y construir SOLO lo que
    //    ese carril usa. Una consulta que el router resuelve determinista NO paga el contexto completo
    //    (portafolio con precios en vivo, patrimonio, bloques flavor). Solo si escala → contexto full. ──
    //
    //    Con CITA no se toma el atajo determinista: ese carril resuelve con el mensaje actual y nada
    //    más (no mira historial), que es exactamente lo contrario de lo que pide citar. "¿y el mes
    //    pasado?" respondido sin saber a qué se refiere sería peor que gastar el turno completo.
    let result: Awaited<ReturnType<typeof financeChatWithTools>> | null = null;
    const matched = user && !quote ? matchIntent(userMessage) : null;
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
      // Memoria persistente (fuente de verdad): el chat RETENIDO del usuario (chat_messages). El
      // `history` del cliente se acepta por compat en el schema, pero NO se usa.
      //
      // El capHistory acá NO es redundante con el del orquestador: acota la ventana ANTES de que
      // se derive `priorAssistantReplies` (el guardrail "no repitas una nota ya dicha"). Sin él,
      // alargar la retención alargaría también esa señal — y lo que se le manda al LLM debe seguir
      // siendo los últimos N turnos, independiente de cuánto se retenga.
      const retenidos = await loadRetainedChat();
      const ventana = capHistory([
        ...retenidos.map((m) => ({ role: m.role, content: m.content }) as ChatMessage),
        { role: "user", content: userMessage },
      ]);
      // Con CITA, el par citado va DELANTE de la ventana aunque haya quedado fuera por antigüedad
      // (el caso que da sentido a citar), y el turno actual se anota para que el modelo sepa a QUÉ
      // se refiere. Se le suma a la ventana en vez de comerse turnos de ella: son unos cientos de
      // tokens y solo en este turno. Sin cita, `messages` queda byte-idéntico a antes.
      let messages: ChatMessage[] = ventana;
      if (quote) {
        const pares = [quote.quoted, ...(quote.partner ? [quote.partner] : [])].sort((a, b) =>
          a.createdAt < b.createdAt ? -1 : 1,
        );
        // Cuántos RETENIDOS sobrevivieron al capHistory: la ventana trae además el turno actual,
        // que no está en `retenidos`. Sin el −1 se contaría como "ya presente" un mensaje que
        // quedó justo afuera, y la cita no se inyectaría. El guard evita `slice(-0)`, que en JS
        // devuelve el arreglo ENTERO y haría exactamente lo contrario de lo que se pide.
        const enVentana = ventana.length > 1 ? retenidos.slice(-(ventana.length - 1)) : [];
        const idsVentana = new Set(enVentana.map((m) => m.id));
        const anotado = annotateReply(userMessage, quote.quoted);
        messages = [
          ...buildQuotedContext(pares, idsVentana, pares.map((m) => m.id)),
          ...ventana.slice(0, -1),
          { role: "user", content: anotado },
        ];
      }
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

    // RESOLUCIÓN de la acción propuesta contra los datos REALES del usuario. Las acciones que
    // nacen de un consejo ("subí el sobre de Restaurantes a X", "abonale Y a la tarjeta") vienen
    // con nombres, no con ids: acá se buscan sus entidades y se reconstruye el payload. Si la
    // entidad no existe, la acción se cae y queda solo el texto — una tarjeta que apunta a nada
    // ejecutaría algo que el usuario no puede revisar.
    if (user && result.action) {
      const { resolveActionProposal } = await import("@/lib/ai/action-resolver");
      const { userToday } = await import("@/lib/time/user-time");
      const today = await userToday().catch(() => new Date().toISOString().slice(0, 10));
      result.action = await resolveActionProposal(result.action, {
        currency: await getDisplayCurrency().catch(() => "CRC"),
        today,
      });
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
    // Se guarda el mensaje CRUDO, no el anotado con la cita: la anotación es andamiaje del prompt
    // y, persistida, se vería en el hilo y la citaría el próximo que responda a este mensaje.
    const ids = await appendChatMessages(undefined, [
      { role: "user", content: parsed.data.message, replyToMessageId: quote ? quoteRef : null },
      { role: "assistant", content: result.reply },
    ]);

    // Los ids vuelven para que la UI pueda CITAR el turno recién enviado sin recargar el hilo.
    return NextResponse.json(
      {
        reply: result.reply,
        action: result.action,
        messageIds: { user: ids[0] ?? null, assistant: ids[1] ?? null },
        ...(quoteMissing ? { quoteMissing: true } : {}),
      },
      { headers: corsHeaders(req.headers.get("origin")) },
    );
  } catch (err) {
    const { status, body } = toSafeResponse(err);
    return NextResponse.json(body, { status, headers: corsHeaders(req.headers.get("origin")) });
  }
}

// buildContext() vive ahora en src/lib/ai/context-engine.ts (Fase 5):
// perfil + deudas + metas + patrimonio + portafolio + entidades vinculables.
