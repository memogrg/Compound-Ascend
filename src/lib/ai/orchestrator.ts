import "server-only";

/**
 * Orquestador de IA: selecciona proveedor, arma el system prompt en español con
 * el contexto financiero AUTORIZADO del usuario, y parsea acciones propuestas.
 * Las acciones nunca se ejecutan aquí; requieren confirmación del usuario.
 */
import { getServerEnv } from "@/lib/env";
import { StubProvider, type AIProvider, type ChatMessage } from "@/lib/ai/provider";
import { createGeminiProvider } from "@/lib/ai/providers/gemini";
import { parseAction, type AIChatResponse } from "@/lib/ai/types";
import { applyGuardrail } from "@/lib/ai/guardrail";
import { logger } from "@/lib/logger";

// El system prompt y su contexto viven en system-prompt.ts (puro, testeable);
// el context-engine (Fase 5) arma el FinancialContext con datos autorizados.
import { buildSystemPrompt, type FinancialContext } from "@/lib/ai/system-prompt";
import { selectBibliaKnowledge, selectPatrimonioGuidance } from "@/lib/ai/biblia-knowledge";
import { SIMULATE_DEBT_TOOL, simulateDebtPayoff, type AiToolExecutor } from "@/lib/ai/tools";
import type { DebtInput } from "@/modules/control/engine/debt-strategy";
import { convertCurrency } from "@/lib/fx";

export type { FinancialContext };

/**
 * Datos de solo lectura que habilitan las herramientas (chat web con sesión). Las
 * deudas vienen YA normalizadas a `currency` (la moneda principal); `fxUnavailable`
 * marca que no se pudieron convertir (cálculo asume una sola moneda).
 */
export type ToolContext = { debts: DebtInput[]; currency: string; fxUnavailable?: boolean };

/** Deuda cruda (de listDebts) con su moneda, antes de normalizar para la herramienta. */
type RawDebt = {
  id: string;
  name: string;
  balance: number;
  minPayment: number;
  apr: number | null;
  currency: string;
};

/**
 * Normaliza las deudas a la moneda principal con FX (balance y cuota mínima; las APR
 * quedan, son por deuda). Si no hay tasas (rates null), pasa los montos crudos. Puro
 * y testeable: con deudas mixtas USD+CRC convierte cada una, no suma cruda.
 */
export function normalizeDebtsForTool(
  debts: RawDebt[],
  primary: string,
  rates: Record<string, number> | null,
): DebtInput[] {
  return debts.map((d) => ({
    id: d.id,
    name: d.name,
    apr: d.apr ?? 0,
    balance: rates ? convertCurrency(d.balance, d.currency, primary, rates) : d.balance,
    minPayment: rates ? convertCurrency(d.minPayment, d.currency, primary, rates) : d.minPayment,
  }));
}

function getProvider(): AIProvider {
  if (getServerEnv().AI_PROVIDER === "gemini") {
    const g = createGeminiProvider();
    if (g) return g;
  }
  return new StubProvider();
}

export async function financeChat(
  messages: ChatMessage[],
  ctx: FinancialContext,
): Promise<AIChatResponse & { tokensIn: number; tokensOut: number; provider: string }> {
  const provider = getProvider();
  // Recuperación determinista de la Biblia: emoción dominante + tema del último
  // mensaje del usuario → guía conductual inyectada en el system prompt.
  const lastUser = [...messages].reverse().find((m) => m.role === "user")?.content;
  // Biblia conductual (emoción + tema) + guía patrimonial §15 (banderas del diagnóstico),
  // fusionadas y acotadas para no inflar el prompt.
  const knowledge = [
    ...selectBibliaKnowledge({ emotion: ctx.dominantEmotion, text: lastUser }),
    ...selectPatrimonioGuidance(ctx.patrimonioDiagnosis ?? []),
  ].slice(0, 5);
  const result = await provider.chat({
    system: buildSystemPrompt({ ...ctx, knowledge }),
    messages,
  });
  const parsed = parseAction(result.text);
  return {
    ...guardReply(parsed, ctx, provider.name),
    tokensIn: result.tokensIn,
    tokensOut: result.tokensOut,
    provider: provider.name,
  };
}

/**
 * Red post-generación: pasa el reply por el guardrail determinista (no muta la
 * acción) y loguea las flags para observabilidad. No cambia el shape de la respuesta.
 */
function guardReply(
  parsed: AIChatResponse,
  ctx: FinancialContext,
  provider: string,
): AIChatResponse {
  const guarded = applyGuardrail(parsed.reply, {
    hasEmergencyFund: ctx.hasEmergencyFund,
    urgency: ctx.urgency,
    dependentsCount: ctx.dependentsCount,
  });
  if (guarded.flags.length) {
    logger.info("ai-guardrail aplicado", { flags: guarded.flags, provider });
  }
  return { ...parsed, reply: guarded.reply };
}

/** Biblia conductual + guía §15, fusionadas y acotadas (compartido por ambos chats). */
function buildKnowledge(messages: ChatMessage[], ctx: FinancialContext): string[] {
  const lastUser = [...messages].reverse().find((m) => m.role === "user")?.content;
  return [
    ...selectBibliaKnowledge({ emotion: ctx.dominantEmotion, text: lastUser }),
    ...selectPatrimonioGuidance(ctx.patrimonioDiagnosis ?? []),
  ].slice(0, 5);
}

/**
 * Construye el ejecutor de herramientas (SOLO lectura/cálculo) con los datos del
 * usuario. Mapea cada nombre de tool a su motor puro; herramienta desconocida → error
 * explicable (nunca escribe nada).
 */
export function buildToolExecutor(toolContext: ToolContext): AiToolExecutor {
  return async (name, args) => {
    if (name === "simular_pago_deuda") {
      return simulateDebtPayoff(toolContext.debts, args, new Date(), {
        currency: toolContext.currency,
        fxUnavailable: toolContext.fxUnavailable,
      });
    }
    return { error: `herramienta no disponible: ${name}` };
  };
}

const TOOLS_PROMPT_LINE =
  "Cuando el usuario pregunte cuánto tardaría en pagar su deuda o cuánto ahorraría abonando " +
  "extra, USÁ la herramienta de simulación; no inventes números. Los montos van en la moneda " +
  "principal del usuario; si la herramienta devuelve fx_no_disponible:true, aclaralo (el " +
  "cálculo asume una sola moneda).";

/**
 * Como financeChat, pero habilita function-calling cuando hay `toolContext` (chat web
 * con sesión) y el proveedor lo soporta: la IA invoca motores de SOLO lectura y da
 * números calculados, no inventados. Sin toolContext (p. ej. WhatsApp) o sin soporte
 * del proveedor → idéntico a financeChat. La IA sigue PROPONIENDO, nunca ejecuta.
 */
export async function financeChatWithTools(
  messages: ChatMessage[],
  ctx: FinancialContext,
  toolContext?: ToolContext,
): Promise<AIChatResponse & { tokensIn: number; tokensOut: number; provider: string }> {
  const provider = getProvider();
  if (!toolContext || !provider.chatWithTools) {
    return financeChat(messages, ctx);
  }
  const knowledge = buildKnowledge(messages, ctx);
  const result = await provider.chatWithTools({
    system: `${buildSystemPrompt({ ...ctx, knowledge })}\n\n${TOOLS_PROMPT_LINE}`,
    messages,
    tools: [SIMULATE_DEBT_TOOL],
    execute: buildToolExecutor(toolContext),
  });
  const parsed = parseAction(result.text);
  return {
    ...guardReply(parsed, ctx, provider.name),
    tokensIn: result.tokensIn,
    tokensOut: result.tokensOut,
    provider: provider.name,
  };
}

export type ReceiptExtract = {
  amount: number | null;
  merchant: string | null;
  date: string | null;
  category: string | null;
};

const RECEIPT_PROMPT =
  "Eres un extractor de recibos. Analiza la imagen y devuelve SOLO un JSON válido, sin texto extra, con esta forma: " +
  '{"amount": number|null, "merchant": string|null, "date": "YYYY-MM-DD"|null, "category": string|null}. ' +
  "El monto es el total pagado. La categoría debe ser una palabra simple en español (ej. supermercado, restaurante, transporte).";

export async function scanReceipt(
  imageBase64: string,
  mimeType: string,
): Promise<{ extract: ReceiptExtract; tokensIn: number; tokensOut: number; provider: string }> {
  const provider = getProvider();
  const result = await provider.vision({ imageBase64, mimeType, prompt: RECEIPT_PROMPT });
  const extract = parseReceipt(result.text);
  return {
    extract,
    tokensIn: result.tokensIn,
    tokensOut: result.tokensOut,
    provider: provider.name,
  };
}

function parseReceipt(text: string): ReceiptExtract {
  const empty: ReceiptExtract = { amount: null, merchant: null, date: null, category: null };
  const m = text.match(/\{[\s\S]*\}/);
  if (!m) return empty;
  try {
    const o = JSON.parse(m[0]) as Partial<ReceiptExtract>;
    return {
      amount: typeof o.amount === "number" ? o.amount : null,
      merchant: typeof o.merchant === "string" ? o.merchant : null,
      date: typeof o.date === "string" ? o.date : null,
      category: typeof o.category === "string" ? o.category : null,
    };
  } catch {
    return empty;
  }
}
