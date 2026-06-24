import { describe, it, expect, vi } from "vitest";

// insights-service importa "server-only" y cadenas pesadas solo en runtime
// (imports dinámicos); runForUsersBestEffort es puro salvo el logger.
vi.mock("server-only", () => ({}));
vi.mock("@/lib/logger", () => ({ logger: { warn: vi.fn(), error: vi.fn() } }));

import { runForUsersBestEffort } from "@/lib/insights/insights-service";

describe("runForUsersBestEffort", () => {
  it("si un usuario falla, loguea y sigue; cuenta ok/failed", async () => {
    const seen: string[] = [];
    const fn = async (id: string) => {
      seen.push(id);
      if (id === "u2") throw new Error("boom");
    };
    const res = await runForUsersBestEffort(["u1", "u2", "u3"], fn);

    expect(seen).toEqual(["u1", "u2", "u3"]); // no aborta tras el fallo
    expect(res).toEqual({ total: 3, ok: 2, failed: 1 });
  });

  it("lista vacía → ceros", async () => {
    const fn = vi.fn(async () => {});
    expect(await runForUsersBestEffort([], fn)).toEqual({ total: 0, ok: 0, failed: 0 });
    expect(fn).not.toHaveBeenCalled();
  });

  it("todos OK → failed 0", async () => {
    const res = await runForUsersBestEffort(["a", "b"], async () => {});
    expect(res).toEqual({ total: 2, ok: 2, failed: 0 });
  });
});
