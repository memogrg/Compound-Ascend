import { describe, it, expect } from "vitest";
import { buildWeeklyDigest } from "@/modules/wealth/engine/weekly-digest";
import type { PatrimonioReport, PatrimonioLevel } from "@/modules/wealth/engine/patrimonio-engine";

const rep = (over: Partial<PatrimonioReport> = {}): PatrimonioReport => ({
  totalAssets: 0,
  netWorth: 0,
  adjustedNetWorth: 0,
  liquidWealth: 0,
  investableWealth: 0,
  productiveWealth: 0,
  protectedWealth: 0,
  numeroDeSeguridad: 0,
  numeroDeIndependencia: 0,
  numeroDeLibertad: null,
  progresoSeguridad: 0,
  progresoIndependencia: 0,
  progresoLibertad: 0,
  hitoAlcanzado: "ninguno",
  siguienteHito: "seguridad",
  sensibilidadTasa: { "0.04": 0, "0.06": 0, "0.08": 0, "0.10": 0 },
  ratioLibertad: 0,
  mesesDeColchon: 0,
  coberturaPasiva: 0,
  tasaInversion: 0,
  ratioDeudaActivos: 0,
  ratioDeudaMala: 0,
  añosDeLibertad: 0,
  calidadPatrimonio: 0,
  patrimonioEsperado: null,
  ratioAcumulacion: null,
  indice: 0,
  protectionScore: 0,
  topConcentration: 0,
  monthlyExpenses: 0,
  currency: "CRC",
  ...over,
});

const level: PatrimonioLevel = {
  min: 31,
  max: 45,
  name: "Estabilidad inicial",
  reading: "Ganas estabilidad.",
};

const SHAMING = ["pobre", "fracaso", "vergüenza", "no eres", "irresponsable", "tonto"];

describe("buildWeeklyDigest", () => {
  it("incluye Número de Libertad, años e índice; subject con el índice", () => {
    const d = buildWeeklyDigest({
      report: rep({ numeroDeIndependencia: 772_000_000, añosDeLibertad: 5, indice: 39, investableWealth: 150_000_000, ratioLibertad: 0.6 }),
      level,
      diagnosis: [],
      currency: "CRC",
    });
    expect(d.subject).toContain("39/100");
    expect(d.text).toContain("5 años");
    expect(d.text).toContain("Estabilidad inicial");
    expect(d.html).toContain("Número de Libertad");
    expect(d.html).toContain("39/100");
  });

  it("el html NO trae footer de baja (lo añade la capa de envío)", () => {
    const d = buildWeeklyDigest({ report: rep(), level, diagnosis: [], currency: "CRC" });
    expect(d.html.toLowerCase()).not.toContain("unsubscribe");
    expect(d.html.toLowerCase()).not.toContain("baja");
  });

  it("nunca usa lenguaje humillante (con o sin fragilidad)", () => {
    const cases = [
      buildWeeklyDigest({ report: rep({ investableWealth: 0 }), level, diagnosis: [{ code: "deuda_mala_alta", hint: "x" }], currency: "CRC" }),
      buildWeeklyDigest({ report: rep({ investableWealth: 100, numeroDeIndependencia: 1000, añosDeLibertad: 3, ratioLibertad: 0.6 }), level, diagnosis: [], currency: "USD" }),
    ];
    for (const d of cases) {
      const blob = `${d.subject} ${d.text} ${d.html}`.toLowerCase();
      for (const w of SHAMING) expect(blob.includes(w)).toBe(false);
    }
  });
});
