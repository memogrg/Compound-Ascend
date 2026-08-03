/**
 * Guarda del contrato entre los detectores y la BD.
 *
 * `user_insights.related_kind` tiene un check. Si un detector emite un valor que ese check no
 * admite, NO se pierde solo esa fila: syncInsights hace un upsert en lote, así que el statement
 * entero se aborta y el usuario se queda sin NINGÚN insight de la pasada. Eso fue exactamente lo
 * que pasó con 'holding' (emitido desde detectOpenContributions, nunca admitido por el check).
 *
 * Este test es la red para que no vuelva a pasar: cualquier relatedKind nuevo tiene que estar en
 * INSIGHT_RELATED_KINDS, que es la lista que la migración 20260810000001 replica.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { INSIGHT_RELATED_KINDS } from "@/lib/insights/types";
import {
  detectStalledGoals,
  detectGrowingDebt,
  detectPositiveStreak,
  detectDisfruteSpike,
  detectOpenContributions,
  detectOverspentEnvelopes,
  detectExpensiveDebt,
  detectPeaceFundGap,
} from "@/lib/insights/detectors";
import type { DetectedInsight } from "@/lib/insights/types";
import type { SavingsGoal, Debt } from "@/modules/control/types";

const permitidos = new Set<string>(INSIGHT_RELATED_KINDS);

/** Corre todos los detectores con datos que SÍ disparan, para juntar sus relatedKind reales. */
function todosLosInsights(): DetectedInsight[] {
  const goal = {
    id: "g1",
    name: "Viaje",
    targetAmount: 1_000_000,
    currentAmount: 900_000,
    monthlyContribution: 10_000,
    currency: "CRC",
    status: "atrasado",
    targetDate: "2027-01-01",
  } as unknown as SavingsGoal;
  const debt = {
    id: "d1",
    name: "Tarjeta",
    balance: 500_000,
    minPayment: 1,
    currentPayment: 1,
    apr: 45,
    currency: "CRC",
    isCurrent: false,
    delinquency: "31_60",
  } as unknown as Debt;

  return [
    ...detectStalledGoals([goal], new Date("2026-08-01T00:00:00Z")),
    ...detectGrowingDebt([debt]),
    ...detectPositiveStreak([goal]),
    ...detectDisfruteSpike({ current: 200, priorAvg: 100, categoryId: "cat-1" }),
    ...detectOpenContributions([{ holdingId: "h1", label: "VOO" } as never]),
    ...detectOverspentEnvelopes({
      sobres: [{ categoryId: "c1", path: "Vivir › Súper", budget: 100, spent: 200 }],
      currency: "CRC",
    }),
    ...detectExpensiveDebt([debt]),
    ...detectPeaceFundGap({
      emergencyCovered: true,
      peaceCovered: false,
      monthsActual: 1,
      peaceMonths: 3,
      recommendedMonthly: 50_000,
      currency: "CRC",
    }),
  ];
}

describe("relatedKind de los detectores vs. lo que la BD admite", () => {
  const insights = todosLosInsights();

  it("los detectores producen datos (si no, el test no estaría probando nada)", () => {
    expect(insights.length).toBeGreaterThan(5);
  });

  it("NINGÚN detector emite un relatedKind fuera de INSIGHT_RELATED_KINDS", () => {
    for (const i of insights) {
      if (i.relatedKind === undefined) continue;
      expect(permitidos.has(i.relatedKind), `${i.kind} emite relatedKind="${i.relatedKind}"`).toBe(
        true,
      );
    }
  });

  it("'holding' está entre los permitidos: es el que rompía el upsert entero", () => {
    expect(permitidos.has("holding")).toBe(true);
    const aporte = insights.find((i) => i.kind === "aporte_pendiente");
    expect(aporte?.relatedKind).toBe("holding");
  });

  it("un insight sin entidad asociada usa relatedId estable y NO inventa un relatedKind", () => {
    const fondo = insights.find((i) => i.kind === "fondo_paz");
    expect(fondo?.relatedKind).toBeUndefined();
    expect(fondo?.relatedId).toBe("fondo_paz");
  });
});

describe("la migración replica exactamente la lista del código", () => {
  const sql = readFileSync(
    join(process.cwd(), "supabase/migrations/20260810000001_user_insights_related_kind_holding.sql"),
    "utf8",
  );

  it("el check nuevo admite todos los valores de INSIGHT_RELATED_KINDS", () => {
    const check = sql.slice(sql.indexOf("add constraint"));
    for (const kind of INSIGHT_RELATED_KINDS) {
      expect(check, `falta '${kind}' en el check`).toContain(`'${kind}'`);
    }
  });

  it("deja pasar el null (un insight puede no estar asociado a nada)", () => {
    expect(sql).toContain("related_kind is null");
  });

  it("dropea el check viejo por su definición, no por un nombre fijo", () => {
    // Dropear por nombre autogenerado dejaría vivo el viejo si alguna vez se renombró, y ambos
    // checks tendrían que cumplirse: el bug seguiría igual.
    expect(sql).toContain("pg_get_constraintdef");
    expect(sql).toContain("drop constraint");
  });
});
