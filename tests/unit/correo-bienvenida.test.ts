/**
 * El correo de bienvenida es un comprobante: tiene que decir el monto, la
 * fecha del primer cobro y cómo cancelar, y salir UNA sola vez por checkout
 * aunque lo intenten /bienvenida y el webhook.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/logger", () => ({ logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn() } }));
vi.mock("@/lib/env", () => ({
  getClientEnv: () => ({ NEXT_PUBLIC_APP_URL: "https://app.test" }),
}));

const sendEmail = vi.fn(async (_p: { to: string; subject: string; html: string }) => ({
  ok: true,
}));
let configurado = true;
vi.mock("@/lib/email/send", () => ({
  sendEmail: (p: { to: string; subject: string; html: string }) => sendEmail(p),
  isEmailConfigured: () => configurado,
}));

const vistos = new Set<string>();
vi.mock("@/lib/security/idempotency", () => ({
  alreadyProcessed: async (p: string, id: string) => {
    const k = `${p}:${id}`;
    if (vistos.has(k)) return true;
    vistos.add(k);
    return false;
  },
}));

vi.mock("@/lib/billing/stripe", () => ({
  planDeSuscripcion: (sub: { items?: { data?: { price?: { lookup_key?: string } }[] } }) => {
    const k = sub.items?.data?.[0]?.price?.lookup_key ?? "";
    return k.startsWith("carteraplus_") ? k.replace("carteraplus_", "") : null;
  },
}));

import {
  htmlBienvenida,
  enviarBienvenidaUnaVez,
} from "@/modules/account/services/correo-bienvenida";

function sub(plan: string, extra: Record<string, unknown> = {}) {
  return {
    id: "sub_1",
    status: "trialing",
    trial_end: Math.floor(new Date("2026-09-17T12:00:00Z").getTime() / 1000),
    items: {
      data: [{ price: { lookup_key: `carteraplus_${plan}`, unit_amount: 3400, currency: "usd" } }],
    },
    ...extra,
  } as never;
}

beforeEach(() => {
  sendEmail.mockClear();
  vistos.clear();
  configurado = true;
});

describe("htmlBienvenida", () => {
  it("en prueba: dice $0 hoy, la fecha, el monto y el enlace para cancelar", () => {
    const { subject, html } = htmlBienvenida({
      plan: "pro",
      enPrueba: true,
      primerCobro: "17 de septiembre de 2026",
      monto: "$34.00",
      urlSuscripcion: "https://app.test/suscripcion",
      urlApp: "https://app.test/dashboard",
    });
    expect(subject).toMatch(/hoy no pagás nada/);
    expect(html).toContain("no pagaste nada");
    expect(html).toContain("17 de septiembre de 2026");
    expect(html).toContain("$34.00 al mes");
    expect(html).toContain('href="https://app.test/suscripcion"');
    expect(html).toContain("CARTERA<span");
  });

  it("sin prueba: el cobro fue hoy", () => {
    const { subject, html } = htmlBienvenida({
      plan: "max",
      enPrueba: false,
      primerCobro: null,
      monto: "$47.00",
      urlSuscripcion: "https://app.test/suscripcion",
      urlApp: "https://app.test/dashboard",
    });
    expect(subject).toMatch(/está activa/);
    expect(html).toContain("se hizo hoy");
  });
});

describe("enviarBienvenidaUnaVez", () => {
  it("manda una vez por checkout, aunque lo llamen dos caminos", async () => {
    const a = await enviarBienvenidaUnaVez({
      sessionId: "cs_1",
      email: "vos@x.com",
      sub: sub("pro"),
    });
    const b = await enviarBienvenidaUnaVez({
      sessionId: "cs_1",
      email: "vos@x.com",
      sub: sub("pro"),
    });
    expect(a).toEqual({ enviado: true });
    expect(b).toEqual({ enviado: false, motivo: "ya enviado" });
    expect(sendEmail).toHaveBeenCalledTimes(1);
    const params = sendEmail.mock.calls[0]![0];
    expect(params.to).toBe("vos@x.com");
    expect(params.html).toContain("$34.00 al mes");
    expect(params.html).toContain("17 de septiembre de 2026");
  });

  it("sin correo configurado no manda ni marca", async () => {
    configurado = false;
    const r = await enviarBienvenidaUnaVez({
      sessionId: "cs_2",
      email: "vos@x.com",
      sub: sub("pro"),
    });
    expect(r.enviado).toBe(false);
    expect(sendEmail).not.toHaveBeenCalled();
    expect(vistos.size).toBe(0);
  });

  it("sin plan de pago reconocible no manda", async () => {
    const r = await enviarBienvenidaUnaVez({
      sessionId: "cs_3",
      email: "vos@x.com",
      sub: sub("raro"),
    });
    expect(r).toEqual({ enviado: false, motivo: "sin plan de pago" });
  });
});
