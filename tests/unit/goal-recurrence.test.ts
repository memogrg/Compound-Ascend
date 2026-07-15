import { describe, it, expect } from "vitest";
import {
  addCadence,
  computeReset,
  deriveRecurrenceFields,
} from "@/modules/control/engine/recurrence";

describe("addCadence", () => {
  it("suma la cadencia correcta (mensual/trimestral/semestral/anual)", () => {
    expect(addCadence("2026-01-15", "mensual")).toBe("2026-02-15");
    expect(addCadence("2026-01-15", "trimestral")).toBe("2026-04-15");
    expect(addCadence("2026-01-15", "semestral")).toBe("2026-07-15");
    expect(addCadence("2026-01-15", "anual")).toBe("2027-01-15");
  });

  it("cruza el fin de año", () => {
    expect(addCadence("2026-11-10", "trimestral")).toBe("2027-02-10");
    expect(addCadence("2026-12-01", "mensual")).toBe("2027-01-01");
  });

  it("'ninguna' deja la fecha igual", () => {
    expect(addCadence("2026-05-20", "ninguna")).toBe("2026-05-20");
  });
});

describe("computeReset", () => {
  it("restaura target a period_amount y ARRASTRA current (no lo toca)", () => {
    const r = computeReset({
      periodAmount: 1_000_000,
      currentAmount: 180_000, // sobrante del período anterior
      nextResetOn: "2026-07-01",
      recurrence: "anual",
      todayISO: "2026-07-15",
    });
    expect(r.restoredTarget).toBe(1_000_000);
    expect(r.carriedOver).toBe(180_000);
    expect(r.cyclesRolled).toBe(1);
    expect(r.nextResetOn).toBe("2027-07-01"); // avanzó 1 año, ya > hoy
  });

  it("avanza varios ciclos si el cron no corrió (queda > hoy)", () => {
    // Reinicio mensual vencido hace 3 meses → salta hasta el próximo futuro.
    const r = computeReset({
      periodAmount: 50_000,
      currentAmount: 0,
      nextResetOn: "2026-04-10",
      recurrence: "mensual",
      todayISO: "2026-07-15",
    });
    // 04-10 → 05-10 → 06-10 → 07-10 → 08-10 (primero > 07-15)
    expect(r.nextResetOn).toBe("2026-08-10");
    expect(r.cyclesRolled).toBe(4);
    expect(r.nextResetOn > "2026-07-15").toBe(true);
  });

  it("no avanza si la fecha de reinicio aún no llegó", () => {
    const r = computeReset({
      periodAmount: 50_000,
      currentAmount: 20_000,
      nextResetOn: "2026-09-01",
      recurrence: "mensual",
      todayISO: "2026-07-15",
    });
    expect(r.cyclesRolled).toBe(0);
    expect(r.nextResetOn).toBe("2026-09-01");
  });
});

describe("deriveRecurrenceFields", () => {
  it("'ninguna' → period_amount y next_reset_on en null", () => {
    expect(
      deriveRecurrenceFields({ recurrence: "ninguna", targetAmount: 500, todayISO: "2026-07-15" }),
    ).toEqual({ periodAmount: null, nextResetOn: null });
  });

  it("recurrente con targetDate → next_reset_on = targetDate; period_amount = target si no se pasa", () => {
    expect(
      deriveRecurrenceFields({
        recurrence: "anual",
        targetAmount: 1_000_000,
        targetDate: "2027-03-01",
        todayISO: "2026-07-15",
      }),
    ).toEqual({ periodAmount: 1_000_000, nextResetOn: "2027-03-01" });
  });

  it("recurrente sin targetDate → next_reset_on = hoy + 1 cadencia; period_amount explícito manda", () => {
    expect(
      deriveRecurrenceFields({
        recurrence: "mensual",
        targetAmount: 999,
        periodAmount: 60_000,
        todayISO: "2026-07-15",
      }),
    ).toEqual({ periodAmount: 60_000, nextResetOn: "2026-08-15" });
  });
});
