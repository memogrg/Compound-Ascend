/**
 * Regresión del fix: el modo cron de POST /api/investments/snapshot fallaba
 * siempre porque llamaba servicios atados a requireUser() (sin sesión en cron).
 * Contrato verificado:
 *  1. Cron con userId válido → 200 y usa la variante service-role (sin sesión).
 *  2. Cron con userId inválido/ausente → 400 (validación UUID).
 *  3. Sin secret de cron y sin sesión → 401 (el modo usuario no se relaja).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("server-only", () => ({}));

const getUserMock = vi.fn(async () => null);
vi.mock("@/lib/auth/session", () => ({
  getUser: () => getUserMock(),
  isSupabaseConfigured: () => true,
}));

const cronSnapshotMock = vi.fn(async (_userId: string) => ({
  id: "snap-1",
  date: "2026-06-12",
  portfolioValue: 1000,
  investmentValue: 800,
  netWorth: 5000,
  currency: "CRC",
}));
vi.mock("@/modules/wealth/services/snapshot-service", () => ({
  generateSnapshotForUserCron: (id: string) => cronSnapshotMock(id),
  generateAndSaveSnapshot: vi.fn(),
}));
// El modo usuario importa estos módulos dinámicamente; con 401 nunca se llega,
// pero el mock evita cargar cadenas con supabase real si algún test los toca.
vi.mock("@/modules/wealth/services/portfolio-service", () => ({
  getPortfolioReport: vi.fn(),
}));
vi.mock("@/modules/rich-life/services/rich-life-service", () => ({
  getRichLifeSummary: vi.fn(),
}));

import { POST } from "@/app/api/investments/snapshot/route";

const SECRET = "test-cron-secret";
const VALID_UUID = "e7040f66-42de-4a15-a9a2-14d2b3e16b6c";

function cronRequest(body: unknown, headers: Record<string, string> = {}) {
  return new Request("http://localhost/api/investments/snapshot", {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  process.env.CRON_SECRET = SECRET;
  cronSnapshotMock.mockClear();
  getUserMock.mockClear();
});
afterEach(() => {
  delete process.env.CRON_SECRET;
});

describe("POST /api/investments/snapshot (modo cron)", () => {
  it("con X-Cron-Secret y userId válido genera el snapshot sin sesión", async () => {
    const res = await POST(cronRequest({ userId: VALID_UUID }, { "x-cron-secret": SECRET }));
    expect(res.status).toBe(200);
    const json = (await res.json()) as { ok: boolean; mode: string };
    expect(json.ok).toBe(true);
    expect(json.mode).toBe("cron");
    expect(cronSnapshotMock).toHaveBeenCalledWith(VALID_UUID);
    expect(getUserMock).not.toHaveBeenCalled(); // jamás depende de la sesión
  });

  it("acepta el secret como Authorization: Bearer (Vercel Cron)", async () => {
    const res = await POST(
      cronRequest({ userId: VALID_UUID }, { authorization: `Bearer ${SECRET}` }),
    );
    expect(res.status).toBe(200);
    expect(cronSnapshotMock).toHaveBeenCalledWith(VALID_UUID);
  });

  it("rechaza userId ausente con 422", async () => {
    const res = await POST(cronRequest({}, { "x-cron-secret": SECRET }));
    expect(res.status).toBe(422);
    expect(cronSnapshotMock).not.toHaveBeenCalled();
  });

  it("rechaza userId que no es UUID con 422 (antes pasaba crudo a la BD)", async () => {
    const res = await POST(cronRequest({ userId: "'; drop --" }, { "x-cron-secret": SECRET }));
    expect(res.status).toBe(422);
    expect(cronSnapshotMock).not.toHaveBeenCalled();
  });

  it("sin secret y sin sesión responde 401 (el modo usuario no se relaja)", async () => {
    const res = await POST(cronRequest({ userId: VALID_UUID }));
    expect(res.status).toBe(401);
    expect(cronSnapshotMock).not.toHaveBeenCalled();
  });

  it("con secret INCORRECTO no entra al modo cron", async () => {
    const res = await POST(cronRequest({ userId: VALID_UUID }, { "x-cron-secret": "wrong" }));
    expect(res.status).toBe(401);
    expect(cronSnapshotMock).not.toHaveBeenCalled();
  });
});
