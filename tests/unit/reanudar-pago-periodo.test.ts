/** «Reanudar pago» de /empezar lleva el plan Y el período a /empezar/pagar. */
import { describe, it, expect, vi } from "vitest";

const redirect = vi.hoisted(() =>
  vi.fn((url: string) => {
    throw new Error(`REDIRECT:${url}`);
  }),
);

vi.mock("server-only", () => ({}));
vi.mock("next/navigation", () => ({ redirect }));
vi.mock("next/headers", () => ({ headers: async () => new Headers() }));
vi.mock("@/lib/supabase/server", () => ({ createSupabaseServerClient: async () => ({}) }));
vi.mock("@/lib/supabase/service-role", () => ({ createServiceRoleClient: () => ({}) }));
vi.mock("@/lib/logger", () => ({ logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn() } }));
vi.mock("@/lib/legal/aceptacion", () => ({ registrarAceptacionConServicio: vi.fn() }));

import { reanudarPagoAction } from "@/lib/auth/actions";

async function destino(campos: Record<string, string>): Promise<string | undefined> {
  const fd = new FormData();
  for (const [k, v] of Object.entries(campos)) fd.set(k, v);
  await reanudarPagoAction(fd).catch(() => {});
  return redirect.mock.calls.at(-1)?.[0];
}

describe("reanudarPagoAction", () => {
  it("anual viaja como anual", async () => {
    expect(await destino({ plan: "max", periodo: "anual" })).toBe(
      "/empezar/pagar?plan=max&periodo=anual",
    );
  });

  it("sin período, o con uno inventado: mensual", async () => {
    expect(await destino({ plan: "pro" })).toBe("/empezar/pagar?plan=pro&periodo=mensual");
    expect(await destino({ plan: "pro", periodo: "x" })).toBe(
      "/empezar/pagar?plan=pro&periodo=mensual",
    );
  });

  it("un plan inventado sigue cayendo a Pro+", async () => {
    expect(await destino({ plan: "gratis", periodo: "anual" })).toBe(
      "/empezar/pagar?plan=pro&periodo=anual",
    );
  });
});
