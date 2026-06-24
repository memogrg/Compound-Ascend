import "server-only";

/**
 * Adaptador Gemini (REST). No expone la key al cliente. Con timeout y manejo de
 * errores; nunca registra secretos.
 */
import type { AIProvider, AIChatResult, ChatMessage, VisionInput } from "@/lib/ai/provider";
import { getServerEnv } from "@/lib/env";
import { AppError } from "@/lib/errors";

const MODEL = "gemini-2.5-flash";
const BASE = "https://generativelanguage.googleapis.com/v1beta/models";
const TIMEOUT_MS = 20000;
// Reintentos para hipos transitorios del proveedor (5xx/429 y errores de red).
const MAX_ATTEMPTS = 3; // 1 intento + 2 reintentos
const RETRY_BASE_MS = 400;
// Desactiva el "thinking" de 2.5 (consume tokens de salida y encarece/retrasa);
// para asesoría conversacional y extracción de recibos no aporta y sí estabiliza.
const THINKING_OFF = { thinkingBudget: 0 };

type GeminiResponse = {
  candidates?: { content?: { parts?: { text?: string }[] } }[];
  usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number };
};

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

async function call(key: string, body: unknown): Promise<GeminiResponse> {
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const isLast = attempt === MAX_ATTEMPTS - 1;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
      let res: Response;
      try {
        res = await fetch(`${BASE}/${MODEL}:generateContent?key=${key}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
          signal: controller.signal,
        });
      } catch (e) {
        // Timeout (AbortError): no reintentar para no apilar esperas de 20s.
        if (e instanceof Error && e.name === "AbortError") {
          throw new AppError("PROVIDER_ERROR", undefined, "gemini timeout");
        }
        // Error de red transitorio (p. ej. TypeError): reintentar.
        if (isLast) throw new AppError("PROVIDER_ERROR", undefined, "gemini network");
        await sleep(backoffMs(attempt));
        continue;
      }
      if (res.ok) return (await res.json()) as GeminiResponse;
      // No-ok transitorio (5xx/429): reintentar; el resto se lanza ya.
      if (isRetryableStatus(res.status) && !isLast) {
        await sleep(backoffMs(attempt));
        continue;
      }
      throw new AppError("PROVIDER_ERROR", undefined, `gemini ${res.status}`);
    } finally {
      clearTimeout(timer);
    }
  }
  // Inalcanzable (el loop siempre retorna o lanza), pero satisface el tipo.
  throw new AppError("PROVIDER_ERROR", undefined, "gemini");
}

function extract(r: GeminiResponse): AIChatResult {
  const text = r.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("") ?? "";
  return {
    text,
    tokensIn: r.usageMetadata?.promptTokenCount ?? 0,
    tokensOut: r.usageMetadata?.candidatesTokenCount ?? 0,
  };
}

export class GeminiProvider implements AIProvider {
  readonly name = "gemini";
  readonly model = MODEL;
  private key: string;

  constructor(key: string) {
    this.key = key;
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
        thinkingConfig: THINKING_OFF,
      },
    };
    return extract(await call(this.key, body));
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
        thinkingConfig: THINKING_OFF,
      },
    };
    return extract(await call(this.key, body));
  }
}

export function createGeminiProvider(): GeminiProvider | null {
  const key = getServerEnv().GEMINI_API_KEY;
  return key ? new GeminiProvider(key) : null;
}
