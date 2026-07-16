import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

import { GeminiProvider } from "@/lib/ai/providers/gemini";
import { toSafeResponse } from "@/lib/errors";

/**
 * Superficie de error de Gemini: cuando la IA falla, el usuario debe recibir un mensaje
 * específico con su código (IA-401/429/…) y el servidor debe dejar una línea "[gemini] …"
 * con el status real. Ejercita el camino COMPLETO — fetch → provider → AppError →
 * toSafeResponse → cuerpo que ve el cliente —, no solo el mapeo aislado.
 *
 * Existe porque el mapeo tiene seis ramas fáciles de romper en silencio, y porque el
 * marcador del log es frágil: el logger arma la entrada como { ts, level, message, ...meta },
 * así que un `message` en el meta borraría el "[gemini] …" y dejaría el log huérfano en
 * Vercel — justo lo que este cambio venía a evitar.
 */
const chatArgs = { system: "s", messages: [{ role: "user" as const, content: "hola" }] };

async function fallo(fetchImpl: unknown) {
  vi.stubGlobal("fetch", fetchImpl);
  try {
    await new GeminiProvider("k", "gemini-3.5-flash").chat(chatArgs);
    throw new Error("se esperaba un fallo del proveedor");
  } catch (e) {
    return { err: e as Error & { detail?: unknown }, body: toSafeResponse(e).body };
  }
}
const noOk = (status: number, body = "") =>
  vi.fn().mockResolvedValue({ ok: false, status, statusText: "", text: async () => body });

describe("superficie de error de Gemini", () => {
  let logs: string[] = [];
  beforeEach(() => {
    logs = [];
    vi.spyOn(console, "error").mockImplementation((l) => void logs.push(String(l)));
    vi.spyOn(console, "warn").mockImplementation(() => {});
  });
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("401: mensaje de credencial + log con el status real, sin filtrar la key", async () => {
    const { body } = await fallo(noOk(401, '{"error":{"message":"API key not valid"}}'));
    expect(body.error.message).toContain("(IA-401)");
    expect(body.error.message).toContain("credencial");

    const log = JSON.parse(logs.find((l) => l.includes("non-2xx"))!);
    expect(log).toMatchObject({ message: "[gemini] non-2xx", status: 401, model: "gemini-3.5-flash" });
    expect(log.bodySnippet).toContain("API key not valid"); // el motivo de Google, en el log
    expect(JSON.stringify(log)).not.toContain("key=k"); // la key, nunca
  });

  it("403 comparte el código de credencial", async () => {
    const { body } = await fallo(noOk(403));
    expect(body.error.message).toContain("(IA-401)");
  });

  it("429: límite de uso", async () => {
    const { body } = await fallo(noOk(429, '{"error":{"status":"RESOURCE_EXHAUSTED"}}'));
    expect(body.error.message).toContain("(IA-429)");
    expect(body.error.message).toContain("límite");
  }, 15000);

  it("400: solicitud rechazada", async () => {
    const { body } = await fallo(noOk(400));
    expect(body.error.message).toContain("(IA-400)");
  });

  it("5xx: se trata como demora", async () => {
    const { body } = await fallo(noOk(503));
    expect(body.error.message).toContain("(IA-503)");
  }, 15000);

  it("status sin caso propio: genérico + status crudo para rastrearlo", async () => {
    const { body } = await fallo(noOk(404));
    expect(body.error.message).toContain("(IA-404)");
    expect(body.error.message).toContain("Un servicio externo no respondió");
  });

  it("red: el marcador del log Y la causa sobreviven (el meta no pisa el message)", async () => {
    const { body } = await fallo(vi.fn().mockRejectedValue(new TypeError("fetch failed")));
    expect(body.error.message).toContain("(IA-NET)");
    expect(logs.some((l) => l.includes("[gemini] network"))).toBe(true);
    expect(logs.some((l) => l.includes("TypeError: fetch failed"))).toBe(true);
  }, 15000);

  it("timeout: no reintenta y deja su línea", async () => {
    const { body } = await fallo(
      vi.fn().mockImplementation(() => {
        const e = new Error("aborted");
        e.name = "AbortError";
        return Promise.reject(e);
      }),
    );
    expect(body.error.message).toContain("(IA-503)");
    expect(logs.some((l) => l.includes("[gemini] timeout"))).toBe(true);
  });

  it("el detail viaja estructurado: el caller decide sin parsear cadenas", async () => {
    const { err } = await fallo(noOk(401));
    expect(err.detail).toMatchObject({ provider: "gemini", model: "gemini-3.5-flash", reason: "http", status: 401 });
  });
});
