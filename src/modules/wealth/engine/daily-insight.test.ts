import { describe, it, expect } from "vitest";
import { buildDailyPatrimonioInsight, RITUAL_KIND } from "@/modules/wealth/engine/daily-insight";
import type {
  PatrimonioReport,
  PatrimonioLevel,
  DiagnosisFlag,
} from "@/modules/wealth/engine/patrimonio-engine";

const rep = (over: Partial<PatrimonioReport> = {}): PatrimonioReport => ({
  totalAssets: 0,
  netWorth: 0,
  adjustedNetWorth: 0,
  liquidWealth: 0,
  investableWealth: 0,
  productiveWealth: 0,
  protectedWealth: 0,
  defenseFundsBalance: 0,
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

const flag = (code: string): DiagnosisFlag => ({ code, hint: `hint ${code}` });

const SHAMING = ["pobre", "fracaso", "vergüenza", "no eres", "mal manejo", "irresponsable", "tonto"];
const noShame = (s: string) => {
  const low = s.toLowerCase();
  for (const w of SHAMING) expect(low.includes(w)).toBe(false);
};

describe("buildDailyPatrimonioInsight", () => {
  it("con fragilidad: microacción de 30s (severity accionar) y kind ritual", () => {
    const ins = buildDailyPatrimonioInsight(rep({ indice: 39 }), level, [flag("deuda_mala_alta")]);
    expect(ins.kind).toBe(RITUAL_KIND);
    expect(ins.severity).toBe("accionar");
    expect(ins.body.toLowerCase()).toContain("30s");
    expect(ins.title.length).toBeGreaterThan(0);
  });

  it("elige la bandera de MAYOR prioridad (deuda_mala_alta sobre alta_concentracion)", () => {
    const ins = buildDailyPatrimonioInsight(rep(), level, [
      flag("alta_concentracion"),
      flag("deuda_mala_alta"),
    ]);
    expect(ins.title).toContain("Libera flujo"); // copy de deuda_mala_alta
  });

  it("sin fragilidad y con patrimonio invertible: mensaje aspiracional con años y Número", () => {
    const ins = buildDailyPatrimonioInsight(
      rep({ investableWealth: 150_000_000, numeroDeIndependencia: 772_000_000, añosDeLibertad: 5, ratioLibertad: 0.6, indice: 60 }),
      level,
      [],
    );
    expect(ins.kind).toBe(RITUAL_KIND);
    expect(ins.severity).toBe("celebrar"); // ratioLibertad >= 0.5
    expect(ins.body).toContain("5 años");
    expect(ins.body.toLowerCase()).toContain("30s");
  });

  it("sin fragilidad y ratioLibertad bajo → info (no celebrar)", () => {
    const ins = buildDailyPatrimonioInsight(
      rep({ investableWealth: 10_000_000, numeroDeIndependencia: 772_000_000, añosDeLibertad: 1, ratioLibertad: 0.1 }),
      level,
      [],
    );
    expect(ins.severity).toBe("info");
  });

  it("sin patrimonio invertible: mensaje de construcción (info)", () => {
    const ins = buildDailyPatrimonioInsight(rep({ investableWealth: 0, numeroDeIndependencia: 0 }), level, []);
    expect(ins.severity).toBe("info");
    expect(ins.body.toLowerCase()).toContain("invertible");
  });

  it("nunca usa lenguaje humillante (todas las ramas)", () => {
    const cases = [
      buildDailyPatrimonioInsight(rep(), level, [flag("patrimonio_neto_negativo")]),
      buildDailyPatrimonioInsight(rep(), level, [flag("alto_pero_poco_productivo")]),
      buildDailyPatrimonioInsight(rep({ investableWealth: 5, numeroDeIndependencia: 100, añosDeLibertad: 0 }), level, []),
      buildDailyPatrimonioInsight(rep(), level, []),
    ];
    for (const c of cases) {
      noShame(c.title);
      noShame(c.body);
    }
  });
});
