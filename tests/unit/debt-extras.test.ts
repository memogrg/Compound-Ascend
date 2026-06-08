import { describe, it, expect } from "vitest";
import { computeDueStatus } from "@/modules/control/engine/due-dates";
import { buildSchedule } from "@/modules/control/engine/amortization";

const utc = (y: number, m: number, d: number) => new Date(Date.UTC(y, m - 1, d));

describe("computeDueStatus", () => {
  it("calcula el próximo vencimiento por día de pago", () => {
    const s = computeDueStatus({ payDay: 15, paymentDates: [] }, utc(2026, 6, 10));
    expect(s.nextDue).toBe("2026-06-15");
    expect(s.daysUntil).toBe(5);
    expect(s.dueSoon).toBe(false);
    expect(s.paidThisMonth).toBe(false);
  });

  it("marca dueSoon cuando faltan ≤2 días y no se pagó este mes", () => {
    const s = computeDueStatus({ payDay: 15, paymentDates: [] }, utc(2026, 6, 14));
    expect(s.daysUntil).toBe(1);
    expect(s.dueSoon).toBe(true);
  });

  it("si ya se pagó este mes, mueve el vencimiento al próximo mes y no avisa", () => {
    const s = computeDueStatus({ payDay: 15, paymentDates: ["2026-06-02"] }, utc(2026, 6, 14));
    expect(s.paidThisMonth).toBe(true);
    expect(s.nextDue).toBe("2026-07-15");
    expect(s.dueSoon).toBe(false);
  });

  it("infiere el día de pago desde startDate si no hay payDay", () => {
    const s = computeDueStatus({ startDate: "2020-03-05", paymentDates: [] }, utc(2026, 6, 4));
    expect(s.nextDue).toBe("2026-06-05");
    expect(s.dueSoon).toBe(true);
  });

  it("sin día de pago ni startDate devuelve null", () => {
    const s = computeDueStatus({ paymentDates: [] }, utc(2026, 6, 4));
    expect(s.nextDue).toBeNull();
    expect(s.dueSoon).toBe(false);
  });
});

describe("buildSchedule · tasa introductoria", () => {
  it("usa introApr durante introFixedMonths y luego la TAE principal", () => {
    const rows = buildSchedule({
      balance: 1000,
      apr: 24, // post-intro: 2%/mes
      introApr: 0, // intro: 0%/mes
      introFixedMonths: 2,
      monthlyPayment: 100,
    });
    expect(rows[0]!.interest).toBe(0); // mes 1 (intro)
    expect(rows[1]!.interest).toBe(0); // mes 2 (intro)
    expect(rows[2]!.interest).toBeCloseTo(16, 1); // mes 3: 800 * 0.02
  });
});
