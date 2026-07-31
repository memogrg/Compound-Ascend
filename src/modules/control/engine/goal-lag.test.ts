import { describe, it, expect } from "vitest";
import { rankSavingsGoalsByLag } from "@/modules/control/engine/goal-lag";

const g = (id: string, name: string, target: number, current: number) => ({
  id,
  name,
  targetAmount: target,
  currentAmount: current,
});

describe("rankSavingsGoalsByLag", () => {
  it("ordena de más a menos rezagada (menor progreso primero) y calcula falta", () => {
    const r = rankSavingsGoalsByLag([
      g("a", "Viaje", 1000, 800), // 80%
      g("b", "Carro", 1000, 100), // 10%
      g("c", "Fondo", 1000, 500), // 50%
    ]);
    expect(r.map((x) => x.id)).toEqual(["b", "c", "a"]);
    expect(r[0]).toEqual({ id: "b", name: "Carro", progress: 0.1, remaining: 900 });
  });

  it("excluye sobres sin meta (targetAmount = 0)", () => {
    const r = rankSavingsGoalsByLag([g("sobre", "Comida", 0, 0), g("meta", "Casa", 2000, 500)]);
    expect(r.map((x) => x.id)).toEqual(["meta"]);
  });

  it("respeta el límite y acota el progreso a [0,1] y la falta a ≥ 0", () => {
    const r = rankSavingsGoalsByLag(
      [g("a", "A", 100, 30), g("b", "B", 100, 10), g("c", "C", 100, 120)],
      2,
    );
    expect(r).toHaveLength(2); // top-2 más rezagadas
    const c = rankSavingsGoalsByLag([g("c", "C", 100, 120)])[0];
    expect(c).toEqual({ id: "c", name: "C", progress: 1, remaining: 0 }); // sobre-cumplida
  });
});
