/**
 * PROYECCIÓN DE INGRESO PASIVO POR DIVIDENDOS.
 *
 * La regla: cuando el holding tiene dividendos CONFIGURADOS, la línea derivada
 * del presupuesto sale de esa config (neto de retención) y no del historial. El
 * promedio de 12 meses queda como respaldo para las posiciones que pagan sin
 * haberse configurado — hasta acá era la única fuente, y obligaba a esperar un
 * año para que la proyección dijera algo.
 *
 * Se testea el CÁLCULO, que es donde está la regla; el armado de la línea
 * derivada (nombre, sourceKind, diff) ya lo cubre derived-budget.test.ts.
 */
import { describe, it, expect } from "vitest";
import { calcularRendimiento, esFrecuenciaPago } from "@/lib/finance/rendimiento-periodico";

/** Espejo de lo que hace derived-budget-service al proyectar un holding. */
function proyectarMensual(h: {
  payout_enabled: boolean;
  payout_mode?: string | null;
  payout_rate_pct?: number | null;
  payout_amount?: number | null;
  payout_frequency?: string | null;
  payout_withholding_pct?: number | null;
  quantity?: number;
  average_cost?: number;
  current_value_manual?: number | null;
  historial12m?: number;
}): number {
  if (h.payout_enabled && esFrecuenciaPago(h.payout_frequency)) {
    const invertido = Number(h.quantity ?? 0) * Number(h.average_cost ?? 0);
    const base = Number(h.current_value_manual ?? 0) || invertido;
    return calcularRendimiento(
      {
        modo: (h.payout_mode as "yield" | "manual") ?? "yield",
        yieldPct: h.payout_rate_pct,
        montoPorPago: h.payout_amount,
        frecuencia: h.payout_frequency,
        retencionPct: h.payout_withholding_pct,
      },
      base,
    ).netoMensual;
  }
  return Math.round(((h.historial12m ?? 0) / 12) * 100) / 100;
}

describe("la config manda sobre el historial", () => {
  it("configurado: proyecta el NETO de la config, ignorando el historial", () => {
    // 100 acciones a $100 = $10.000 invertidos, 4% anual trimestral, 30% retención.
    const mensual = proyectarMensual({
      payout_enabled: true,
      payout_mode: "yield",
      payout_rate_pct: 4,
      payout_frequency: "trimestral",
      payout_withholding_pct: 30,
      quantity: 100,
      average_cost: 100,
      historial12m: 999_999, // el historial NO debe influir
    });
    // 10.000 × 4% ÷ 4 = 100 brutos · −30% = 70 netos · ÷3 meses = 23,33
    expect(mensual).toBe(23.33);
  });

  it("configurado desde el DÍA UNO: sin historial la proyección ya dice algo", () => {
    // Ésta es la ganancia real: antes había que esperar 12 meses de pagos.
    const mensual = proyectarMensual({
      payout_enabled: true,
      payout_mode: "manual",
      payout_amount: 120,
      payout_frequency: "mensual",
      quantity: 10,
      average_cost: 50,
      historial12m: 0,
    });
    expect(mensual).toBe(120);
  });

  it("el valor manual manda sobre lo invertido como base del yield", () => {
    // Una posición que se revalorizó paga sobre el valor actual, no sobre el costo.
    const mensual = proyectarMensual({
      payout_enabled: true,
      payout_mode: "yield",
      payout_rate_pct: 12,
      payout_frequency: "mensual",
      quantity: 100,
      average_cost: 100, // invertido = 10.000
      current_value_manual: 20_000, // pero hoy vale 20.000
    });
    expect(mensual).toBe(200); // 20.000 × 12% ÷ 12
  });

  it("la retención baja la proyección: se proyecta lo que ENTRA, no lo que paga el emisor", () => {
    const sin = proyectarMensual({
      payout_enabled: true,
      payout_mode: "manual",
      payout_amount: 300,
      payout_frequency: "trimestral",
      payout_withholding_pct: 0,
    });
    const con = proyectarMensual({
      payout_enabled: true,
      payout_mode: "manual",
      payout_amount: 300,
      payout_frequency: "trimestral",
      payout_withholding_pct: 30,
    });
    expect(sin).toBe(100);
    expect(con).toBe(70);
  });
});

describe("respaldo por historial", () => {
  it("sin configurar: promedio de los últimos 12 meses", () => {
    expect(proyectarMensual({ payout_enabled: false, historial12m: 2400 })).toBe(200);
  });

  it("configurado pero SIN frecuencia utilizable: cae al historial, no proyecta cero", () => {
    // Una config a medio llenar no puede borrar de la proyección un ingreso que
    // el usuario sí está recibiendo.
    const mensual = proyectarMensual({
      payout_enabled: true,
      payout_mode: "yield",
      payout_rate_pct: 5,
      payout_frequency: null,
      quantity: 100,
      average_cost: 100,
      historial12m: 1200,
    });
    expect(mensual).toBe(100);
  });

  it("una frecuencia con la grafía equivocada NO da cero en silencio: cae al historial", () => {
    // 'bimestral' no existe en el motor. Si `esFrecuenciaPago` no filtrara, el
    // factor sería 0 y la proyección diría 0 sin error.
    const mensual = proyectarMensual({
      payout_enabled: true,
      payout_mode: "manual",
      payout_amount: 600,
      payout_frequency: "bimestral",
      historial12m: 1200,
    });
    expect(mensual).toBe(100);
  });

  it("ni config ni historial → 0, y no NaN", () => {
    expect(proyectarMensual({ payout_enabled: false })).toBe(0);
  });
});
