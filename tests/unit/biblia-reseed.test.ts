import { describe, it, expect, vi, beforeEach } from "vitest";

const h = vi.hoisted(() => ({
  upsert: vi.fn((_rows: unknown, _opts: unknown) => Promise.resolve({ error: null })),
  embed: vi.fn(async (texts: string[], _task: string) => texts.map(() => [0.1, 0.2])),
}));

vi.mock("@/lib/auth/session", () => ({ isSupabaseConfigured: () => true }));
vi.mock("@/lib/ai/providers/gemini", () => ({
  embedTexts: (texts: string[], task: string) => h.embed(texts, task),
}));
vi.mock("@/lib/supabase/service-role", () => ({
  createServiceRoleClient: () => ({
    from: () => ({
      upsert: (rows: unknown, opts: unknown) => h.upsert(rows, opts),
      select: () => Promise.resolve({ count: 33, error: null }),
    }),
  }),
}));

import { POST } from "@/app/api/ai/biblia/reseed/route";
import { BIBLIA_SEED_ENTRIES } from "@/lib/ai/biblia-corpus";

type Row = { tag: string; content: string; embedding: number[] | null; source: string };

const reseedReq = (body: unknown, secret = "s") =>
  new Request("http://localhost/api/ai/biblia/reseed", {
    method: "POST",
    headers: secret ? { "x-cron-secret": secret, "content-type": "application/json" } : {},
    body: JSON.stringify(body),
  });

beforeEach(() => {
  process.env.CRON_SECRET = "s";
  h.upsert.mockClear();
  h.embed.mockClear();
});

describe("POST /api/ai/biblia/reseed", () => {
  it("cron sin body → embebe el corpus y hace upsert idempotente (onConflict content)", async () => {
    const res = await POST(reseedReq({}));
    expect(res.status).toBe(200);
    const json = (await res.json()) as { seeded: number; total: number };

    expect(h.embed).toHaveBeenCalledTimes(1);
    expect(h.embed.mock.calls[0]![1]).toBe("RETRIEVAL_DOCUMENT");

    const [rows, opts] = h.upsert.mock.calls[0]! as [Row[], unknown];
    expect(rows.length).toBe(BIBLIA_SEED_ENTRIES.length);
    expect(opts).toEqual({ onConflict: "content" });
    expect(json.seeded).toBe(BIBLIA_SEED_ENTRIES.length);
    expect(json.total).toBe(33);
  });

  it("con documentText → ingesta también los chunks del documento (tag 'documento')", async () => {
    const doc = Array.from(
      { length: 30 },
      (_, i) => `Idea ${i} del documento con texto de relleno suficiente para el chunk.`,
    ).join(" ");
    await POST(reseedReq({ documentText: doc }));
    const [rows] = h.upsert.mock.calls[0]! as [Row[], unknown];
    expect(rows.length).toBeGreaterThan(BIBLIA_SEED_ENTRIES.length);
    expect(rows.some((r) => r.tag === "documento")).toBe(true);
  });

  it("sin secret → 401 y no toca el corpus", async () => {
    const res = await POST(reseedReq({}, ""));
    expect(res.status).toBe(401);
    expect(h.embed).not.toHaveBeenCalled();
    expect(h.upsert).not.toHaveBeenCalled();
  });
});
