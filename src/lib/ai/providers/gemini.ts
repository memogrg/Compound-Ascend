import "server-only";

/**
 * Adaptador Gemini (REST). No expone la key al cliente. Con timeout y manejo de
 * errores; nunca registra secretos.
 */
import type { AIProvider, AIChatResult, ChatMessage, VisionInput } from "@/lib/ai/provider";
import {
  runToolLoop,
  type AiToolDecl,
  type AiToolExecutor,
  type ModelTurn,
  type ToolCallRecord,
} from "@/lib/ai/tools";
import { getServerEnv } from "@/lib/env";
import { AppError } from "@/lib/errors";
import { logger } from "@/lib/logger";

// Modelo de VISIÓN/recibos (alto volumen, salida estructurada): flash barato, no necesita el
// modelo de asesoría. También es el fallback del constructor. El modelo de CHAT/asesoría es
// configurable por env (GEMINI_MODEL, default gemini-3.5-flash) y lo inyecta createGeminiProvider.
const VISION_MODEL = "gemini-2.5-flash";
const MODEL = VISION_MODEL;
const BASE = "https://generativelanguage.googleapis.com/v1beta/models";
// Timeout por llamada. Subido de 20s a 35s: producción usa gemini-3.5-flash, más lento que el
// gemini-2.5-flash para el que se calibró 20s → a 20s se abortaban llamadas legítimas. Con
// maxDuration=60 en las rutas hay margen de sobra, así que 35s da aire sin arriesgar el
// presupuesto total. La lógica de reintentos no cambia.
const TIMEOUT_MS = 35000;
// Reintentos para hipos transitorios del proveedor (5xx/429 y errores de red).
const MAX_ATTEMPTS = 3; // 1 intento + 2 reintentos
const RETRY_BASE_MS = 400;
// Desactiva el "thinking" de 2.5 (consume tokens de salida y encarece/retrasa);
// para asesoría conversacional y extracción de recibos no aporta y sí estabiliza.
const THINKING_OFF = { thinkingBudget: 0 };

// Solo los modelos flash/lite permiten DESACTIVAR el thinking (thinkingBudget:0). Los de
// razonamiento (p. ej. *-pro) lo REQUIEREN activo y rechazan el override → para ellos devolvemos
// undefined (que JSON.stringify descarta) y usan su thinking por defecto. Producción
// (gemini-2.5-flash) es flash → sin cambios.
function thinkingConfigFor(model: string): typeof THINKING_OFF | undefined {
  return /flash|lite/i.test(model) ? THINKING_OFF : undefined;
}

type GeminiPart = {
  text?: string;
  functionCall?: { name: string; args?: Record<string, unknown> };
  // Firma opaca del razonamiento (Gemini 3.x) adjunta a la functionCall; hay que reenviarla.
  thoughtSignature?: string;
};
type GeminiResponse = {
  candidates?: { content?: { parts?: GeminiPart[] } }[];
  // thoughtsTokenCount: tokens de "thinking" (facturados como salida). En flash con thinking
  // OFF es 0 → prod sin cambios; en modelos de razonamiento es real y cuenta para el costo.
  usageMetadata?: {
    promptTokenCount?: number;
    candidatesTokenCount?: number;
    thoughtsTokenCount?: number;
  };
};

/** Salida facturable = tokens de respuesta + tokens de thinking (0 en flash con thinking off). */
function outTokens(u: GeminiResponse["usageMetadata"]): number {
  return (u?.candidatesTokenCount ?? 0) + (u?.thoughtsTokenCount ?? 0);
}

/** Solo reintentar fallos transitorios: 5xx del servidor o 429 (rate limit). */
export function isRetryableStatus(status: number): boolean {
  return status >= 500 || status === 429;
}

/** Backoff exponencial corto con jitter acotado: ~400-600ms, ~800-1000ms, … */
export function backoffMs(attempt: number): number {
  const base = RETRY_BASE_MS * 2 ** attempt;
  const jitter = Math.random() * (RETRY_BASE_MS / 2);
  return base + jitter;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Extracto corto y seguro del cuerpo de error para el log. La GEMINI_API_KEY viaja en la URL
 * (query string), NO en el cuerpo, así que el body de error de Gemini no la contiene; aun así
 * lo truncamos. Defensivo: si el Response no expone `.text()` (mocks de test) o la lectura
 * falla, devuelve "".
 */
async function errorBodyExcerpt(res: Response): Promise<string> {
  try {
    if (typeof res.text !== "function") return "";
    return (await res.text()).slice(0, 200);
  } catch {
    return "";
  }
}

/**
 * POST JSON con timeout + reintentos transitorios (5xx/429 y red) → AppError. Genérico para
 * cualquier endpoint de Gemini (generateContent, batchEmbedContents). Mismo contrato que antes.
 * `model` es SOLO para el log accionable (nunca la URL con la key). Antes de lanzar el
 * PROVIDER_ERROR genérico, registra la causa real (status/abort/red + modelo + extracto del
 * cuerpo) para distinguir en Vercel cuota (429/RESOURCE_EXHAUSTED) de timeout o 5xx.
 */
async function postJsonWithRetry(url: string, body: unknown, model: string): Promise<unknown> {
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const isLast = attempt === MAX_ATTEMPTS - 1;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
      let res: Response;
      try {
        res = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
          signal: controller.signal,
        });
      } catch (e) {
        // Timeout (AbortError): no reintentar para no apilar esperas.
        if (e instanceof Error && e.name === "AbortError") {
          logger.error("gemini: llamada abortada por timeout", {
            model,
            abort: true,
            timeoutMs: TIMEOUT_MS,
            attempt,
          });
          throw new AppError("PROVIDER_ERROR", undefined, "gemini timeout");
        }
        // Error de red transitorio (p. ej. TypeError): reintentar.
        if (isLast) {
          logger.error("gemini: error de red tras agotar reintentos", {
            model,
            network: e instanceof Error ? e.name : "?",
            attempt,
          });
          throw new AppError("PROVIDER_ERROR", undefined, "gemini network");
        }
        await sleep(backoffMs(attempt));
        continue;
      }
      if (res.ok) return await res.json();
      // No-ok transitorio (5xx/429) con reintentos disponibles: avisar y reintentar.
      if (isRetryableStatus(res.status) && !isLast) {
        logger.warn("gemini: status transitorio, reintentando", {
          model,
          status: res.status,
          attempt,
        });
        await sleep(backoffMs(attempt));
        continue;
      }
      // Terminal (4xx no reintentable, o transitorio ya sin reintentos): log con status + cuerpo.
      const excerpt = await errorBodyExcerpt(res);
      logger.error("gemini: respuesta no-2xx", {
        model,
        status: res.status,
        retryable: isRetryableStatus(res.status),
        attempt,
        body: excerpt,
      });
      throw new AppError("PROVIDER_ERROR", undefined, `gemini ${res.status}`);
    } finally {
      clearTimeout(timer);
    }
  }
  // Inalcanzable (el loop siempre retorna o lanza), pero satisface el tipo.
  throw new AppError("PROVIDER_ERROR", undefined, "gemini");
}

async function call(key: string, model: string, body: unknown): Promise<GeminiResponse> {
  return (await postJsonWithRetry(
    `${BASE}/${model}:generateContent?key=${key}`,
    body,
    model,
  )) as GeminiResponse;
}

// Embeddings (Fase 2b-1): modelo dedicado y dimensión fija para la columna vector(768).
const EMBED_MODEL = "gemini-embedding-001";
const EMBED_DIM = 768;

type BatchEmbedResponse = { embeddings?: { values?: number[] }[] };

/**
 * Embebe `texts` en lote con :batchEmbedContents (outputDimensionality 768). taskType
 * RETRIEVAL_DOCUMENT al sembrar el corpus, RETRIEVAL_QUERY para consultas (Fase 2b-2). Mismo
 * timeout/retry/AppError que `call`. Sin GEMINI_API_KEY lanza AppError (el caller hará fallback).
 */
export async function embedTexts(
  texts: string[],
  taskType: "RETRIEVAL_DOCUMENT" | "RETRIEVAL_QUERY",
): Promise<number[][]> {
  if (texts.length === 0) return [];
  const key = getServerEnv().GEMINI_API_KEY;
  if (!key) throw new AppError("PROVIDER_ERROR", undefined, "gemini embed: sin API key");
  const body = {
    requests: texts.map((text) => ({
      model: `models/${EMBED_MODEL}`,
      content: { parts: [{ text }] },
      taskType,
      outputDimensionality: EMBED_DIM,
    })),
  };
  const json = (await postJsonWithRetry(
    `${BASE}/${EMBED_MODEL}:batchEmbedContents?key=${key}`,
    body,
    EMBED_MODEL,
  )) as BatchEmbedResponse;
  return (json.embeddings ?? []).map((e) => e.values ?? []);
}

function extract(r: GeminiResponse): AIChatResult {
  const text = r.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("") ?? "";
  return {
    text,
    tokensIn: r.usageMetadata?.promptTokenCount ?? 0,
    tokensOut: outTokens(r.usageMetadata),
  };
}

/** Interpreta la respuesta como un turno del loop: functionCall o texto. */
function parseTurn(r: GeminiResponse): ModelTurn {
  const parts = r.candidates?.[0]?.content?.parts ?? [];
  const tokensIn = r.usageMetadata?.promptTokenCount ?? 0;
  const tokensOut = outTokens(r.usageMetadata);
  const fcPart = parts.find((p) => p.functionCall);
  const fc = fcPart?.functionCall;
  if (fc) {
    return {
      kind: "call",
      name: fc.name,
      args: fc.args ?? {},
      thoughtSignature: fcPart?.thoughtSignature,
      tokensIn,
      tokensOut,
    };
  }
  const text = parts.map((p) => p.text ?? "").join("");
  return { kind: "text", text, tokensIn, tokensOut };
}

export class GeminiProvider implements AIProvider {
  readonly name = "gemini";
  readonly model: string;
  private key: string;

  // `model` es aditivo: default = el modelo de producción. Permite instanciar el
  // provider apuntando a otro modelo (p. ej. evals vivos que comparan motores).
  constructor(key: string, model: string = MODEL) {
    this.key = key;
    this.model = model;
  }

  async chat({
    system,
    messages,
    maxTokens = 1024,
  }: {
    system: string;
    messages: ChatMessage[];
    maxTokens?: number;
  }): Promise<AIChatResult> {
    const contents = messages
      .filter((m) => m.role !== "system")
      .map((m) => ({
        role: m.role === "assistant" ? "model" : "user",
        parts: [{ text: m.content }],
      }));
    const body = {
      system_instruction: { parts: [{ text: system }] },
      contents,
      generationConfig: {
        maxOutputTokens: maxTokens,
        temperature: 0.4,
        thinkingConfig: thinkingConfigFor(this.model),
      },
    };
    return extract(await call(this.key, this.model, body));
  }

  async vision({ imageBase64, mimeType, prompt }: VisionInput): Promise<AIChatResult> {
    const body = {
      contents: [
        {
          role: "user",
          parts: [{ text: prompt }, { inline_data: { mime_type: mimeType, data: imageBase64 } }],
        },
      ],
      generationConfig: {
        maxOutputTokens: 512,
        temperature: 0.1,
        thinkingConfig: thinkingConfigFor(VISION_MODEL),
      },
    };
    // Recibos SIEMPRE en el flash barato, independiente del modelo de chat del provider.
    return extract(await call(this.key, VISION_MODEL, body));
  }

  async chatWithTools({
    system,
    messages,
    tools,
    execute,
    maxTokens = 1024,
  }: {
    system: string;
    messages: ChatMessage[];
    tools: AiToolDecl[];
    execute: AiToolExecutor;
    maxTokens?: number;
  }): Promise<AIChatResult> {
    const baseContents = messages
      .filter((m) => m.role !== "system")
      .map((m) => ({
        role: m.role === "assistant" ? "model" : "user",
        parts: [{ text: m.content }],
      }));

    // `ask` reconstruye los `contents` con cada functionCall/functionResponse ya
    // ejecutados: turno model con el functionCall + turno tool con el functionResponse
    // (rol "tool", contrato REST de Gemini).
    const ask = async (priorCalls: ToolCallRecord[]): Promise<ModelTurn> => {
      const contents: unknown[] = [...baseContents];
      for (const c of priorCalls) {
        // Reenviamos el thoughtSignature junto a la functionCall (lo exigen los modelos 3.x;
        // undefined en flash → JSON.stringify lo descarta y el contrato queda igual que antes).
        contents.push({
          role: "model",
          parts: [{ functionCall: { name: c.name, args: c.args }, thoughtSignature: c.thoughtSignature }],
        });
        contents.push({
          role: "tool",
          parts: [{ functionResponse: { name: c.name, response: { result: c.result } } }],
        });
      }
      const body = {
        system_instruction: { parts: [{ text: system }] },
        contents,
        tools: [{ functionDeclarations: tools }],
        generationConfig: {
          maxOutputTokens: maxTokens,
          temperature: 0.4,
          thinkingConfig: thinkingConfigFor(this.model),
        },
      };
      return parseTurn(await call(this.key, this.model, body));
    };

    return runToolLoop({ ask, execute });
  }
}

export function createGeminiProvider(model?: string): GeminiProvider | null {
  const env = getServerEnv();
  // Chat/asesoría: modelo explícito (evals) o el configurado por env (default gemini-3.5-flash).
  return env.GEMINI_API_KEY ? new GeminiProvider(env.GEMINI_API_KEY, model ?? env.GEMINI_MODEL) : null;
}
