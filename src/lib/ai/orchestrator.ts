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
import { selectPatrimonioGuidance } from "@/lib/ai/biblia-knowledge";
import { retrieveBiblia } from "@/lib/ai/biblia-retrieval";
import {
  SIMULATE_DEBT_TOOL,
  COMPARE_DEBT_TOOL,
  PROJECT_INVESTMENT_TOOL,
  FREEDOM_TOOL,
  simulateDebtPayoff,
  compareDebtStrategies,
  projectInvestment,
  projectFreedom,
  type AiToolExecutor,
} from "@/lib/ai/tools";
import type { DebtInput } from "@/modules/control/engine/debt-strategy";
import { convertCurrency } from "@/lib/fx";

export type { FinancialContext };

/**
 * Datos de solo lectura que habilitan las herramientas (chat web con sesión). Las
 * deudas vienen YA normalizadas a `currency` (la moneda principal); `fxUnavailable`
 * marca que no se pudieron convertir (cálculo asume una sola moneda). `freedomNumber` e
 * `investableWealth` (Número de Libertad y patrimonio invertible, en moneda PRINCIPAL) son
 * opcionales y best-effort: si no se pudieron leer, la tool de libertad lo aclara.
 */
export type ToolContext = {
  debts: DebtInput[];
  currency: string;
  fxUnavailable?: boolean;
  freedomNumber?: number;
  investableWealth?: number;
};

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
  // Seam de inyección (ADITIVO): por defecto el proveedor real; los evals end-to-end
  // inyectan un proveedor scripted. Ningún caller actual cambia (param opcional).
  provider: AIProvider = getProvider(),
): Promise<AIChatResponse & { tokensIn: number; tokensOut: number; provider: string }> {
  // Recuperación de la Biblia: emoción dominante (determinista) + temas (semántico con
  // fallback keyword) del último mensaje → guía conductual inyectada en el system prompt.
  const lastUser = [...messages].reverse().find((m) => m.role === "user")?.content;
  // Biblia conductual + guía patrimonial §15 (banderas del diagnóstico), fusionadas y acotadas.
  const knowledge = [
    ...(await retrieveBiblia({ emotion: ctx.dominantEmotion, text: lastUser })),
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
async function buildKnowledge(messages: ChatMessage[], ctx: FinancialContext): Promise<string[]> {
  const lastUser = [...messages].reverse().find((m) => m.role === "user")?.content;
  return [
    ...(await retrieveBiblia({ emotion: ctx.dominantEmotion, text: lastUser })),
    ...selectPatrimonioGuidance(ctx.patrimonioDiagnosis ?? []),
  ].slice(0, 5);
}

/**
 * Construye el ejecutor de herramientas (SOLO lectura/cálculo) con los datos del
 * usuario. Mapea cada nombre de tool a su motor puro; herramienta desconocida → error
 * explicable (nunca escribe nada).
 */
export function buildToolExecutor(toolContext: ToolContext): AiToolExecutor {
  const meta = { currency: toolContext.currency, fxUnavailable: toolContext.fxUnavailable };
  return async (name, args) => {
    if (name === "simular_pago_deuda") {
      return simulateDebtPayoff(toolContext.debts, args, new Date(), meta);
    }
    if (name === "comparar_estrategias_deuda") {
      return compareDebtStrategies(toolContext.debts, args, new Date(), meta);
    }
    if (name === "proyectar_inversion") {
      // Pura: solo necesita la moneda principal (no ToolContext nuevo).
      return projectInvestment(args, toolContext.currency);
    }
    if (name === "proyectar_libertad_financiera") {
      // Datos reales del usuario (número + invertible), ya en moneda principal.
      return projectFreedom(args, {
        freedomNumber: toolContext.freedomNumber,
        investableWealth: toolContext.investableWealth,
        currency: toolContext.currency,
      });
    }
    return { error: `herramienta no disponible: ${name}` };
  };
}

export const TOOLS_PROMPT_LINE =
  "Cuando el usuario pregunte cuánto tardaría en pagar su deuda o cuánto ahorraría abonando " +
  "extra, USÁ la herramienta de simulación; no inventes números. Los montos van en la moneda " +
  "principal del usuario; si la herramienta devuelve fx_no_disponible:true, aclaralo (el " +
  "cálculo asume una sola moneda). Si el usuario pregunta qué estrategia le conviene " +
  "(avalancha vs bola de nieve), USÁ comparar_estrategias_deuda y explicá cuál ahorra más " +
  "intereses y cuál da victorias más rápido; no inventes. Si pregunta cuánto podría crecer su " +
  "dinero, en cuánto llegaría a una meta o a su Número de Libertad, USÁ proyectar_inversion; no " +
  "inventes cifras de crecimiento y aclará que el rendimiento es un SUPUESTO, no una garantía. " +
  "Si pregunta cuánto le falta o cuánto al mes para SU libertad financiera, USÁ " +
  "proyectar_libertad_financiera (usa su patrimonio real); si devuelve disponible:false, decile " +
  "que primero registre gastos/patrimonio para calcular su Número de Libertad.";

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
  // Seam de inyección (ADITIVO): mismo proveedor para el fallback sin tools.
  provider: AIProvider = getProvider(),
): Promise<AIChatResponse & { tokensIn: number; tokensOut: number; provider: string }> {
  if (!toolContext || !provider.chatWithTools) {
    return financeChat(messages, ctx, provider);
  }
  const knowledge = await buildKnowledge(messages, ctx);
  const result = await provider.chatWithTools({
    system: `${buildSystemPrompt({ ...ctx, knowledge })}\n\n${TOOLS_PROMPT_LINE}`,
    messages,
    tools: [SIMULATE_DEBT_TOOL, COMPARE_DEBT_TOOL, PROJECT_INVESTMENT_TOOL, FREEDOM_TOOL],
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
