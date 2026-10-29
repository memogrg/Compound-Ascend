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
      // Una copia, como Supabase: un update posterior no cambia lo que ya se leyó.
      const fila = perfiles.find((f) => filtros.every((p) => p(f)));
      return { data: fila ? { ...fila } : null, error: null };
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
    store_product_pending: null,
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
      product_id: "cartera_proplus_mensual",
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
      store_product_id: "cartera_proplus_mensual",
      store_period_end: new Date(EXPIRA).toISOString(),
      revenuecat_app_user_id: USER,
    });
  });

  it("producto de Play con base plan («:mensual») → mismo plan", async () => {
    await pedir(
      evento("RENEWAL", { product_id: "cartera_maxplus_mensual:mensual", store: "PLAY_STORE" }),
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

describe("webhook revenuecat · planes anuales", () => {
  const EXPIRA_ANUAL = Date.parse("2027-10-27T00:00:00.000Z");

  it("Play anual («:anual») → mismo plan, guarda el producto con el período y el fin anual", async () => {
    await pedir(
      evento("INITIAL_PURCHASE", {
        product_id: "cartera_proplus_mensual:anual",
        store: "PLAY_STORE",
        expiration_at_ms: EXPIRA_ANUAL,
      }),
    );
    expect(sus.aplicarPlan).toHaveBeenCalledWith(USER, "pro");
    expect(perfiles[0]).toMatchObject({
      store_product_id: "cartera_proplus_mensual:anual",
      store_period_end: new Date(EXPIRA_ANUAL).toISOString(),
    });
  });

  it("Apple anual → el plan sale del producto, aunque no venga el entitlement", async () => {
    await pedir(
      evento("INITIAL_PURCHASE", { product_id: "cartera_maxplus_anual", entitlement_ids: [] }),
    );
    expect(sus.aplicarPlan).toHaveBeenCalledWith(USER, "max");
  });

  it("TRANSFER de un anual de Apple → el destino recibe el plan", async () => {
    const DESDE = "99999999-2222-4333-8444-555555555555";
    perfiles = [
      perfilBase({
        id: DESDE,
        plan: "pro",
        store_subscription_active: true,
        store_platform: "ios",
        store_product_id: "cartera_proplus_anual",
        store_period_end: new Date(EXPIRA_ANUAL).toISOString(),
      }),
      perfilBase(),
    ];
    await pedir({
      api_version: "1.0",
      event: {
        id: "evt-transfer-anual",
        type: "TRANSFER",
        transferred_from: [DESDE],
        transferred_to: [USER],
        store: "APP_STORE",
        environment: "PRODUCTION",
      },
    });
    expect(sus.aplicarPlan).toHaveBeenCalledWith(USER, "pro");
    expect(perfiles[1]!.store_product_id).toBe("cartera_proplus_anual");
  });
});

describe("webhook revenuecat · cambio de producto", () => {
  // Quien paga Pro+ mensual en Google Play, con el período en curso hasta el 12 de noviembre.
  const FIN_ACTUAL = "2026-11-12T00:00:00.000Z";
  function pagaProMensual(extra: Partial<Perfil> = {}) {
    perfiles = [
      perfilBase({
        plan: "pro",
        store_subscription_active: true,
        store_platform: "android",
        store_product_id: "cartera_proplus_mensual:mensual",
        store_period_end: FIN_ACTUAL,
        ...extra,
      }),
    ];
  }
  const cambio = (nuevo: string) =>
    evento("PRODUCT_CHANGE", {
      store: "PLAY_STORE",
      product_id: "cartera_proplus_mensual:mensual",
      new_product_id: nuevo,
      expiration_at_ms: Date.parse(FIN_ACTUAL),
    });

  it("bajada diferida: conserva el producto vigente, guarda el pendiente y programa la bajada", async () => {
    pagaProMensual();
    const r = await pedir(cambio("cartera_esencial_mensual:mensual"));
    expect(r.status).toBe(200);
    expect(perfiles[0]).toMatchObject({
      store_product_id: "cartera_proplus_mensual:mensual",
      store_product_pending: "cartera_esencial_mensual:mensual",
      store_period_end: FIN_ACTUAL,
    });
    expect(sus.programarBajada).toHaveBeenCalledWith(USER, "esencial", FIN_ACTUAL);
    expect(sus.aplicarPlan).not.toHaveBeenCalled();
  });

  it("cambio de período en el mismo plan: igual de diferido, y no toca el plan", async () => {
    pagaProMensual();
    await pedir(cambio("cartera_proplus_mensual:anual"));
    expect(perfiles[0]).toMatchObject({
      store_product_id: "cartera_proplus_mensual:mensual",
      store_product_pending: "cartera_proplus_mensual:anual",
    });
    expect(sus.aplicarPlan).not.toHaveBeenCalled();
    expect(sus.programarBajada).not.toHaveBeenCalled();
  });

  it("subida: el producto nuevo es el vigente, limpia un pendiente viejo y aplica el plan", async () => {
    pagaProMensual({ store_product_pending: "cartera_proplus_mensual:anual" });
    await pedir(cambio("cartera_maxplus_mensual:mensual"));
    expect(perfiles[0]).toMatchObject({
      store_product_id: "cartera_maxplus_mensual:mensual",
      store_product_pending: null,
    });
    expect(sus.aplicarPlan).toHaveBeenCalledWith(USER, "max");
  });

  it("la renovación con el producto nuevo lo promueve y limpia el pendiente", async () => {
    pagaProMensual({ store_product_pending: "cartera_proplus_mensual:anual" });
    const FIN_ANUAL = Date.parse("2027-11-12T00:00:00.000Z");
    await pedir(
      evento("RENEWAL", {
        store: "PLAY_STORE",
        product_id: "cartera_proplus_mensual:anual",
        expiration_at_ms: FIN_ANUAL,
      }),
    );
    expect(perfiles[0]).toMatchObject({
      store_product_id: "cartera_proplus_mensual:anual",
      store_product_pending: null,
      store_period_end: new Date(FIN_ANUAL).toISOString(),
    });
    expect(sus.aplicarPlan).toHaveBeenCalledWith(USER, "pro");
  });

  it("en Play el cambio entra con un INITIAL_PURCHASE: también promueve y limpia", async () => {
    pagaProMensual({ plan: "pro", store_product_pending: "cartera_esencial_mensual:mensual" });
    await pedir(
      evento("INITIAL_PURCHASE", {
        store: "PLAY_STORE",
        product_id: "cartera_esencial_mensual:mensual",
        entitlement_ids: ["esencial"],
      }),
    );
    expect(perfiles[0]).toMatchObject({
      store_product_id: "cartera_esencial_mensual:mensual",
      store_product_pending: null,
    });
    expect(sus.aplicarPlan).toHaveBeenCalledWith(USER, "esencial");
  });

  it("CANCELLATION limpia el pendiente: sin renovación no entra ningún cambio", async () => {
    pagaProMensual({ store_product_pending: "cartera_proplus_mensual:anual" });
    await pedir(evento("CANCELLATION", { store: "PLAY_STORE" }));
    expect(perfiles[0]!.store_product_pending).toBeNull();
    expect(perfiles[0]!.store_product_id).toBe("cartera_proplus_mensual:mensual");
  });

  it("EXPIRATION limpia el pendiente", async () => {
    pagaProMensual({ store_product_pending: "cartera_proplus_mensual:anual" });
    await pedir(evento("EXPIRATION", { store: "PLAY_STORE" }));
    expect(perfiles[0]!.store_product_pending).toBeNull();
  });

  // En Google Play el PRODUCT_CHANGE diferido trae como expiration_at_ms el instante del cambio
  // (evento de sandbox 3e241fdb-9450-412a-a175-7d51f8177a0b), no el fin del período.
  const cambioConExpiracion = (nuevo: string, expiracionMs: number) =>
    evento("PRODUCT_CHANGE", {
      store: "PLAY_STORE",
      product_id: "cartera_proplus_mensual:mensual",
      new_product_id: nuevo,
      expiration_at_ms: expiracionMs,
    });

  it("bajada diferida con expiration_at_ms = ahora: conserva el fin guardado y programa ahí", async () => {
    pagaProMensual();
    await pedir(cambioConExpiracion("cartera_esencial_mensual:mensual", Date.now()));
    expect(perfiles[0]).toMatchObject({
      store_product_id: "cartera_proplus_mensual:mensual",
      store_product_pending: "cartera_esencial_mensual:mensual",
      store_period_end: FIN_ACTUAL,
    });
    expect(sus.programarBajada).toHaveBeenCalledWith(USER, "esencial", FIN_ACTUAL);
  });

  it("cambio de período con expiration_at_ms = ahora: tampoco toca el fin guardado", async () => {
    pagaProMensual();
    await pedir(cambioConExpiracion("cartera_proplus_mensual:anual", Date.now()));
    expect(perfiles[0]).toMatchObject({
      store_product_pending: "cartera_proplus_mensual:anual",
      store_period_end: FIN_ACTUAL,
    });
  });

  it("bajada sin fin guardado y expiration en el pasado: no programa y deja warn", async () => {
    pagaProMensual({ store_period_end: null });
    const r = await pedir(
      cambioConExpiracion("cartera_esencial_mensual:mensual", Date.now() - 60_000),
    );
    expect(r.status).toBe(200);
    expect(sus.programarBajada).not.toHaveBeenCalled();
    expect(sus.aplicarPlan).not.toHaveBeenCalled();
    expect(perfiles[0]).toMatchObject({
      store_product_pending: "cartera_esencial_mensual:mensual",
      store_period_end: null,
    });
    expect(log.warn).toHaveBeenCalledWith(
      "webhook revenuecat: bajada sin fecha de fin, no se programa",
      expect.anything(),
    );
  });

  it("bajada sin fin guardado: usa el expiration_at_ms si cae más de una hora adelante", async () => {
    pagaProMensual({ store_period_end: null });
    const enDosDias = Date.now() + 2 * 24 * 60 * 60 * 1000;
    await pedir(cambioConExpiracion("cartera_esencial_mensual:mensual", enDosDias));
    expect(sus.programarBajada).toHaveBeenCalledWith(
      USER,
      "esencial",
      new Date(enDosDias).toISOString(),
    );
  });

  it("subida en Play: el PRODUCT_CHANGE no toca el fin; lo escribe la INITIAL_PURCHASE que sigue", async () => {
    pagaProMensual();
    await pedir(cambioConExpiracion("cartera_maxplus_mensual:mensual", Date.now()));
    expect(perfiles[0]).toMatchObject({
      store_product_id: "cartera_maxplus_mensual:mensual",
      store_period_end: FIN_ACTUAL,
    });
    expect(sus.aplicarPlan).toHaveBeenCalledWith(USER, "max");

    const FIN_NUEVO = Date.parse("2026-12-01T00:00:00.000Z");
    await pedir(
      evento("INITIAL_PURCHASE", {
        store: "PLAY_STORE",
        product_id: "cartera_maxplus_mensual:mensual",
        entitlement_ids: ["max"],
        expiration_at_ms: FIN_NUEVO,
      }),
    );
    expect(perfiles[0]!.store_period_end).toBe(new Date(FIN_NUEVO).toISOString());
  });

  it("sin producto actual reconocible: el comportamiento de antes, con aviso en el log", async () => {
    pagaProMensual({ store_product_id: null });
    await pedir(cambio("cartera_esencial_mensual:mensual"));
    expect(perfiles[0]).toMatchObject({
      store_product_id: "cartera_esencial_mensual:mensual",
      store_product_pending: null,
    });
    expect(sus.programarBajada).toHaveBeenCalledWith(USER, "esencial", FIN_ACTUAL);
    expect(log.warn).toHaveBeenCalledWith(
      "webhook revenuecat: cambio de producto sin producto actual reconocible",
      expect.anything(),
    );
  });

  it("sin producto actual reconocible y expiration_at_ms = ahora: el fin guardado no se toca", async () => {
    pagaProMensual({ store_product_id: null });
    await pedir(cambioConExpiracion("cartera_esencial_mensual:mensual", Date.now()));
    expect(perfiles[0]).toMatchObject({
      store_product_id: "cartera_esencial_mensual:mensual",
      store_period_end: FIN_ACTUAL,
    });
    expect(sus.programarBajada).toHaveBeenCalledWith(USER, "esencial", FIN_ACTUAL);
  });
});
