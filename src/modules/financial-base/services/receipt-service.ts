import "server-only";

/**
 * Extracción de datos de un recibo (OCR asistido por IA). Reutiliza el proveedor
 * de visión (Gemini). Respeta el presupuesto de tokens por plan. El resultado se
 * REVISA y confirma antes de guardar (nunca se persiste automáticamente).
 */
import { requireUser } from "@/lib/auth/session";
import { createGeminiProvider } from "@/lib/ai/providers/gemini";
import { assertTokenBudget, recordUsage } from "@/lib/ai/usage";
import { logger } from "@/lib/logger";

export type ReceiptExtraction = {
  amount: number | null;
  date: string | null; // YYYY-MM-DD
  merchant: string | null;
  currency: string | null;
  confidence: number; // 0-1 (interno, no se muestra al usuario)
  configured: boolean;
};

const PROMPT = `Eres un extractor de recibos. Analiza la imagen y devuelve SOLO un objeto JSON válido (sin texto adicional, sin markdown) con esta forma:
{"amount": number|null, "date": "YYYY-MM-DD"|null, "merchant": string|null, "currency": "CRC"|"USD"|"EUR"|"MXN"|"COP"|"GBP"|null, "confidence": number}
- amount: el TOTAL pagado (solo el número, sin símbolos).
- date: la fecha del recibo en formato YYYY-MM-DD.
- merchant: el nombre del comercio.
- currency: la moneda detectada (₡=CRC, $=USD).
- confidence: 0 a 1 según tu certeza.
Si un dato no aparece, usa null.`;

function parseJson(text: string): Record<string, unknown> | null {
  const cleaned = text.replace(/```json/gi, "").replace(/```/g, "").trim();
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start === -1 || end === -1) return null;
  try {
    return JSON.parse(cleaned.slice(start, end + 1)) as Record<string, unknown>;
  } catch {
    return null;
  }
}

const SUPPORTED = ["CRC", "USD", "EUR", "MXN", "COP", "GBP"];

export async function extractReceipt(imageBase64: string, mimeType: string): Promise<ReceiptExtraction> {
  const user = await requireUser();
  const provider = createGeminiProvider();
  if (!provider) {
    return { amount: null, date: null, merchant: null, currency: null, confidence: 0, configured: false };
  }

  await assertTokenBudget(user.id); // respeta PLAN_TOKEN_LIMITS (lanza si excede)

  try {
    const res = await provider.vision({ imageBase64, mimeType, prompt: PROMPT });
    await recordUsage(user.id, res.tokensIn, res.tokensOut);
    const data = parseJson(res.text) ?? {};

    const amount = typeof data.amount === "number" && data.amount > 0 ? data.amount : null;
    const dateRaw = typeof data.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(data.date) ? data.date : null;
    const merchant = typeof data.merchant === "string" && data.merchant.trim() ? data.merchant.trim().slice(0, 120) : null;
    const curRaw = typeof data.currency === "string" ? data.currency.toUpperCase() : null;
    const currency = curRaw && SUPPORTED.includes(curRaw) ? curRaw : null;
    const confidence = typeof data.confidence === "number" ? Math.max(0, Math.min(1, data.confidence)) : 0.5;

    return { amount, date: dateRaw, merchant, currency, confidence, configured: true };
  } catch (err) {
    logger.error("extractReceipt fallido", { message: err instanceof Error ? err.message : "?" });
    return { amount: null, date: null, merchant: null, currency: null, confidence: 0, configured: true };
  }
}
