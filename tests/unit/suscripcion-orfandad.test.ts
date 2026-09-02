/**
 * Las tres reglas del cambio de plan, que son plata y datos de gente:
 *
 *  1. SUBIR se aplica de una.
 *  2. BAJAR espera a que venza el mes ya pagado.
 *  3. Al bajar de Max+ (el único plan de hogar), los miembros que no pagan
 *     quedan HUÉRFANOS: salen del hogar y pasan a `ninguno`, conservando su
 *     cuenta y sus datos. El titular se queda con su plan nuevo.
 *
 * Se prueba contra un Supabase falso en memoria: lo que importa acá es la
 * decisión, no el driver.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/logger", () => ({ logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn() } }));

type Perfil = Record<string, unknown> & { id: string };
type Miembro = { id: string; household_id: string; user_id: string; role: string; status: string };

let perfiles: Perfil[] = [];
let miembros: Miembro[] = [];

/** Supabase mínimo: solo los pocos verbos que usa el servicio. */
function tabla(nombre: string) {
  const filas = (): Record<string, unknown>[] =>
    nombre === "profiles"
      ? (perfiles as Record<string, unknown>[])
      : (miembros as unknown as Record<string, unknown>[]);

  const constructor = (filtros: ((f: Record<string, unknown>) => boolean)[]) => {
    const api = {
      eq(col: string, val: unknown) {
        return constructor([...filtros, (f) => f[col] === val]);
      },
      neq(col: string, val: unknown) {
        return constructor([...filtros, (f) => f[col] !== val]);
      },
      in(col: string, vals: unknown[]) {
        return constructor([...filtros, (f) => vals.includes(f[col])]);
      },
      not(col: string, _op: string, _val: unknown) {
        return constructor([...filtros, (f) => f[col] != null]);
      },
      lte(col: string, val: string) {
        return constructor([...filtros, (f) => String(f[col] ?? "") <= val]);
      },
      async maybeSingle() {
        return { data: filas().filter((f) => filtros.every((p) => p(f)))[0] ?? null, error: null };
      },
      then(res: (v: { data: unknown[]; error: null }) => unknown) {
        return Promise.resolve(
          res({ data: filas().filter((f) => filtros.every((p) => p(f))), error: null }),
        );
      },
    };
    return api;
  };

  return {
    select: () => constructor([]),
    update: (patch: Record<string, unknown>) => ({
      eq(col: string, val: unknown) {
        for (const f of filas()) if (f[col] === val) Object.assign(f, patch);
        return Promise.resolve({ error: null });
      },
      in(col: string, vals: unknown[]) {
        for (const f of filas()) if (vals.includes(f[col])) Object.assign(f, patch);
        return Promise.resolve({ error: null });
      },
    }),
  };
}

vi.mock("@/lib/supabase/service-role", () => ({
  createServiceRoleClient: () => ({ from: (n: string) => tabla(n) }),
}));

import {
  aplicarPlan,
  programarBajada,
  aplicarCambiosVencidos,
} from "@/modules/account/services/subscription-service";

/** El titular. Función y no variable: `perfiles` se recrea en cada beforeEach. */
const titular = (): Perfil => perfiles[0]!;

const AYER = new Date(Date.now() - 86_400_000).toISOString();
const EN_UN_MES = new Date(Date.now() + 30 * 86_400_000).toISOString();

beforeEach(() => {
  perfiles = [
    {
      id: "titular",
      plan: "max",
      plan_pending: null,
      plan_effective_at: null,
      period_end: EN_UN_MES,
    },
    { id: "pareja", plan: "max", plan_pending: null, plan_effective_at: null },
    { id: "hijo", plan: "max", plan_pending: null, plan_effective_at: null },
  ];
  miembros = [
    { id: "m1", household_id: "h1", user_id: "titular", role: "owner", status: "active" },
    { id: "m2", household_id: "h1", user_id: "pareja", role: "adult", status: "active" },
    { id: "m3", household_id: "h1", user_id: "hijo", role: "member", status: "invited" },
  ];
});

describe("bajada programada", () => {
  it("pedir la bajada NO cambia nada hoy: guarda la intención y la fecha", async () => {
    const r = await programarBajada("titular", "pro");
    expect(r.ok).toBe(true);
    expect(r.cambiaEl).toBe(EN_UN_MES);

    const t = perfiles.find((p) => p.id === "titular")!;
    expect(t.plan).toBe("max"); // sigue con lo que pagó
    expect(t.plan_pending).toBe("pro");
    // Y nadie perdió el hogar todavía.
    expect(miembros.every((m) => m.status !== "removed")).toBe(true);
  });

  it("no se programa una SUBIDA por acá: eso se cobra y se aplica de una", async () => {
    titular().plan = "esencial";
    const r = await programarBajada("titular", "max");
    expect(r.ok).toBe(false);
  });

  it("sin fecha de vencimiento no se inventa una", async () => {
    titular().period_end = null;
    const r = await programarBajada("titular", "pro");
    expect(r.ok).toBe(false);
  });
});

describe("orfandad al bajar de Max+", () => {
  it("el titular conserva su plan y los demás salen del hogar y quedan sin plan", async () => {
    const r = await aplicarPlan("titular", "pro");

    expect(r.ok).toBe(true);
    expect(r.huerfanos).toBe(2); // la pareja y el hijo invitado

    expect(perfiles.find((p) => p.id === "titular")!.plan).toBe("pro");
    expect(perfiles.find((p) => p.id === "pareja")!.plan).toBe("ninguno");
    expect(perfiles.find((p) => p.id === "hijo")!.plan).toBe("ninguno");

    // El titular NO se desaloja a sí mismo.
    expect(miembros.find((m) => m.user_id === "titular")!.status).toBe("active");
    // Las invitaciones pendientes también caen: si no, entrarían a un hogar que ya no cabe.
    expect(miembros.find((m) => m.user_id === "pareja")!.status).toBe("removed");
    expect(miembros.find((m) => m.user_id === "hijo")!.status).toBe("removed");
  });

  it("subir de plan nunca desaloja a nadie", async () => {
    titular().plan = "pro";
    const r = await aplicarPlan("titular", "max");
    expect(r.huerfanos).toBe(0);
    expect(miembros.every((m) => m.status !== "removed")).toBe(true);
  });

  it("cancelar del todo (a ninguno) también desaloja", async () => {
    const r = await aplicarPlan("titular", "ninguno");
    expect(r.huerfanos).toBe(2);
    expect(perfiles.find((p) => p.id === "titular")!.plan).toBe("ninguno");
  });
});

describe("el cron aplica lo vencido", () => {
  it("solo toca lo que ya venció, y arrastra la orfandad", async () => {
    titular().plan_pending = "pro";
    titular().plan_effective_at = AYER;

    const r = await aplicarCambiosVencidos();

    expect(r.aplicados).toBe(1);
    expect(r.huerfanos).toBe(2);
    expect(perfiles.find((p) => p.id === "titular")!.plan).toBe("pro");
    expect(perfiles.find((p) => p.id === "titular")!.plan_pending).toBeNull();
  });

  it("un cambio que todavía no vence no se aplica", async () => {
    titular().plan_pending = "pro";
    titular().plan_effective_at = EN_UN_MES;

    const r = await aplicarCambiosVencidos();

    expect(r.aplicados).toBe(0);
    expect(perfiles.find((p) => p.id === "titular")!.plan).toBe("max");
  });
});
