import { describe, it, expect, vi, beforeEach } from "vitest";

const h = vi.hoisted(() => ({
  existing: [] as string[],
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
      select: () => ({
        eq: () =>
          Promise.resolve({ data: h.existing.map((content) => ({ content })), error: null }),
      }),
      upsert: (rows: unknown, opts: unknown) => h.upsert(rows, opts),
    }),
  }),
}));

import { POST } from "@/app/api/ai/biblia/ingest/route";
import { chunkDocument } from "@/lib/ai/biblia-corpus";

type Row = { tag: string; content: string; embedding: number[] | null; source: string };

const ingestReq = (
  text: string,
  opts: { tag?: string; source?: string; secret?: string } = {},
) => {
  const { tag, source, secret = "s" } = opts;
  const qs = new URLSearchParams();
  if (tag) qs.set("tag", tag);
  if (source) qs.set("source", source);
  return new Request(`http://localhost/api/ai/biblia/ingest?${qs.toString()}`, {
    method: "POST",
    headers: secret ? { "x-cron-secret": secret, "content-type": "text/plain" } : {},
    body: text,
  });
};

// Documento markdown grande: 100 secciones → 100 chunks distintos (heading-aware).
const BIG_DOC = Array.from(
  { length: 100 },
  (_, i) =>
    `# Sección ${i}\n\nContenido de la sección ${i} con texto suficiente para superar el mínimo de cuarenta caracteres.`,
).join("\n\n");

beforeEach(() => {
  process.env.CRON_SECRET = "s";
  h.existing = [];
  h.upsert.mockClear();
  h.embed.mockClear();
});

describe("POST /api/ai/biblia/ingest", () => {
  it("documento grande → ingesta hasta MAX_PER_CALL y deja remaining para reanudar", async () => {
    const allChunks = chunkDocument(BIG_DOC);
    expect(allChunks.length).toBe(100);

    const res = await POST(ingestReq(BIG_DOC, { tag: "biblia", source: "documento" }));
    const json = (await res.json()) as {
      ingested: number;
      skipped: number;
      remaining: number;
      total: number;
    };
    expect(res.status).toBe(200);
    expect(json).toEqual({ ingested: 80, skipped: 0, remaining: 20, total: 100 });

    // 80 nuevos en lotes de 25 → ceil(80/25) = 4 llamadas a la IA, RETRIEVAL_DOCUMENT.
    expect(h.embed).toHaveBeenCalledTimes(4);
    expect(h.embed.mock.calls[0]![1]).toBe("RETRIEVAL_DOCUMENT");

    const [rows, opts] = h.upsert.mock.calls[0]! as [Row[], unknown];
    expect(rows.length).toBe(80);
    expect(opts).toEqual({ onConflict: "content" });
    expect(rows[0]!.tag).toBe("biblia");
    expect(rows[0]!.source).toBe("documento");
  });

  it("salta los contents ya presentes (resumibilidad) → ingested baja, skipped sube", async () => {
    const allChunks = chunkDocument(BIG_DOC);
    h.existing = allChunks.slice(0, 95); // 95 ya en el corpus
    const res = await POST(ingestReq(BIG_DOC, { source: "documento" }));
    const json = (await res.json()) as { ingested: number; skipped: number; remaining: number };
    expect(json.ingested).toBe(5);
    expect(json.skipped).toBe(95);
    expect(json.remaining).toBe(0);
    expect(h.embed).toHaveBeenCalledTimes(1); // 5 ≤ BATCH
  });

  it("tag/source desde query y body text/plain", async () => {
    const doc = "# Intro\n\nUn solo chunk con texto suficiente para superar el mínimo de cuarenta.";
    await POST(ingestReq(doc, { tag: "curso", source: "masterkit" }));
    const [rows] = h.upsert.mock.calls[0]! as [Row[], unknown];
    expect(rows[0]!.tag).toBe("curso");
    expect(rows[0]!.source).toBe("masterkit");
    expect(rows[0]!.content).toContain("Un solo chunk");
  });

  it("documento vacío → todo en cero, sin tocar la IA", async () => {
    const res = await POST(ingestReq("   "));
    const json = (await res.json()) as { ingested: number; total: number; remaining: number };
    expect(json).toEqual({ ingested: 0, skipped: 0, remaining: 0, total: 0 });
    expect(h.embed).not.toHaveBeenCalled();
  });

  it("sin secret → 401 y no embebe", async () => {
    const res = await POST(ingestReq(BIG_DOC, { secret: "" }));
    expect(res.status).toBe(401);
    expect(h.embed).not.toHaveBeenCalled();
    expect(h.upsert).not.toHaveBeenCalled();
  });
});
