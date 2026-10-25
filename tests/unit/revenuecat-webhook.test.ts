/**
 * Webhook de RevenueCat (/api/webhooks/revenuecat) y su cumplimiento (store-fulfillment.ts):
 *
 *  1. La puerta: sin secreto 503, autorización mala 403, sandbox ignorado con la flag
 *     apagada, reintento deduplicado.
 *  2. Las reglas: compra → aplicarPlan + columnas de tienda; cancelación → bajada
 *     programada; vencimiento → `ninguno` solo si el plan venía de la tienda.
 *  3. Lo que no se entiende no toca la cuenta: producto desconocido, cuenta desconocida.
 *  4. El espejo en Stripe: una suscripción de Stripe que muere no baja a quien paga en la
 *     tienda.
 *
 * Supabase falso en memoria: lo que importa es la decisión, no el driver.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("server-only", () => ({}));
const log = vi.hoisted(() => ({ warn: vi.fn(), error: vi.fn(), info: vi.fn() }));
vi.mock("@/lib/logger", () => ({ logger: log }));
vi.mock("@/lib/rate-limit", () => ({
  rateLimit: vi.fn(async () => ({ ok: true })),
  clientIp: () => "1.2.3.4",
  RATE_LIMITS: { webhook: { limit: 30, windowMs: 60_000 } },
}));

const vistos = vi.hoisted(() => new Set<string>());
vi.mock("@/lib/security/idempotency", () => ({
  alreadyProcessed: vi.fn(async (provider: string, id: string) => {
    const k = `${provider}:${id}`;
    if (vistos.has(k)) return true;
    vistos.add(k);
    return false;
  }),
}));

const sus = vi.hoisted(() => ({
  aplicarPlan: vi.fn(async () => ({ ok: true, huerfanos: 0 })),
  programarBajada: vi.fn(async (_u: string, _d: string, cuando?: string | null) => ({
    ok: true,
    cambiaEl: cuando ?? undefined,
  })),
}));
vi.mock("@/modules/account/services/subscription-service", () => sus);

type Perfil = Record<string, unknown> & { id: string };
let perfiles: Perfil[] = [];

function tabla() {
  const consulta = (filtros: ((f: Perfil) => boolean)[]) => ({
    eq(col: string, val: unknown) {
      return consulta([...filtros, (f) => f[col] === val]);
    },
    async maybeSingle() {
      return { data: perfiles.find((f) => filtros.every((p) => p(f))) ?? null, error: null };
    },
  });
  return {
    select: () => consulta([]),
    update: (patch: Record<string, unknown>) => ({
      eq(col: string, val: unknown) {
        for (const f of perfiles) if (f[col] === val) Object.assign(f, patch);
        return Promise.resolve({ error: null });
      },
    }),
  };
}
vi.mock("@/lib/supabase/service-role", () => ({
  createServiceRoleClient: () => ({ from: () => tabla() }),
}));

import { POST } from "@/app/api/webhooks/revenuecat/route";

const SECRETO = "secreto-de-prueba-revenuecat";
const USER = "11111111-2222-4333-8444-555555555555";
const EXPIRA = Date.parse("2026-11-25T00:00:00.000Z");

function perfilBase(extra: Partial<Perfil> = {}): Perfil {
  return {
    id: USER,
    plan: "ninguno",
    stripe_subscription_id: null,
    store_subscription_active: false,
    store_platform: null,
    store_product_id: null,
    store_period_end: null,
    revenuecat_app_user_id: null,
    ...extra,
  };
}

let n = 0;
function evento(tipo: string, extra: Record<string, unknown> = {}) {
  n += 1;
  return {
    api_version: "1.0",
    event: {
      id: `evt-${n}`,
      type: tipo,
      app_user_id: USER,
      original_app_user_id: USER,
      product_id: "cartera_pro_mensual",
      entitlement_ids: ["pro"],
      expiration_at_ms: EXPIRA,
      store: "APP_STORE",
      environment: "PRODUCTION",
      ...extra,
    },
  };
}

function pedir(cuerpo: unknown, auth: string | null = SECRETO) {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (auth !== null) headers.authorization = auth;
  return POST(
    new Request("http://localhost/api/webhooks/revenuecat", {
      method: "POST",
      headers,
      body: JSON.stringify(cuerpo),
    }),
  );
}

beforeEach(() => {
  vi.stubEnv("REVENUECAT_WEBHOOK_SECRET", SECRETO);
  vi.stubEnv("REVENUECAT_ACCEPT_SANDBOX", "");
  perfiles = [perfilBase()];
  vistos.clear();
  vi.clearAllMocks();
});
afterEach(() => vi.unstubAllEnvs());

describe("webhook revenuecat · la puerta", () => {
  it("autorización inválida → 403 y no toca nada", async () => {
    const r = await pedir(evento("INITIAL_PURCHASE"), "otro-valor");
    expect(r.status).toBe(403);
    expect(sus.aplicarPlan).not.toHaveBeenCalled();
  });

  it("sin header → 403", async () => {
    const r = await pedir(evento("INITIAL_PURCHASE"), null);
    expect(r.status).toBe(403);
  });

  it("sin secreto configurado → 503 y logger.error", async () => {
    vi.stubEnv("REVENUECAT_WEBHOOK_SECRET", "");
    const r = await pedir(evento("INITIAL_PURCHASE"));
    expect(r.status).toBe(503);
    expect(log.error).toHaveBeenCalled();
  });

  it("SANDBOX con la flag apagada → 200 ignorado", async () => {
    const r = await pedir(evento("INITIAL_PURCHASE", { environment: "SANDBOX" }));
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({ ok: true, ignored: "sandbox" });
    expect(sus.aplicarPlan).not.toHaveBeenCalled();
  });

  it("SANDBOX con REVENUECAT_ACCEPT_SANDBOX=1 → se procesa", async () => {
    vi.stubEnv("REVENUECAT_ACCEPT_SANDBOX", "1");
    await pedir(evento("INITIAL_PURCHASE", { environment: "SANDBOX" }));
    expect(sus.aplicarPlan).toHaveBeenCalledWith(USER, "pro");
  });

  it("el mismo evento dos veces → la segunda es deduped", async () => {
    const cuerpo = evento("INITIAL_PURCHASE");
    await pedir(cuerpo);
    const r = await pedir(cuerpo);
    expect(await r.json()).toEqual({ ok: true, deduped: true });
    expect(sus.aplicarPlan).toHaveBeenCalledTimes(1);
  });

  it("TEST → 200 ok", async () => {
    const r = await pedir(evento("TEST"));
    expect(await r.json()).toEqual({ ok: true, status: "ok" });
  });
});

describe("webhook revenuecat · reglas", () => {
  it("INITIAL_PURCHASE → aplicarPlan('pro') y columnas de tienda", async () => {
    const r = await pedir(evento("INITIAL_PURCHASE"));
    expect(r.status).toBe(200);
    expect(sus.aplicarPlan).toHaveBeenCalledWith(USER, "pro");
    expect(perfiles[0]).toMatchObject({
      store_subscription_active: true,
      store_platform: "ios",
      store_product_id: "cartera_pro_mensual",
      store_period_end: new Date(EXPIRA).toISOString(),
      revenuecat_app_user_id: USER,
    });
  });

  it("producto de Play con base plan («:mensual») → mismo plan", async () => {
    await pedir(
      evento("RENEWAL", { product_id: "cartera_max_mensual:mensual", store: "PLAY_STORE" }),
    );
    expect(sus.aplicarPlan).toHaveBeenCalledWith(USER, "max");
    expect(perfiles[0]!.store_platform).toBe("android");
  });

  it("CANCELLATION → programarBajada a ninguno al vencer lo pagado", async () => {
    perfiles = [perfilBase({ plan: "pro", store_subscription_active: true })];
    await pedir(evento("CANCELLATION"));
    expect(sus.programarBajada).toHaveBeenCalledWith(
      USER,
      "ninguno",
      new Date(EXPIRA).toISOString(),
    );
    expect(sus.aplicarPlan).not.toHaveBeenCalled();
  });

  it("EXPIRATION con origen tienda → ninguno", async () => {
    perfiles = [perfilBase({ plan: "pro", store_subscription_active: true })];
    await pedir(evento("EXPIRATION"));
    expect(perfiles[0]!.store_subscription_active).toBe(false);
    expect(sus.aplicarPlan).toHaveBeenCalledWith(USER, "ninguno");
  });

  it("EXPIRATION con Stripe activo → no toca el plan", async () => {
    perfiles = [perfilBase({ plan: "pro", stripe_subscription_id: "sub_123" })];
    await pedir(evento("EXPIRATION"));
    expect(sus.aplicarPlan).not.toHaveBeenCalled();
  });

  it("compra en la tienda con Stripe activo → doble canal: no cambia el plan", async () => {
    perfiles = [perfilBase({ plan: "esencial", stripe_subscription_id: "sub_123" })];
    const r = await pedir(evento("INITIAL_PURCHASE"));
    expect(await r.json()).toMatchObject({ status: "ignored", motivo: "doble canal" });
    expect(sus.aplicarPlan).not.toHaveBeenCalled();
    expect(log.warn).toHaveBeenCalledWith(
      expect.stringContaining("doble canal"),
      expect.anything(),
    );
  });

  it("app_user_id no UUID y sin perfil → 200 ignorado", async () => {
    const r = await pedir(
      evento("INITIAL_PURCHASE", {
        app_user_id: "$RCAnonymousID:abc",
        original_app_user_id: "$RCAnonymousID:abc",
      }),
    );
    expect(r.status).toBe(200);
    expect(await r.json()).toMatchObject({ status: "ignored" });
    expect(sus.aplicarPlan).not.toHaveBeenCalled();
  });

  it("app_user_id no UUID con perfil por original_app_user_id → se aplica a esa cuenta", async () => {
    perfiles = [perfilBase({ revenuecat_app_user_id: "$RCAnonymousID:abc" })];
    await pedir(
      evento("RENEWAL", {
        app_user_id: "$RCAnonymousID:xyz",
        original_app_user_id: "$RCAnonymousID:abc",
      }),
    );
    expect(sus.aplicarPlan).toHaveBeenCalledWith(USER, "pro");
  });

  it("product_id desconocido → 200 ignorado + warn", async () => {
    const r = await pedir(
      evento("INITIAL_PURCHASE", { product_id: "otra_cosa", entitlement_ids: ["vip"] }),
    );
    expect(r.status).toBe(200);
    expect(await r.json()).toMatchObject({ status: "ignored", motivo: "producto desconocido" });
    expect(sus.aplicarPlan).not.toHaveBeenCalled();
    expect(log.warn).toHaveBeenCalled();
  });
});
