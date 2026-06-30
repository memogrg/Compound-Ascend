import { describe, it, expect, vi, beforeEach } from "vitest";

const h = vi.hoisted(() => ({
  embed: vi.fn(async (_texts: string[], _task: string) => [[0.1, 0.2, 0.3]] as number[][]),
  rpc: vi.fn(async (_name: string, _args: unknown) => ({
    data: [] as { content: string; tag: string; similarity: number }[] | null,
    error: null as { message: string } | null,
  })),
}));

vi.mock("@/lib/ai/providers/gemini", () => ({
  embedTexts: (texts: string[], task: string) => h.embed(texts, task),
}));
vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: async () => ({
    rpc: (name: string, args: unknown) => h.rpc(name, args),
  }),
}));

import { retrieveBiblia } from "@/lib/ai/biblia-retrieval";
import { bibliaEmotionRule } from "@/lib/ai/biblia-knowledge";

const DEUDA_KW = "ataca primero la más cara";

beforeEach(() => {
  h.embed.mockClear();
  h.rpc.mockClear();
  h.embed.mockResolvedValue([[0.1, 0.2, 0.3]]);
  h.rpc.mockResolvedValue({ data: [], error: null });
});

describe("retrieveBiblia · semántico", () => {
  it("devuelve los contents del RPC (orden por similitud, cap 2) con la emoción adelante", async () => {
    h.rpc.mockResolvedValue({
      data: [
        { content: "C1", tag: "tema", similarity: 0.92 },
        { content: "C2", tag: "tema", similarity: 0.81 },
        { content: "C3", tag: "tema", similarity: 0.7 },
      ],
      error: null,
    });
    const out = await retrieveBiblia({ emotion: "culpa", text: "tengo muchas deudas" });
    expect(out).toEqual([bibliaEmotionRule("culpa"), "C1", "C2"]); // emoción + 2 temas (cap)
    expect(h.embed).toHaveBeenCalledWith(["tengo muchas deudas"], "RETRIEVAL_QUERY");
    const [, args] = h.rpc.mock.calls[0]! as [string, { match_count: number; min_similarity: number }];
    expect(args.match_count).toBe(3);
    expect(args.min_similarity).toBe(0.5);
  });
});

describe("retrieveBiblia · fallback keyword", () => {
  it("embedTexts lanza (sin key) → cae a keyword, sin tocar el RPC", async () => {
    h.embed.mockRejectedValue(new Error("sin API key"));
    const out = await retrieveBiblia({ text: "¿cómo ataco mi tarjeta de crédito?" });
    expect(out.some((c) => c.includes(DEUDA_KW))).toBe(true);
    expect(h.rpc).not.toHaveBeenCalled();
  });

  it("RPC sin matches → cae a keyword", async () => {
    h.rpc.mockResolvedValue({ data: [], error: null });
    const out = await retrieveBiblia({ text: "mi tarjeta de crédito" });
    expect(out.some((c) => c.includes(DEUDA_KW))).toBe(true);
  });

  it("texto vacío → solo emoción, sin llamar a la IA ni al RPC", async () => {
    const out = await retrieveBiblia({ emotion: "miedo", text: "   " });
    expect(out).toEqual([bibliaEmotionRule("miedo")]);
    expect(h.embed).not.toHaveBeenCalled();
    expect(h.rpc).not.toHaveBeenCalled();
  });

  it("NUNCA propaga: si el RPC tira, devuelve el fallback keyword", async () => {
    h.rpc.mockRejectedValue(new Error("boom"));
    const out = await retrieveBiblia({ text: "tarjeta de crédito" });
    expect(out.some((c) => c.includes(DEUDA_KW))).toBe(true);
  });
});
