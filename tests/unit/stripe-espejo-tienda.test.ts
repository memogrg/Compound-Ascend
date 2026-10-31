/**
 * Regla espejo del «doble canal» en Stripe (stripe-fulfillment.ts): si la cuenta tiene una
 * suscripción viva en App Store / Google Play, una suscripción de Stripe que muere o se
 * cancela NO la baja a `ninguno` — el plan lo da la tienda. Sin tienda, todo sigue como antes.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import type Stripe from "stripe";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/logger", () => ({ logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn() } }));
vi.mock("@/modules/account/services/correo-bienvenida", () => ({
  enviarBienvenidaUnaVez: vi.fn(),
}));
vi.mock("@/lib/billing/stripe", () => ({
  getStripe: () => null,
  planDeSuscripcion: () => "pro",
  suscripcionDaAcceso: (s: string) => s === "active" || s === "trialing",
  aIso: (e: number | null | undefined) => (e ? new Date(e * 1000).toISOString() : null),
}));

const sus = vi.hoisted(() => ({ aplicarPlan: vi.fn(async () => ({ ok: true, huerfanos: 0 })) }));
vi.mock("@/modules/account/services/subscription-service", () => sus);

type Perfil = Record<string, unknown> & { id: string };
let perfiles: Perfil[] = [];

vi.mock("@/lib/supabase/service-role", () => ({
  createServiceRoleClient: () => ({
    from: () => ({
      select: () => ({
        eq: (col: string, val: unknown) => ({
          maybeSingle: async () => ({
            data: perfiles.find((p) => p[col] === val) ?? null,
            error: null,
          }),
        }),
      }),
      update: (patch: Record<string, unknown>) => ({
        eq: (col: string, val: unknown) => {
          for (const p of perfiles) if (p[col] === val) Object.assign(p, patch);
          return Promise.resolve({ error: null });
        },
      }),
    }),
  }),
}));

import { manejarSuscripcion } from "@/modules/account/services/stripe-fulfillment";

const USER = "11111111-2222-4333-8444-555555555555";

function sub(status: string, extra: Partial<Stripe.Subscription> = {}): Stripe.Subscription {
  return {
    id: "sub_123",
    status,
    metadata: { userId: USER },
    customer: "cus_1",
    cancel_at_period_end: false,
    trial_end: null,
    items: { data: [{ current_period_end: 1_790_000_000 }] },
    ...extra,
  } as unknown as Stripe.Subscription;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("manejarSuscripcion · espejo de la tienda", () => {
  it("Stripe muere y la cuenta paga en la tienda → no baja a ninguno", async () => {
    perfiles = [{ id: USER, plan: "pro", store_subscription_active: true }];
    await manejarSuscripcion(sub("canceled"));
    expect(sus.aplicarPlan).not.toHaveBeenCalled();
    expect(perfiles[0]!.plan).toBe("pro");
  });

  it("Stripe cancela al fin de período y la cuenta paga en la tienda → no programa la baja", async () => {
    perfiles = [{ id: USER, plan: "pro", store_subscription_active: true, plan_pending: null }];
    await manejarSuscripcion(sub("active", { cancel_at_period_end: true }));
    expect(perfiles[0]!.plan_pending).toBeNull();
  });

  it("sin tienda, Stripe muerto → ninguno, como siempre", async () => {
    perfiles = [{ id: USER, plan: "pro", store_subscription_active: false }];
    await manejarSuscripcion(sub("canceled"));
    expect(sus.aplicarPlan).toHaveBeenCalledWith(USER, "ninguno", expect.anything());
  });
});
