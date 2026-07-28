import { describe, it, expect } from "vitest";
import { levelTone, isUnbudgeted } from "@/app/(mobile)/m/(app)/gastos/budget-status";

/**
 * Un sobre/frasco con presupuesto 0 pero con gasto debe marcarse (ámbar) en vez de esconderse.
 * El bug de device: Promerica (aporte único, presupuesto 0) salía "en cero" y en tono neutral.
 * Nunca esconder plata real por no tener presupuesto.
 */
describe("levelTone — presupuesto cero con gasto se marca en ámbar", () => {
  it("budget 0 + spent > 0 → warning (el caso Promerica), no neutral", () => {
    expect(levelTone(1000, 0)).toBe("warning");
  });

  it("budget 0 + spent 0 → neutral (no hay nada que señalar)", () => {
    expect(levelTone(0, 0)).toBe("neutral");
  });

  it("budget > 0 se mantiene EXACTAMENTE igual (verde/ámbar/rojo por ratio)", () => {
    expect(levelTone(50, 100)).toBe("success"); // < 85%
    expect(levelTone(85, 100)).toBe("warning"); // >= 85%
    expect(levelTone(120, 100)).toBe("danger"); // > 100%
  });
});

describe("isUnbudgeted", () => {
  it("true solo cuando budget 0 y spent > 0", () => {
    expect(isUnbudgeted(1000, 0)).toBe(true);
    expect(isUnbudgeted(0, 0)).toBe(false);
    expect(isUnbudgeted(50, 100)).toBe(false);
  });
});
