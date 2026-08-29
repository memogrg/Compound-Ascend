/**
 * Contrato de la ruta del tablero (/api/ai/metrics):
 *  1. Sin secret NO lee ni escribe nada. `agent_metrics` no tiene políticas RLS: si esta ruta se
 *     abre, las métricas del producto quedan abiertas — el secret es la única puerta que hay.
 *  2. `?rollup=1` ESCRIBE, todo lo demás LEE. La separación va en la query y no en el verbo porque
 *     los cron de Vercel disparan GET: con el rollup en POST, el cron no correría nunca.
 *  3. La lectura devuelve la ventana pedida Y la anterior, con el delta: un número suelto no dice
 *     nada, lo accionable es la comparación contra el período comparable.
 *  4. Un día que falla en el rollup no tumba la corrida (200 con el detalle en el body): devolver
 *     500 haría que el cron reintentara TODO por un día que quizá no tiene arreglo.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("server-only", () => ({}));

const rollupDiarioMock = vi.fn(async () => [
  { dia: "2026-08-28", ok: true },
  { dia: "2026-08-29", ok: true },
]);
const rollupAndSaveMock = vi.fn(async (_dia: string) => vacio());
const loadDaysMock = vi.fn(async (_desde: string, _hasta: string) => [] as DiaCargado[]);
const loadAuditRunsMock = vi.fn(async (_n?: number) => [] as unknown[]);

type DiaCargado = { dia: string; metrics: ReturnType<typeof vacio> };

function vacio() {
  return {
    turnos: 0,
    turnosDet: 0,
    turnosLlm: 0,
    guardsTotal: 0,
    guards: {} as Record<string, number>,
    latP50: null as number | null,
    latP95: null as number | null,
    latPorCarril: {} as Record<string, { p50: number; p95: number; n: number }>,
    tokensIn: 0,
    tokensOut: 0,
    costoUsd: 0,
    accionesPropuestas: 0,
    accionesConfirmadas: 0,
    providerErrors: {} as Record<string, number>,
    usuarios: 0,
  };
}

function dia(over: Partial<ReturnType<typeof vacio>> = {}) {
  return { ...vacio(), ...over };
}

vi.mock("@/lib/ai/metrics-store", async () => {
  // El corte por día CR es lógica real y ya tiene su propio test: se usa la de verdad.
  const real = await vi.importActual<typeof import("@/lib/ai/metrics-store")>(
    "@/lib/ai/metrics-store",
  );
  return {
    diaCR: real.diaCR,
    inicioDiaCR: real.inicioDiaCR,
    diaSiguiente: real.diaSiguiente,
    rollupDiario: () => rollupDiarioMock(),
    rollupAndSave: (d: string) => rollupAndSaveMock(d),
    loadDays: (a: string, b: string) => loadDaysMock(a, b),
    loadAuditRuns: (n?: number) => loadAuditRunsMock(n),
  };
});

vi.mock("@/lib/supabase/service-role", () => ({ createServiceRoleClient: () => ({}) }));
vi.mock("@/lib/logger", () => ({ logger: { warn: vi.fn(), info: vi.fn(), error: vi.fn() } }));

import { GET, POST } from "@/app/api/ai/metrics/route";

const SECRET = "test-cron-secret";

const req = (qs = "", headers: Record<string, string> = {}) =>
  new Request(`http://localhost/api/ai/metrics${qs}`, { headers });

const auth = { "x-cron-secret": SECRET };

beforeEach(() => {
  process.env.CRON_SECRET = SECRET;
  vi.clearAllMocks();
  rollupDiarioMock.mockResolvedValue([
    { dia: "2026-08-28", ok: true },
    { dia: "2026-08-29", ok: true },
  ]);
  rollupAndSaveMock.mockResolvedValue(vacio());
  loadDaysMock.mockResolvedValue([]);
  loadAuditRunsMock.mockResolvedValue([]);
});
afterEach(() => {
  delete process.env.CRON_SECRET;
});

describe("autorización", () => {
  it("sin secret no lee", async () => {
    const res = await GET(req("?dias=7"));
    expect(res.status).toBe(401);
    expect(loadDaysMock).not.toHaveBeenCalled();
  });

  it("sin secret no escribe", async () => {
    const res = await POST(req());
    expect(res.status).toBe(401);
    expect(rollupDiarioMock).not.toHaveBeenCalled();
  });

  it("con un secret equivocado tampoco", async () => {
    const res = await GET(req("?rollup=1", { "x-cron-secret": "otro" }));
    expect(res.status).toBe(401);
    expect(rollupDiarioMock).not.toHaveBeenCalled();
  });

  it("acepta Bearer además de X-Cron-Secret", async () => {
    const res = await GET(req("?rollup=1", { authorization: `Bearer ${SECRET}` }));
    expect(res.status).toBe(200);
    expect(rollupDiarioMock).toHaveBeenCalled();
  });
});

describe("rollup (?rollup=1) — el cron", () => {
  it("un GET con ?rollup=1 escribe: es como lo dispara Vercel", async () => {
    const res = await GET(req("?rollup=1", auth));
    expect(res.status).toBe(200);
    expect(rollupDiarioMock).toHaveBeenCalledTimes(1);
    expect(loadDaysMock).not.toHaveBeenCalled();
    await expect(res.json()).resolves.toMatchObject({ ok: true });
  });

  it("POST siempre es rollup, sin necesidad de la query", async () => {
    const res = await POST(req("", auth));
    expect(res.status).toBe(200);
    expect(rollupDiarioMock).toHaveBeenCalledTimes(1);
  });

  it("con ?dia recalcula ESE día (relleno a mano)", async () => {
    const res = await POST(req("?rollup=1&dia=2026-08-01", auth));
    expect(res.status).toBe(200);
    expect(rollupAndSaveMock).toHaveBeenCalledWith("2026-08-01");
    expect(rollupDiarioMock).not.toHaveBeenCalled();
  });

  it("un día con formato inválido se rechaza antes de tocar la BD", async () => {
    const res = await POST(req("?rollup=1&dia=agosto", auth));
    expect(res.status).toBe(422);
    expect(rollupAndSaveMock).not.toHaveBeenCalled();
  });

  it("si un día falla, sigue siendo 200 con el detalle en el body", async () => {
    // 500 haría que el cron reintentara TODO por un día que quizá no tiene arreglo.
    rollupDiarioMock.mockResolvedValue([
      { dia: "2026-08-28", ok: false },
      { dia: "2026-08-29", ok: true },
    ]);
    const res = await GET(req("?rollup=1", auth));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: boolean; dias: { dia: string; ok: boolean }[] };
    expect(body.ok).toBe(false);
    expect(body.dias).toEqual([
      { dia: "2026-08-28", ok: false },
      { dia: "2026-08-29", ok: true },
    ]);
  });
});

describe("lectura del tablero", () => {
  it("devuelve ventana, actual, previo, delta, serie y corridas", async () => {
    const res = await GET(req("?dias=7", auth));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveProperty("ventana.dias", 7);
    expect(body).toHaveProperty("actual.metrics");
    expect(body).toHaveProperty("actual.tasas");
    expect(body).toHaveProperty("previo.metrics");
    expect(body).toHaveProperty("delta");
    expect(body).toHaveProperty("serie");
    expect(body).toHaveProperty("auditRuns");
  });

  it("lee DOS ventanas: la pedida y la inmediatamente anterior", async () => {
    await GET(req("?dias=7", auth));
    expect(loadDaysMock).toHaveBeenCalledTimes(2);
    const [[desdeA, hastaA], [desdeP, hastaP]] = loadDaysMock.mock.calls as [
      [string, string],
      [string, string],
    ];
    // La ventana previa termina justo antes de que empiece la actual, sin solaparse ni dejar hueco.
    expect(hastaP < desdeA).toBe(true);
    expect(desdeP < hastaP).toBe(true);
    expect(desdeA < hastaA).toBe(true);
  });

  it("una ventana no permitida cae al default de 7 (no se consulta un rango arbitrario)", async () => {
    for (const qs of ["?dias=999", "?dias=abc", "?dias=-1", ""]) {
      vi.clearAllMocks();
      loadDaysMock.mockResolvedValue([]);
      loadAuditRunsMock.mockResolvedValue([]);
      const res = await GET(req(qs, auth));
      await expect(res.json()).resolves.toHaveProperty("ventana.dias", 7);
    }
  });

  it("acepta la ventana de 30 días", async () => {
    const res = await GET(req("?dias=30", auth));
    await expect(res.json()).resolves.toHaveProperty("ventana.dias", 30);
  });

  it("la serie trae las tasas ya resueltas por día", async () => {
    loadDaysMock.mockImplementation(async (desde: string) =>
      desde === undefined
        ? []
        : [{ dia: "2026-08-29", metrics: dia({ turnos: 4, turnosDet: 1, guardsTotal: 1 }) }],
    );
    const res = await GET(req("?dias=7", auth));
    const body = (await res.json()) as {
      serie: { dia: string; tasas: { coberturaDet: number | null; tasaGuard: number | null } }[];
    };
    expect(body.serie[0]!.tasas.coberturaDet).toBe(25);
    expect(body.serie[0]!.tasas.tasaGuard).toBe(25);
  });

  it("que falten las corridas del banco no tumba las métricas", async () => {
    loadAuditRunsMock.mockRejectedValue(new Error("tabla ausente"));
    const res = await GET(req("?dias=7", auth));
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toHaveProperty("auditRuns", []);
  });

  it("una ventana sin datos responde en cero, con las tasas en null", async () => {
    const res = await GET(req("?dias=7", auth));
    const body = (await res.json()) as {
      actual: { metrics: { turnos: number }; tasas: { coberturaDet: number | null } };
    };
    expect(body.actual.metrics.turnos).toBe(0);
    expect(body.actual.tasas.coberturaDet).toBeNull();
  });
});
