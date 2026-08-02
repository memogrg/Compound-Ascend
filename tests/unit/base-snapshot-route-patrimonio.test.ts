/**
 * Cableado de /api/base/snapshot: además del snapshot de la Base Financiera, el cron
 * mensual debe escribir el PATRIMONIO del periodo cerrado (net_worth_snapshots).
 * Sin esto la tabla se quedaba vacía y el asesor respondía la evolución del patrimonio
 * con los snapshots de portafolio.
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

const baseAllUsers = vi.fn(async (_p: Periodo) => ({ users: 3, written: 2 }));
const baseUser = vi.fn(async (_p: Periodo) => undefined);
vi.mock("@/modules/financial-base/services/snapshot-service", () => ({
  generateSnapshotsForAllUsers: (p: Periodo) => baseAllUsers(p),
  generateMonthlySnapshot: (p: Periodo) => baseUser(p),
}));

const nwAllUsers = vi.fn(async (_p: Periodo) => ({ users: 3, written: 3 }));
const nwUser = vi.fn(async (_p: Periodo) => ({ period: "2026-07-01" }));
vi.mock("@/modules/rich-life/services/net-worth-snapshot-service", () => ({
  generateNetWorthSnapshotsForAllUsers: (p: Periodo) => nwAllUsers(p),
  generateNetWorthSnapshot: (p: Periodo) => nwUser(p),
}));

vi.mock("@/lib/time/user-time", () => ({
  userCurrentPeriod: async () => ({ year: 2026, month: 8, from: "2026-08-01", to: "2026-08-31", label: "ago 2026" }),
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
  nwAllUsers.mockResolvedValue({ users: 3, written: 3 });
  baseAllUsers.mockResolvedValue({ users: 3, written: 2 });
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
