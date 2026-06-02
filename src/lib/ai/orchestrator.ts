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

export type FinancialContext = {
  name?: string;
  currency: string;
  incomeMonthly?: number;
  expenseMonthly?: number;
  freeCashflow?: number;
  netWorth?: number;
  topConcern?: string;
};

function getProvider(): AIProvider {
  if (getServerEnv().AI_PROVIDER === "gemini") {
    const g = createGeminiProvider();
    if (g) return g;
  }
  return new StubProvider();
}

function buildSystemPrompt(ctx: FinancialContext): string {
  const facts: string[] = [`Moneda principal: ${ctx.currency}.`];
  if (ctx.name) facts.push(`El usuario se llama ${ctx.name}.`);
  if (ctx.incomeMonthly !== undefined) facts.push(`Ingreso mensual: ${ctx.incomeMonthly} ${ctx.currency}.`);
  if (ctx.expenseMonthly !== undefined) facts.push(`Gasto mensual: ${ctx.expenseMonthly} ${ctx.currency}.`);
  if (ctx.freeCashflow !== undefined) facts.push(`Flujo libre: ${ctx.freeCashflow} ${ctx.currency}.`);
  if (ctx.netWorth !== undefined) facts.push(`Patrimonio neto: ${ctx.netWorth} ${ctx.currency}.`);
  if (ctx.topConcern) facts.push(`Principal preocupación: ${ctx.topConcern}.`);

  return [
    "Eres Ascend AI, el asesor financiero personal de la app Compound Ascend.",
    "Responde SIEMPRE en español, con tono humano, claro y sin culpa. Explica el porqué de cada recomendación.",
    "No prometas rendimientos garantizados. No des consejos de inversión específicos como certezas; habla de escenarios, riesgos y horizonte.",
    "Usa solo el contexto financiero proporcionado; no inventes datos del usuario.",
    "",
    "Contexto financiero autorizado del usuario:",
    ...facts.map((f) => `- ${f}`),
    "",
    "Si el usuario claramente quiere registrar una transacción, crear una meta, o aplicar una estrategia, PROPÓN una acción añadiendo al final un bloque:",
    "```action",
    '{"type":"create_transaction","payload":{"kind":"gasto","description":"...","amount":0,"currency":"' +
      ctx.currency +
      '","category":null},"summary":"texto corto"}',
    "```",
    "Tipos válidos: create_transaction, create_goal, suggest_debt_strategy, suggest_budget_adjustment.",
    "NUNCA afirmes que ya ejecutaste la acción: solo la propones; el usuario debe confirmar.",
  ].join("\n");
}

export async function financeChat(
  messages: ChatMessage[],
  ctx: FinancialContext,
): Promise<AIChatResponse & { tokensIn: number; tokensOut: number; provider: string }> {
  const provider = getProvider();
  const result = await provider.chat({ system: buildSystemPrompt(ctx), messages });
  const parsed = parseAction(result.text);
  return { ...parsed, tokensIn: result.tokensIn, tokensOut: result.tokensOut, provider: provider.name };
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
  return { extract, tokensIn: result.tokensIn, tokensOut: result.tokensOut, provider: provider.name };
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
