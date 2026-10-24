/**
 * Cableado de /api/base/snapshot: además del snapshot de la Base Financiera, el cron
 * mensual debe escribir el PATRIMONIO del periodo cerrado (net_worth_snapshots).
 * Sin esto la tabla se quedaba vacía y el asesor respondía la evolución del patrimonio
 * con los snapshots de portafolio.
 *
 * Y, desde el plan 15 PR 3, el cron congela ANTES las líneas derivadas del mes cerrado. El
 * orden no es cosmético: `generateSnapshotsForAllUsers` SUMA `budget_items` del periodo, así
 * que materializarlas después dejaría el snapshot sin ellas — el mismo escalón, ahora guardado
 * en la tabla que nadie vuelve a mirar. De ahí el caso de orden.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));

const getUserMock = vi.fn();
vi.mock("@/lib/auth/session", () => ({
  getUser: () => getUserMock(),
  isSupabaseConfigured: () => true,
}));

/** Periodo mensual tal como lo reciben los servicios de snapshot. */
type Periodo = { year: number; month: number };

const baseAllUsers = vi.fn(async (_p: Periodo) => {
  orden.push("snapshot-base");
  return { users: 3, written: 2 };
});
const baseUser = vi.fn(async (_p: Periodo) => undefined);
vi.mock("@/modules/financial-base/services/snapshot-service", () => ({
  generateSnapshotsForAllUsers: (p: Periodo) => baseAllUsers(p),
  generateMonthlySnapshot: (p: Periodo) => baseUser(p),
}));

/** Orden real de las llamadas del cron, para poder afirmar quién va primero. */
const orden: string[] = [];
const congelar = vi.fn(async (_p: Periodo, _o?: { simulacro?: boolean }) => {
  orden.push("congelar");
  return { users: 3, conLineas: 1, failed: 0, simulacro: false };
});
vi.mock("@/modules/financial-base/services/derived-budget-service", () => ({
  congelarDerivadasDelPeriodo: (p: Periodo, o?: { simulacro?: boolean }) => congelar(p, o),
}));

const nwAllUsers = vi.fn(async (_p: Periodo) => ({ users: 3, written: 3 }));
const nwUser = vi.fn(async (_p: Periodo) => ({ period: "2026-07-01" }));
vi.mock("@/modules/rich-life/services/net-worth-snapshot-service", () => ({
  generateNetWorthSnapshotsForAllUsers: (p: Periodo) => nwAllUsers(p),
  generateNetWorthSnapshot: (p: Periodo) => nwUser(p),
}));

/**
 * El reloj del CRON, fijo.
 *
 * El camino de cron ancla el mes cerrado en UTC con `simNow()`, así que sin fijarlo los casos de
 * abajo afirmarían «agosto» solo porque hoy es septiembre: el 1 de octubre se pondrían rojos sin
 * que nadie tocara nada. Con el reloj fijo, «el mes recién cerrado» es una afirmación sobre el
 * código y no sobre el calendario de quien corre la suite.
 */
vi.mock("@/lib/time/clock", () => ({
  now: () => new Date("2026-09-15T12:00:00Z"),
}));

vi.mock("@/lib/time/user-time", () => ({
  userCurrentPeriod: async () => ({
    year: 2026,
    month: 8,
    from: "2026-08-01",
    to: "2026-08-31",
    label: "ago 2026",
  }),
}));

import { GET, POST } from "@/app/api/base/snapshot/route";

const SECRET = "s3cr3t";

function cronReq() {
  return new Request("http://localhost/api/base/snapshot", {
    headers: { "x-cron-secret": SECRET },
  });
}

beforeEach(() => {
  process.env.CRON_SECRET = SECRET;
  vi.clearAllMocks();
  orden.length = 0;
  nwAllUsers.mockResolvedValue({ users: 3, written: 3 });
  // `mockImplementation` y no `mockResolvedValue`: el registro del orden vive en el cuerpo de
  // la mock, y un valor resuelto lo reemplazaría — el caso de orden pasaría con `orden` vacío.
  baseAllUsers.mockImplementation(async () => {
    orden.push("snapshot-base");
    return { users: 3, written: 2 };
  });
  congelar.mockImplementation(async (_p, o) => {
    orden.push("congelar");
    return {
      users: 3,
      conLineas: 1,
      failed: 0,
      simulacro: o?.simulacro === true,
      ...(o?.simulacro
        ? { detalle: [{ user: "a1b2c3d4", lineas: 2, porOrigen: { debt: 2 } }] }
        : {}),
    };
  });
});

describe("GET /api/base/snapshot (cron)", () => {
  it("escribe el patrimonio del MISMO periodo cerrado que la base", async () => {
    const res = await GET(cronReq());
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(nwAllUsers).toHaveBeenCalledTimes(1);
    const periodoBase = baseAllUsers.mock.calls[0]![0];
    const periodoNw = nwAllUsers.mock.calls[0]![0];
    expect(periodoNw).toMatchObject({ year: periodoBase.year, month: periodoBase.month });
    expect(body.netWorth).toEqual({ users: 3, written: 3 });
  });

  it("congela las derivadas del mes cerrado ANTES de sumar el snapshot", async () => {
    const res = await GET(cronReq());
    expect(res.status).toBe(200);
    const json = (await res.json()) as {
      period: string;
      derivadas: { users: number; conLineas: number };
    };
    expect(congelar).toHaveBeenCalledTimes(1);
    // El MISMO periodo cerrado que la base, no el mes en curso.
    // El mes RECIÉN cerrado y solo ese: con el reloj en el 15-sep-2026, agosto.
    expect(congelar.mock.calls[0]?.[0]).toMatchObject({ year: 2026, month: 8 });
    // Y el mismo periodo que recibe el snapshot: si se separaran, el snapshot sumaría un mes
    // cuyas derivadas acaban de materializarse en otro.
    expect(baseAllUsers.mock.calls[0]?.[0]).toMatchObject({ year: 2026, month: 8 });
    expect(json.derivadas).toMatchObject({ users: 3, conLineas: 1 });
    // Y el orden, que es el punto: primero congelar, después sumar.
    expect(orden).toEqual(["congelar", "snapshot-base"]);
  });

  it("x-dry-run: 1 calcula y NO escribe — ni derivadas ni snapshots", async () => {
    const req = new Request("http://localhost/api/base/snapshot", {
      headers: { "x-cron-secret": SECRET, "x-dry-run": "1" },
    });
    const res = await GET(req);
    expect(res.status).toBe(200);
    const json = (await res.json()) as {
      mode: string;
      derivadas: { simulacro: boolean; detalle: { user: string; lineas: number }[] };
    };
    expect(json.mode).toBe("cron-simulacro");
    expect(congelar).toHaveBeenCalledWith(expect.anything(), { simulacro: true });
    expect(json.derivadas.simulacro).toBe(true);
    expect(json.derivadas.detalle[0]).toMatchObject({ user: "a1b2c3d4", lineas: 2 });
    // Y los snapshots NO corren: son escrituras igual de reales que las derivadas.
    expect(baseAllUsers).not.toHaveBeenCalled();
    expect(nwAllUsers).not.toHaveBeenCalled();
    expect(orden).toEqual(["congelar"]);
  });

  it("sin el header, la corrida es de verdad y sí escribe", async () => {
    await GET(cronReq());
    expect(congelar).toHaveBeenCalledWith(expect.anything(), { simulacro: false });
    expect(baseAllUsers).toHaveBeenCalledTimes(1);
  });

  it("el header SIN el secreto no entra: un simulacro también recorre a todos los usuarios", async () => {
    const res = await GET(
      new Request("http://localhost/api/base/snapshot", { headers: { "x-dry-run": "1" } }),
    );
    expect(res.status).toBe(401);
    expect(congelar).not.toHaveBeenCalled();
  });

  it("si el patrimonio falla, la corrida de la base NO se pierde", async () => {
    nwAllUsers.mockRejectedValue(new Error("agregación rota"));
    const res = await GET(cronReq());
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.written).toBe(2); // el snapshot de la base sigue reportado
    expect(body.netWorth).toEqual({ error: true });
  });
});

describe("POST /api/base/snapshot (sesión)", () => {
  it("el usuario autenticado también deja su patrimonio del mes cerrado", async () => {
    getUserMock.mockResolvedValue({ id: "u1" });
    const res = await POST(new Request("http://localhost/api/base/snapshot", { method: "POST" }));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(nwUser).toHaveBeenCalledTimes(1);
    // Mes actual = agosto → el cerrado es julio, igual que el de la base.
    expect(nwUser.mock.calls[0]![0]).toMatchObject({ year: 2026, month: 7 });
    expect(body.netWorth).toEqual({ written: 1 });
  });

  it("sin sesión no escribe nada", async () => {
    getUserMock.mockResolvedValue(null);
    const res = await POST(new Request("http://localhost/api/base/snapshot", { method: "POST" }));
    expect(res.status).toBe(401);
    expect(nwUser).not.toHaveBeenCalled();
  });
});
