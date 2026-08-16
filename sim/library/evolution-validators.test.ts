/**
 * Unit test for validateEvolution's OUTPUT wiring — deps mocked, no DB, so it runs
 * ungated in `npm run sim` (not part of `npm test`, which is tests/**+src/**). It
 * proves the evolution checks actually reach the log (the regression this guards:
 * evolution silently producing zero checks), and that a read failure surfaces as a
 * VISIBLE failing check instead of a silent gap.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { AuthContext } from "@/lib/auth/auth-context";
import type { Period } from "@/modules/financial-base/types";

vi.mock("@/modules/rich-life/services/rich-life-service", () => ({
  getRichLifeSummary: vi.fn(),
}));
vi.mock("@/modules/control/services/control-service", () => ({
  getControlSummary: vi.fn(),
}));
vi.mock("@/modules/dashboard/services/home-cards-service", () => ({
  getHomeCardsData: vi.fn(),
}));

import { getRichLifeSummary } from "@/modules/rich-life/services/rich-life-service";
import { getControlSummary } from "@/modules/control/services/control-service";
import { getHomeCardsData } from "@/modules/dashboard/services/home-cards-service";
import { EventLog } from "../event-log";
import { validateEvolution } from "./evolution-validators";

// A ctx whose db returns a fixed 2-row net_worth_snapshots series.
const snapshotRows = [{ period: "2026-01-01" }, { period: "2026-02-01" }];
const ctx = {
  db: {
    from: () => ({
      select: () => ({ eq: () => ({ order: async () => ({ data: snapshotRows, error: null }) }) }),
    }),
  },
  userId: "u1",
} as unknown as AuthContext;

const period = { year: 2026, month: 2, from: "2026-02-01", to: "2026-02-28", label: "feb" } as Period;

const richLife = (netWorth: number, wealthVelocity: number | null) => ({
  snapshot: { indicators: { netWorth, wealthVelocity } },
});

function find(log: EventLog, needle: string) {
  return log.checks.find((c) => c.name.includes(needle));
}

beforeEach(() => {
  vi.mocked(getRichLifeSummary).mockReset();
  vi.mocked(getControlSummary).mockReset();
  vi.mocked(getHomeCardsData).mockReset();
});

describe("validateEvolution · salida al log", () => {
  it("mes 1: trayectoria y vs-mes (ahorros/deudas) aparecen EN VERDE", async () => {
    // netWorth 1000, prev 800 → wealthVelocity 200 = Δreal; goal net +50; debt paid 20.
    vi.mocked(getRichLifeSummary).mockResolvedValue(richLife(1000, 200) as never);
    vi.mocked(getControlSummary).mockResolvedValue({
      debts: [{ createdAt: "2026-08-01", originalAmount: 500, balance: 500, currency: "CRC" }],
    } as never);
    vi.mocked(getHomeCardsData).mockResolvedValue({
      ahorros: { vsMes: { format: "amount", value: 50, dir: "up", tone: "pos", label: "aportaste" } },
      deudas: { vsMes: { format: "amount", value: 20, dir: "down", tone: "pos", label: "pagaste" } },
      patrimonio: { vsMes: { format: "percent", value: 0.25, dir: "up", tone: "pos", label: "vs mes ant." } },
    } as never);

    const log = new EventLog();
    const nw = await validateEvolution(
      ctx,
      period,
      { monthIndex: 1, prevNetWorth: 800, goalNet: 50, debtPaid: 20, hasGoal: true, hasDebt: true },
      log,
    );

    console.log(
      "EVOLUCIÓN CHECKS:\n" +
        log.checks.map((c) => `  [${c.ok ? "PASS" : "FAIL"}] ${c.name} :: ${c.detail}`).join("\n"),
    );

    expect(nw).toBe(1000);
    const trayectoria = find(log, "velocidad patrimonial");
    const ahorros = find(log, "vs-mes ahorros");
    const deudas = find(log, "vs-mes deudas"); // adquirido 0 (created_at ago 2026 fuera de feb) − pagado 20 = −20 == chip
    const serie = find(log, "snapshot de patrimonio por mes");
    expect(trayectoria?.ok, trayectoria?.detail).toBe(true);
    expect(ahorros?.ok, ahorros?.detail).toBe(true);
    expect(deudas?.ok, deudas?.detail).toBe(true);
    expect(serie?.ok, serie?.detail).toBe(true);
  });

  it("mes 0: sin snapshot previo, la trayectoria no corre pero la serie sí (1 fila)", async () => {
    vi.mocked(getRichLifeSummary).mockResolvedValue(richLife(500, null) as never);
    vi.mocked(getHomeCardsData).mockResolvedValue({ ahorros: null, deudas: null, patrimonio: null } as never);
    const oneRow = { db: { from: () => ({ select: () => ({ eq: () => ({ order: async () => ({ data: [{ period: "2026-01-01" }], error: null }) }) }) }) }, userId: "u1" } as unknown as AuthContext;

    const log = new EventLog();
    await validateEvolution(
      oneRow,
      period,
      { monthIndex: 0, prevNetWorth: null, goalNet: 0, debtPaid: 0, hasGoal: true, hasDebt: false },
      log,
    );
    expect(find(log, "velocidad patrimonial")).toBeUndefined(); // no corre en mes 0
    expect(find(log, "snapshot de patrimonio por mes")?.ok).toBe(true);
  });

  it("robustez: si getHomeCardsData lanza, la trayectoria sigue verde y vs-mes es un check ROJO visible", async () => {
    vi.mocked(getRichLifeSummary).mockResolvedValue(richLife(1000, 200) as never);
    vi.mocked(getHomeCardsData).mockRejectedValue(new Error("cookies fuera de request"));

    const log = new EventLog();
    await validateEvolution(
      ctx,
      period,
      { monthIndex: 1, prevNetWorth: 800, goalNet: 50, debtPaid: 0, hasGoal: true, hasDebt: false },
      log,
    );
    expect(find(log, "velocidad patrimonial")?.ok).toBe(true); // bloque A intacto
    const vsmesFail = find(log, "vs-mes (la lectura lanzó)");
    expect(vsmesFail?.ok).toBe(false);
    expect(vsmesFail?.detail).toContain("cookies");
  });
});
