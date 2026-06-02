import "server-only";

/**
 * Adaptador Gemini (REST). No expone la key al cliente. Con timeout y manejo de
 * errores; nunca registra secretos.
 */
import type { AIProvider, AIChatResult, ChatMessage, VisionInput } from "@/lib/ai/provider";
import { getServerEnv } from "@/lib/env";
import { AppError } from "@/lib/errors";

const MODEL = "gemini-1.5-flash";
const BASE = "https://generativelanguage.googleapis.com/v1beta/models";
const TIMEOUT_MS = 20000;

type GeminiResponse = {
  candidates?: { content?: { parts?: { text?: string }[] } }[];
  usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number };
};

async function call(key: string, body: unknown): Promise<GeminiResponse> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(`${BASE}/${MODEL}:generateContent?key=${key}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    if (!res.ok) throw new AppError("PROVIDER_ERROR", undefined, `gemini ${res.status}`);
    return (await res.json()) as GeminiResponse;
  } finally {
    clearTimeout(timer);
  }
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
      .map((m) => ({ role: m.role === "assistant" ? "model" : "user", parts: [{ text: m.content }] }));
    const body = {
      system_instruction: { parts: [{ text: system }] },
      contents,
      generationConfig: { maxOutputTokens: maxTokens, temperature: 0.4 },
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
      generationConfig: { maxOutputTokens: 512, temperature: 0.1 },
    };
    return extract(await call(this.key, body));
  }
}

export function createGeminiProvider(): GeminiProvider | null {
  const key = getServerEnv().GEMINI_API_KEY;
  return key ? new GeminiProvider(key) : null;
}
