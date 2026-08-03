import { describe, it, expect, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { startOfCostaRicaDayISO, buildTranscriptText, type StoredChatMessage } from "@/lib/ai/chat-store";

describe("startOfCostaRicaDayISO · corte del día en hora de Costa Rica (UTC−6)", () => {
  it("una hora UTC que en CR es del día ANTERIOR usa la medianoche de ESE día CR", () => {
    // 2026-07-29T03:00Z = 2026-07-28 21:00 en CR → inicio del día CR = 2026-07-28T06:00Z.
    expect(startOfCostaRicaDayISO(Date.parse("2026-07-29T03:00:00Z"))).toBe("2026-07-28T06:00:00.000Z");
  });
  it("una hora del mismo día CR → medianoche CR de ese día", () => {
    // 2026-07-29T12:00Z = 06:00 CR del 29 → inicio del día = 2026-07-29T06:00Z.
    expect(startOfCostaRicaDayISO(Date.parse("2026-07-29T12:00:00Z"))).toBe("2026-07-29T06:00:00.000Z");
  });
});

describe("buildTranscriptText · texto limpio con hora CR y roles", () => {
  const msgs: StoredChatMessage[] = [
    { id: "m1", role: "user", content: "¿cuánto tengo en JUP?", createdAt: "2026-07-29T18:30:00Z", replyToId: null },
    { id: "m2", role: "assistant", content: "Tenés **1.250 JUP**. Mirá [acá](https://x). \n\nUn escenario.", createdAt: "2026-07-29T18:31:00Z", replyToId: null },
  ];
  const out = buildTranscriptText(msgs, { name: "David", dateLabel: "29/07/2026" });

  it("incluye encabezado con la fecha y el nombre", () => {
    expect(out).toMatch(/My Agent C\+ — 29\/07\/2026 · David/);
  });
  it("cada turno con hora CR (18:30Z = 12:30 CR) y rol legible", () => {
    expect(out).toContain("[12:30] David: ¿cuánto tengo en JUP?");
    expect(out).toContain("[12:31] My Agent C+:");
  });
  it("aplana el markdown (negrita/enlace) a texto plano, sin ** ni []()", () => {
    expect(out).toContain("1.250 JUP");
    expect(out).not.toMatch(/\*\*/);
    expect(out).toContain("acá"); // texto del enlace, sin la URL cruda
    expect(out).not.toContain("https://x");
  });
});
