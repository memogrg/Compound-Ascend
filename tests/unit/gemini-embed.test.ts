import { describe, it, expect, vi, beforeEach } from "vitest";

const h = vi.hoisted(() => ({ key: "k" as string | undefined }));

vi.mock("@/lib/env", async (orig) => ({
  ...(await orig<typeof import("@/lib/env")>()),
  getServerEnv: () =>
    ({ GEMINI_API_KEY: h.key }) as unknown as ReturnType<
      typeof import("@/lib/env").getServerEnv
    >,
}));

import { embedTexts } from "@/lib/ai/providers/gemini";

beforeEach(() => {
  h.key = "k";
  vi.unstubAllGlobals();
});

describe("embedTexts", () => {
  it("batchEmbedContents → parsea los values; envía taskType + outputDimensionality 768", async () => {
    const fetchMock = vi.fn(async (_url: string, _opts: RequestInit) => ({
      ok: true,
      json: async () => ({ embeddings: [{ values: [0.1, 0.2] }, { values: [0.3, 0.4] }] }),
    }));
    vi.stubGlobal("fetch", fetchMock);

    const out = await embedTexts(["hola", "mundo"], "RETRIEVAL_DOCUMENT");
    expect(out).toEqual([
      [0.1, 0.2],
      [0.3, 0.4],
    ]);

    const [url, opts] = fetchMock.mock.calls[0]!;
    expect(String(url)).toContain("gemini-embedding-001:batchEmbedContents");
    const sent = JSON.parse(opts.body as string) as {
      requests: { taskType: string; outputDimensionality: number }[];
    };
    expect(sent.requests).toHaveLength(2);
    expect(sent.requests[0]!.taskType).toBe("RETRIEVAL_DOCUMENT");
    expect(sent.requests[0]!.outputDimensionality).toBe(768);
  });

  it("lista vacía → [] sin llamar a la red", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    expect(await embedTexts([], "RETRIEVAL_QUERY")).toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("sin GEMINI_API_KEY → lanza (el caller hará fallback en 2b-2)", async () => {
    h.key = undefined;
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    await expect(embedTexts(["x"], "RETRIEVAL_DOCUMENT")).rejects.toThrow();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
