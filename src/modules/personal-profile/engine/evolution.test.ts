import { describe, it, expect } from "vitest";
import { buildEvolution } from "@/modules/personal-profile/engine/evolution";
import type { ProfileSnapshotMetrics } from "@/modules/personal-profile/services/profile-snapshots";

/** snapshots en orden DESC (más reciente primero), como los devuelve el servicio. */
const snaps = (
  cur: ProfileSnapshotMetrics,
  prev: ProfileSnapshotMetrics,
): { capturedOn: string; metrics: ProfileSnapshotMetrics }[] => [
  { capturedOn: "2026-06-22", metrics: cur },
  { capturedOn: "2026-06-01", metrics: prev },
];

describe("buildEvolution", () => {
  it("menos de 2 snapshots → null", () => {
    expect(buildEvolution([])).toBeNull();
    expect(buildEvolution([{ capturedOn: "2026-06-22", metrics: { discipline: 8 } }])).toBeNull();
  });

  it("disciplina 6→8 y fondo false→true → esos dos changes", () => {
    const ev = buildEvolution(
      snaps(
        { discipline: 8, hasEmergencyFund: true },
        { discipline: 6, hasEmergencyFund: false },
      ),
    );
    expect(ev).not.toBeNull();
    expect(ev!.since).toBe("2026-06-01");
    expect(ev!.changes).toContain("Tu disciplina subió de 6 a 8.");
    expect(ev!.changes).toContain("Creaste tu fondo de emergencia.");
  });

  it("sin cambios (o regresiones) → null", () => {
    // disciplina baja (regresión, no se cuenta) y todo lo demás igual.
    expect(buildEvolution(snaps({ discipline: 5 }, { discipline: 7 }))).toBeNull();
    expect(buildEvolution(snaps({ completion: 80 }, { completion: 80 }))).toBeNull();
  });

  it("arquetipo movido → frase con etiquetas legibles", () => {
    const ev = buildEvolution(
      snaps({ archetypePrimary: "constructor" }, { archetypePrimary: "navegante" }),
    );
    expect(ev).not.toBeNull();
    expect(ev!.changes.some((c) => c.startsWith("Tu arquetipo evolucionó de "))).toBe(true);
  });

  it("patrimonio: solo cuenta crecimiento ≥ 2%", () => {
    expect(buildEvolution(snaps({ netWorth: 101 }, { netWorth: 100 }))).toBeNull(); // +1%
    const ev = buildEvolution(snaps({ netWorth: 110 }, { netWorth: 100 }));
    expect(ev!.changes).toContain("Tu patrimonio creció un 10%.");
  });
});
