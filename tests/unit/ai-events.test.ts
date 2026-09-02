import { describe, it, expect, vi, beforeEach } from "vitest";

// EVENTOS DE IA: los mismos números que ya se loguean, persistidos para poder leerlos semanas
// después. Dos cosas se prueban acá: que NUNCA rompa la respuesta del chat (best-effort estricto),
// y que lo que se escribe sean SOLO métricas — ningún campo de contenido.

vi.mock("server-only", () => ({}));

let configurado = true;
vi.mock("@/lib/auth/session", () => ({ isSupabaseConfigured: () => configurado }));

const insert = vi.fn(async (_row: unknown) => ({ error: null as { message: string } | null }));
const from = vi.fn((_t: string) => ({ insert }));
let clienteExplota = false;
vi.mock("@/lib/supabase/service-role", () => ({
  createServiceRoleClient: () => {
    if (clienteExplota) throw new Error("service-role no configurado");
    return { from };
  },
}));

const warn = vi.fn();
vi.mock("@/lib/logger", () => ({ logger: { warn: (...a: unknown[]) => warn(...a), info: vi.fn() } }));

import { recordAiEvent } from "@/lib/ai/events";

/** Campos de contenido que JAMÁS pueden viajar a la tabla. */
const PROHIBIDOS = ["content", "reply", "message", "resumen_md", "prompt", "text", "args"];

beforeEach(() => {
  vi.clearAllMocks();
  configurado = true;
  clienteExplota = false;
  insert.mockResolvedValue({ error: null });
});

describe("recordAiEvent · qué se escribe", () => {
  it("evento de herramienta: nombre, duración, ok y el largo del bloque redactado", async () => {
    await recordAiEvent("u1", { kind: "tool", name: "comparar_abonar_vs_invertir", ms: 1234, ok: true, resumenLen: 1800 });

    expect(from).toHaveBeenCalledWith("ai_events");
    expect(insert).toHaveBeenCalledWith({
      user_id: "u1",
      event: "tool",
      name: "comparar_abonar_vs_invertir",
      ms: 1234,
      ok: true,
      resumen_len: 1800,
    });
  });

  it("evento de carril: lane, tokens, el largo del reply y la latencia del turno", async () => {
    await recordAiEvent("u1", { kind: "lane", lane: "deep", tokensIn: 0, tokensOut: 0, replyLen: 2400, ms: 1850 });

    expect(insert).toHaveBeenCalledWith({
      user_id: "u1",
      event: "lane",
      name: "deep",
      tokens_in: 0,
      tokens_out: 0,
      reply_len: 2400,
      ms: 1850,
    });
  });

  it("carril sin latencia → ms null (el turno se registra igual, sin inventar un 0)", async () => {
    // Un 0 leería como "tardó nada" y hundiría el p50 del carril; null es "no se midió".
    await recordAiEvent("u1", { kind: "lane", lane: "deep", tokensIn: 0, tokensOut: 0, replyLen: 2400 });
    expect(insert).toHaveBeenCalledWith(expect.objectContaining({ event: "lane", ms: null }));
  });

  it("guard: la CAUSA queda durable (el log de Vercel dura horas; esto es la tasa de honestidad)", async () => {
    await recordAiEvent("u1", { kind: "guard", causa: "movimientos" });
    expect(insert).toHaveBeenCalledWith({ user_id: "u1", event: "guard", name: "movimientos" });
  });

  it("acción: el prefijo separa las dos mitades de la tasa de acción sin emparejar filas", async () => {
    // Una propuesta puede confirmarse minutos después, o al día siguiente: forzar el emparejamiento
    // exacto haría el rollup dependiente del orden. Dos contadores distintos, una resta.
    await recordAiEvent("u1", { kind: "action", tipo: "create_goal", confirmada: false });
    expect(insert).toHaveBeenCalledWith({ user_id: "u1", event: "action", name: "propuesta:create_goal" });

    await recordAiEvent("u1", { kind: "action", tipo: "create_goal", confirmada: true });
    expect(insert).toHaveBeenCalledWith({ user_id: "u1", event: "action", name: "confirmada:create_goal" });
  });

  it("fallo del proveedor: la razón real, marcado ok=false", async () => {
    // Sin la razón, "la IA anda mal" no se distingue de "nos rate-limitearon".
    await recordAiEvent("u1", { kind: "provider_error", razon: "http_429" });
    expect(insert).toHaveBeenCalledWith({
      user_id: "u1",
      event: "provider_error",
      name: "http_429",
      ok: false,
    });
  });

  it("NINGÚN campo de contenido llega a la tabla", async () => {
    await recordAiEvent("u1", { kind: "tool", name: "datos_de_mercado", ms: 90, ok: false, resumenLen: 500 });
    await recordAiEvent("u1", { kind: "lane", lane: "template", tokensIn: 10, tokensOut: 20, replyLen: 80 });
    await recordAiEvent("u1", { kind: "guard", causa: "tendencia" });
    await recordAiEvent("u1", { kind: "action", tipo: "debt_extra_payment", confirmada: true });
    await recordAiEvent("u1", { kind: "provider_error", razon: "timeout" });

    for (const [row] of insert.mock.calls) {
      const claves = Object.keys(row as Record<string, unknown>);
      for (const prohibido of PROHIBIDOS) expect(claves).not.toContain(prohibido);
      // Los únicos strings permitidos son el user_id, el tipo de evento y el nombre.
      const strings = claves.filter((k) => typeof (row as Record<string, unknown>)[k] === "string");
      expect(strings.sort()).toEqual(["event", "name", "user_id"]);
    }
  });

  it("los números se sanean (enteros, nunca negativos ni NaN)", async () => {
    await recordAiEvent("u1", { kind: "tool", name: "x", ms: 12.7, ok: true, resumenLen: Number.NaN });
    expect(insert).toHaveBeenCalledWith(expect.objectContaining({ ms: 13, resumen_len: null }));

    await recordAiEvent("u1", { kind: "lane", lane: "l", tokensIn: -5, tokensOut: 3.2, replyLen: 0 });
    expect(insert).toHaveBeenCalledWith(expect.objectContaining({ tokens_in: 0, tokens_out: 3, reply_len: 0 }));
  });
});

describe("recordAiEvent · nunca rompe la respuesta del chat", () => {
  it("Supabase caído (el cliente lanza) → NO lanza, solo avisa", async () => {
    clienteExplota = true;
    await expect(recordAiEvent("u1", { kind: "lane", lane: "deep", tokensIn: 1, tokensOut: 1, replyLen: 1 })).resolves.toBeUndefined();
    expect(warn).toHaveBeenCalled();
  });

  it("el insert devuelve error → NO lanza, solo avisa", async () => {
    insert.mockResolvedValue({ error: { message: "relation does not exist" } });
    await expect(recordAiEvent("u1", { kind: "tool", name: "x", ms: 1, ok: true })).resolves.toBeUndefined();
    expect(warn).toHaveBeenCalled();
  });

  it("sin Supabase configurado no intenta escribir", async () => {
    configurado = false;
    await recordAiEvent("u1", { kind: "tool", name: "x", ms: 1, ok: true });
    expect(insert).not.toHaveBeenCalled();
  });

  it("sin userId (cron/ingesta sin sesión) no persiste: solo queda el log", async () => {
    await recordAiEvent("", { kind: "tool", name: "x", ms: 1, ok: true });
    expect(insert).not.toHaveBeenCalled();
  });
});
