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
    return (await res.text()).slice(0, 500);
  } catch {
    return "";
  }
}

/**
 * Endpoint SIN la query string. La key viaja como `?key=…`, y el logger solo redacta por
 * NOMBRE de campo (`key`, `token`…), no por contenido: loguear la url entera filtraría el
 * secreto. Esto deja ver qué endpoint falló (generateContent vs batchEmbedContents) sin él.
 */
function safeEndpoint(url: string): string {
  return url.split("?")[0] ?? "";
}

/** Causa del fallo ya normalizada: es lo único que necesitan el log y el mensaje. */
type GeminiFailure =
  | { reason: "http"; status: number }
  | { reason: "timeout" }
  | { reason: "network" };

/**
 * Mensaje para el usuario según la causa, con un código corto entre paréntesis: es la pista
 * que se puede leer en una captura sin abrir los logs. Nunca incluye el cuerpo crudo de
 * Google — ese solo va al log del servidor.
 */
function userMessageFor(f: GeminiFailure): string {
  if (f.reason === "timeout") return "La IA tardó demasiado en responder. Intenta de nuevo. (IA-503)";
  if (f.reason === "network")
    return "No se pudo contactar la IA. Revisa tu conexión e intenta de nuevo. (IA-NET)";
  const s = f.status;
  if (s === 401 || s === 403)
    return "La IA no está disponible: su credencial no es válida o expiró. (IA-401)";
  if (s === 429) return "Alcanzaste el límite de uso de la IA por ahora. Intenta más tarde. (IA-429)";
  if (s === 400) return "La IA rechazó la solicitud (configuración/modelo). (IA-400)";
  if (s >= 500) return "La IA tardó demasiado en responder. Intenta de nuevo. (IA-503)";
  // Sin caso conocido: el genérico de siempre + el status crudo para poder rastrearlo.
  return `Un servicio externo no respondió. Inténtalo más tarde. (IA-${s})`;
}

/**
 * AppError de proveedor con la causa ya resuelta: mensaje específico para el usuario y
 * `detail` ESTRUCTURADO para que el route (o cualquier caller) pueda decidir sin volver a
 * llamar ni parsear cadenas. Antes el detail era un string ("gemini 429") y el usuario veía
 * siempre el genérico de PROVIDER_ERROR.
 */
function providerError(f: GeminiFailure, model: string): AppError {
  return new AppError("PROVIDER_ERROR", userMessageFor(f), {
    provider: "gemini",
    model,
    reason: f.reason,
    status: f.reason === "http" ? f.status : undefined,
  });
}

/**
 * POST JSON con timeout + reintentos transitorios (5xx/429 y red) → AppError. Genérico para
 * cualquier endpoint de Gemini (generateContent, batchEmbedContents).
 *
 * SUPERFICIE DE ERROR — cada fallo terminal deja dos rastros:
 *  1. Una línea `[gemini] non-2xx|timeout|network` en el log del servidor (visible en Vercel)
 *     con el status real, el endpoint sin la key y un extracto del cuerpo de Google.
 *  2. Un AppError con mensaje ESPECÍFICO para el usuario y un código corto (IA-401/429/…)
 *     que se puede leer en una captura, más un `detail` estructurado para el caller.
 * Los mensajes salen de aquí porque es el único sitio que conoce el status; toSafeResponse ya
 * propaga `userMessage` tal cual, así que chat y escáner de recibos lo heredan sin tocarlos.
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
          logger.error("[gemini] timeout", {
            model,
            endpoint: safeEndpoint(url),
            ms: TIMEOUT_MS,
            attempt,
          });
          throw providerError({ reason: "timeout" }, model);
        }
        // Error de red transitorio (p. ej. TypeError): reintentar.
        if (isLast) {
          // OJO: la causa va en `cause`, NO en `message`. El logger construye la entrada como
          // { ts, level, message, ...meta }, así que un `message` en el meta PISA el nombre
          // del log y esta línea saldría en Vercel sin el marcador "[gemini] network".
          logger.error("[gemini] network", {
            model,
            endpoint: safeEndpoint(url),
            cause: e instanceof Error ? `${e.name}: ${e.message}` : String(e),
            attempt,
          });
          throw providerError({ reason: "network" }, model);
        }
        await sleep(backoffMs(attempt));
        continue;
      }
      if (res.ok) return await res.json();
      // No-ok transitorio (5xx/429) con reintentos disponibles: avisar y reintentar.
      if (isRetryableStatus(res.status) && !isLast) {
        logger.warn("[gemini] status transitorio, reintentando", {
          model,
          status: res.status,
          attempt,
        });
        await sleep(backoffMs(attempt));
        continue;
      }
      // Terminal (4xx no reintentable, o transitorio ya sin reintentos): esta línea es la que
      // hay que buscar en Vercel — lleva el status REAL y el motivo que devolvió Google.
      const bodySnippet = await errorBodyExcerpt(res);
      logger.error("[gemini] non-2xx", {
        model,
        endpoint: safeEndpoint(url),
        status: res.status,
        statusText: res.statusText,
        retryable: isRetryableStatus(res.status),
        attempt,
        bodySnippet,
      });
      throw providerError({ reason: "http", status: res.status }, model);
    } finally {
      clearTimeout(timer);
    }
  }
  // Inalcanzable (el loop siempre retorna o lanza), pero satisface el tipo.
  throw new AppError("PROVIDER_ERROR", undefined, { provider: "gemini", model, reason: "unknown" });
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
