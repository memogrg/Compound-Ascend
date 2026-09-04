/**
 * El flujo de adquisición (/empezar → Stripe → /bienvenida), en sus tres
 * reglas que son plata:
 *
 *  1. El formulario solo acepta un plan de pago real.
 *  2. El checkout desde /empezar vuelve a /bienvenida con el `session_id`, con
 *     tarjeta obligatoria, en español y con el aviso de la fecha del cobro.
 *  3. Cumplir un checkout exige que sea de ESTE usuario y que esté pagado: un
 *     `session_id` ajeno pegado en la URL no activa nada.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/logger", () => ({ logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn() } }));

const sessionsCreate = vi.fn();
const sessionsRetrieve = vi.fn();
const subsRetrieve = vi.fn();
vi.mock("@/lib/billing/stripe", () => ({
  getStripe: () => ({
    checkout: { sessions: { create: sessionsCreate, retrieve: sessionsRetrieve } },
    subscriptions: { retrieve: subsRetrieve },
    customers: { create: vi.fn(async () => ({ id: "cus_nuevo" })) },
  }),
  precioDe: async (plan: string) => `price_${plan}`,
  planDeSuscripcion: (sub: { items?: { data?: { price?: { lookup_key?: string } }[] } }) => {
    const k = sub.items?.data?.[0]?.price?.lookup_key ?? "";
    return k.startsWith("carteraplus_") ? k.replace("carteraplus_", "") : null;
  },
  suscripcionDaAcceso: (s: string) => s === "active" || s === "trialing",
  aIso: (n: number | null | undefined) => (n ? new Date(n * 1000).toISOString() : null),
}));

const enviarBienvenida = vi.fn(async (_i: unknown) => ({ enviado: true }));
vi.mock("@/modules/account/services/correo-bienvenida", () => ({
  enviarBienvenidaUnaVez: (i: unknown) => enviarBienvenida(i),
}));

const aplicarPlan = vi.fn();
vi.mock("@/modules/account/services/subscription-service", () => ({
  aplicarPlan: (...a: unknown[]) => aplicarPlan(...a),
}));

/** Supabase mínimo: un perfil con customer ya creado. */
vi.mock("@/lib/supabase/service-role", () => ({
  createServiceRoleClient: () => ({
    from: () => {
      const q = {
        select: () => q,
        update: () => q,
        eq: () => q,
        maybeSingle: async () => ({
          data: { id: "u1", stripe_customer_id: "cus_1", plan: "ninguno" },
        }),
        then: (r: (v: unknown) => unknown) => Promise.resolve(r({ data: null, error: null })),
      };
      return q;
    },
  }),
}));

import { empezarSchema } from "@/lib/auth/schemas";
import { crearCheckout, fechaPrimerCobro } from "@/modules/account/services/checkout-service";
import { cumplirCheckout } from "@/modules/account/services/stripe-fulfillment";

beforeEach(() => {
  sessionsCreate.mockReset();
  sessionsRetrieve.mockReset();
  subsRetrieve.mockReset();
  aplicarPlan.mockReset();
  enviarBienvenida.mockClear();
});

describe("empezarSchema", () => {
  it("acepta correo, contraseña y un plan de pago", () => {
    const r = empezarSchema.safeParse({
      email: "vos@correo.com",
      password: "Sandbox123!",
      plan: "pro",
    });
    expect(r.success).toBe(true);
  });
  it("rechaza «ninguno» y planes inventados", () => {
    for (const plan of ["ninguno", "gratis", "", undefined]) {
      const r = empezarSchema.safeParse({ email: "vos@correo.com", password: "Sandbox123!", plan });
      expect(r.success).toBe(false);
    }
  });
});

describe("fechaPrimerCobro", () => {
  it("es hoy + 14 días, en español", () => {
    const f = fechaPrimerCobro(new Date("2026-09-03T12:00:00Z"));
    expect(f).toMatch(/17 de septiembre/);
  });
});

describe("crearCheckout desde /empezar", () => {
  it("vuelve a /bienvenida con el session_id y pide tarjeta aunque haya prueba", async () => {
    sessionsCreate.mockResolvedValue({ url: "https://checkout.stripe.com/x" });
    const r = await crearCheckout({
      userId: "u1",
      email: "vos@correo.com",
      plan: "pro",
      yaUsoPrueba: false,
      baseUrl: "https://app.test",
      origen: "empezar",
    });
    expect(r).toEqual({ ok: true, url: "https://checkout.stripe.com/x" });

    const params = sessionsCreate.mock.calls[0]![0];
    expect(params.success_url).toBe("https://app.test/bienvenida?session_id={CHECKOUT_SESSION_ID}");
    expect(params.cancel_url).toBe("https://app.test/empezar?plan=pro&reanudar=1");
    expect(params.payment_method_collection).toBe("always");
    expect(params.subscription_data.trial_period_days).toBe(14);
    expect(params.locale).toBe("es-419");
    expect(params.custom_text.submit.message).toMatch(/Hoy no pagás nada/);
    expect(params.after_expiration.recovery.enabled).toBe(true);
    expect(params.metadata).toEqual({ userId: "u1", plan: "pro" });
  });

  it("sin prueba (ya la usó) no regala días y lo dice", async () => {
    sessionsCreate.mockResolvedValue({ url: "https://checkout.stripe.com/y" });
    await crearCheckout({
      userId: "u1",
      email: null,
      plan: "max",
      yaUsoPrueba: true,
      baseUrl: "https://app.test",
      origen: "empezar",
    });
    const params = sessionsCreate.mock.calls[0]![0];
    expect(params.subscription_data.trial_period_days).toBeUndefined();
    expect(params.custom_text.submit.message).toMatch(/empieza hoy/);
  });

  it("desde /suscripcion sigue volviendo a /suscripcion", async () => {
    sessionsCreate.mockResolvedValue({ url: "https://checkout.stripe.com/z" });
    await crearCheckout({
      userId: "u1",
      email: null,
      plan: "esencial",
      yaUsoPrueba: false,
      baseUrl: "https://app.test",
    });
    const params = sessionsCreate.mock.calls[0]![0];
    expect(params.success_url).toBe("https://app.test/suscripcion?listo=1");
  });
});

function subDe(plan: string, status = "trialing") {
  return {
    id: "sub_1",
    status,
    customer: "cus_1",
    metadata: { userId: "u1" },
    trial_end: 1_800_000_000,
    cancel_at_period_end: false,
    items: {
      data: [{ price: { lookup_key: `carteraplus_${plan}` }, current_period_end: 1_800_000_000 }],
    },
  };
}

describe("cumplirCheckout", () => {
  it("aplica el plan cuando la sesión es del usuario y está pagada", async () => {
    sessionsRetrieve.mockResolvedValue({
      id: "cs_1",
      customer_details: { email: "vos@correo.com" },
      metadata: { userId: "u1" },
      payment_status: "paid",
      subscription: subDe("pro"),
    });
    const r = await cumplirCheckout("cs_1", "u1");
    expect(r).toEqual({ ok: true, plan: "pro" });
    expect(aplicarPlan).toHaveBeenCalledWith("u1", "pro", expect.anything());
    expect(enviarBienvenida).toHaveBeenCalledWith(
      expect.objectContaining({ sessionId: "cs_1", email: "vos@correo.com" }),
    );
  });

  it("rechaza un session_id de otro usuario sin tocar nada", async () => {
    sessionsRetrieve.mockResolvedValue({
      metadata: { userId: "otro" },
      payment_status: "paid",
      subscription: subDe("pro"),
    });
    const r = await cumplirCheckout("cs_ajeno", "u1");
    expect(r.ok).toBe(false);
    expect(aplicarPlan).not.toHaveBeenCalled();
  });

  it("rechaza una sesión sin pagar", async () => {
    sessionsRetrieve.mockResolvedValue({
      metadata: { userId: "u1" },
      payment_status: "unpaid",
      subscription: subDe("pro"),
    });
    const r = await cumplirCheckout("cs_1", "u1");
    expect(r.ok).toBe(false);
    expect(aplicarPlan).not.toHaveBeenCalled();
  });

  it("un session_id inválido no tira: devuelve motivo", async () => {
    sessionsRetrieve.mockRejectedValue(new Error("No such checkout.session"));
    const r = await cumplirCheckout("cs_falso", "u1");
    expect(r).toEqual({ ok: false, motivo: "No such checkout.session" });
  });

  it("si la suscripción viene como id, la busca", async () => {
    sessionsRetrieve.mockResolvedValue({
      metadata: { userId: "u1" },
      payment_status: "paid",
      subscription: "sub_1",
    });
    subsRetrieve.mockResolvedValue(subDe("max"));
    const r = await cumplirCheckout("cs_1", "u1");
    expect(r).toEqual({ ok: true, plan: "max" });
    expect(subsRetrieve).toHaveBeenCalledWith("sub_1");
  });
});
