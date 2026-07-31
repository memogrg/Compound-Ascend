import { describe, it, expect } from "vitest";
import {
  buildEvidencePack,
  RENDIMIENTO_SUPUESTO,
  type EvidencePack,
} from "@/lib/ai/investment-report/evidence";
import type { FinancialContext } from "@/lib/ai/system-prompt";
import type { ToolContext } from "@/lib/ai/orchestrator";

// PAQUETE DE EVIDENCIA (Etapa A del carril "deep"): puro, 0 IO, 0 tokens. PRINCIPIO probado acá:
// cada cifra sale del ctx/toolContext YA calculado; si falta un insumo, la sección queda
// `disponible: false` con el motivo — nunca se estima ni se rellena.

type Holding = NonNullable<FinancialContext["holdings"]>[number];

// Cada fila viene YA en la moneda en que cotiza (monedaFila); `valorPrimario` es el valor en la
// moneda del motor: la única base homogénea para porcentajes.
const holding = (over: Partial<Holding> = {}): Holding => ({
  symbol: "BTC",
  name: "Bitcoin",
  assetType: "cripto",
  quantity: 1,
  invested: 1_000_000,
  value: 1_500_000,
  price: 1_500_000,
  pl: 500_000,
  plPct: 0.5,
  currency: "USD",
  monedaFila: "USD",
  valorPrimario: over.value ?? 1_500_000,
  priceUnavailable: false,
  ...over,
});

const montos = (...pares: [number, string][]) => pares.map(([monto, moneda]) => ({ monto, moneda }));

type Conc = NonNullable<FinancialContext["concentracion"]>;
/** La concentración CANÓNICA que hoy arma el context-engine desde el motor. El pack la consume. */
const conc = (over: Partial<Conc> = {}): Conc => ({
  moneda: "CRC",
  porPosicion: [],
  porMoneda: [],
  porRegion: [],
  porTipo: [],
  top1Pct: 0,
  top3Pct: 0,
  hhi: 0,
  slicesOmitidas: 0,
  ...over,
});


const ctx = (over: Partial<FinancialContext> = {}): FinancialContext => ({ currency: "CRC", ...over });

const tool = (over: Partial<ToolContext> = {}): ToolContext => ({ currency: "CRC", debts: [], ...over });

const debt = (over: Partial<ToolContext["debts"][number]> = {}) => ({
  id: "d1",
  name: "Tarjeta",
  balance: 800_000,
  apr: 24,
  minPayment: 40_000,
  ...over,
});

describe("buildEvidencePack · portafolio vacío", () => {
  const pack = buildEvidencePack(ctx(), tool());

  it("marca que no hay inversiones (el carril escala en vez de dar un informe vacío)", () => {
    expect(pack.tieneInversiones).toBe(false);
  });

  it("posiciones/concentración/moneda quedan no disponibles con motivo y cómo desbloquear", () => {
    for (const s of [pack.posiciones, pack.concentracion, pack.moneda]) {
      expect(s.disponible).toBe(false);
      if (s.disponible) continue;
      expect(s.motivo.length).toBeGreaterThan(0);
      expect(s.desbloquea.length).toBeGreaterThan(0);
    }
  });

  it("sin deudas: sección disponible que lo DICE (no inventa una comparación)", () => {
    expect(pack.deudaVsInversion).toEqual({ disponible: true, sinDeudas: true });
  });

  it("frescura vacía y sin banderas", () => {
    expect(pack.frescura).toEqual({ sinPrecio: [], total: 0 });
    expect(pack.banderas).toEqual([]);
  });
});

describe("buildEvidencePack · posición única → concentración = 1", () => {
  const pack = buildEvidencePack(
    ctx({
      holdings: [holding()],
      investmentValue: montos([1500, "USD"]),
      investmentInvested: montos([1000, "USD"]),
      investmentPL: montos([500, "USD"]),
      investmentValueBase: { monto: 1_500_000, moneda: "CRC" },
      concentracion: conc({
        porPosicion: [{ label: "BTC", valor: 1_500_000, pct: 1 }],
        porTipo: [{ label: "cripto", valor: 1_500_000, pct: 1 }],
        porMoneda: [{ label: "USD", valor: 1_500_000, pct: 1 }],
        top1Pct: 1,
        top3Pct: 1,
        hhi: 1,
      }),
    }),
    tool(),
  );

  it("top-1, top-3 y HHI valen 1 con una sola posición", () => {
    const c = pack.concentracion;
    expect(c.disponible).toBe(true);
    if (!c.disponible) return;
    // El monto va en la moneda BASE del motor, la misma en que se calcula el %.
    expect(c.top1).toEqual({ etiqueta: "BTC", valor: { monto: 1_500_000, moneda: "CRC" }, pct: 1 });
    expect(c.top3Pct).toBe(1);
    expect(c.hhi).toBe(1);
    expect(c.alta).toBe(true);
    expect(c.parcial).toBe(false);
  });

  it("los subtotales del ctx se copian tal cual, con su moneda (no se recalculan ni se aplanan)", () => {
    const p = pack.posiciones;
    expect(p.disponible).toBe(true);
    if (!p.disponible) return;
    expect(p.valorTotal).toEqual(montos([1500, "USD"]));
    expect(p.invertidoTotal).toEqual(montos([1000, "USD"]));
    expect(p.plTotal).toEqual(montos([500, "USD"]));
    expect(p.masCount).toBe(0);
  });
});

describe("buildEvidencePack · priceUnavailable en la posición más grande", () => {
  const holdings = [
    holding({ symbol: "KMNO", value: 3_000_000, invested: 3_000_000, pl: 0, plPct: 0, price: null, priceUnavailable: true }),
    holding({ symbol: "VOO", assetType: "etf", value: 1_000_000, invested: 800_000, pl: 200_000, plPct: 0.25 }),
  ];
  const pack = buildEvidencePack(
    ctx({
      holdings,
      investmentValue: montos([4000, "USD"]),
      investmentValueBase: { monto: 4_000_000, moneda: "CRC" },
      concentracion: conc({
        porPosicion: [
          { label: "KMNO", valor: 3_000_000, pct: 0.75 },
          { label: "VOO", valor: 1_000_000, pct: 0.25 },
        ],
        top1Pct: 0.75,
        top3Pct: 1,
        hhi: 0.625,
      }),
    }),
    tool(),
  );

  it("la marca de precios incompletos viaja en la concentración (el valor es costo, no mercado)", () => {
    const c = pack.concentracion;
    expect(c.disponible).toBe(true);
    if (!c.disponible) return;
    expect(c.preciosIncompletos).toBe(true);
    expect(c.top1.etiqueta).toBe("KMNO");
    expect(c.top1.pct).toBeCloseTo(0.75, 5);
  });

  it("frescura nombra las posiciones que no cotizaron", () => {
    expect(pack.frescura).toEqual({ sinPrecio: ["KMNO"], total: 2 });
  });
});

describe("buildEvidencePack · plan (brecha a la Independencia)", () => {
  it("sin Número de Independencia → sección no disponible, con el motivo", () => {
    const pack = buildEvidencePack(ctx({ holdings: [holding()] }), tool({ investableWealth: 5_000_000 }));
    expect(pack.plan.disponible).toBe(false);
    if (pack.plan.disponible) return;
    expect(pack.plan.motivo).toMatch(/Número de Independencia/i);
  });

  it("con ambos números: brecha y avance salen de las cifras del motor, sin proyectar", () => {
    const pack = buildEvidencePack(
      ctx({ holdings: [holding()], compromisoDesglose: { sobres: 0, metas: 0, dca: 75_000, deudas: 0, seguros: 0 } }),
      tool({ investableWealth: 5_000_000, independenceNumber: 20_000_000 }),
    );
    expect(pack.plan).toEqual({
      disponible: true,
      invertible: 5_000_000,
      independencia: 20_000_000,
      brecha: 15_000_000,
      avancePct: 0.25,
      dcaMensual: 75_000,
    });
  });

  it("sin DCA registrado el aporte queda null (no se asume ninguno)", () => {
    const pack = buildEvidencePack(
      ctx({ holdings: [holding()] }),
      tool({ investableWealth: 25_000_000, independenceNumber: 20_000_000 }),
    );
    expect(pack.plan.disponible).toBe(true);
    if (!pack.plan.disponible) return;
    expect(pack.plan.dcaMensual).toBeNull();
    expect(pack.plan.brecha).toBe(0); // ya lo superó: la brecha no se vuelve negativa
  });
});

describe("buildEvidencePack · deuda vs. rendimiento SUPUESTO (8%)", () => {
  const packCon = (apr: number): EvidencePack =>
    buildEvidencePack(ctx({ holdings: [holding()] }), tool({ debts: [debt({ apr })] }));

  it("APR por ENCIMA del 8% → deuda_cara, spread positivo en puntos porcentuales", () => {
    const d = packCon(24).deudaVsInversion;
    expect(d.disponible).toBe(true);
    if (!d.disponible || d.sinDeudas) return;
    expect(d.apr).toBeCloseTo(0.24, 6);
    expect(d.deudaCara).toBe(true);
    expect(d.spreadPp).toBeCloseTo(16, 6);
    expect(RENDIMIENTO_SUPUESTO).toBe(0.08);
  });

  it("APR por DEBAJO del 8% → no marca deuda cara, spread negativo", () => {
    const d = packCon(5).deudaVsInversion;
    expect(d.disponible).toBe(true);
    if (!d.disponible || d.sinDeudas) return;
    expect(d.deudaCara).toBe(false);
    expect(d.spreadPp).toBeCloseTo(-3, 6);
  });

  it("toma la deuda de MAYOR tasa, no la primera de la lista", () => {
    const pack = buildEvidencePack(
      ctx({ holdings: [holding()] }),
      tool({ debts: [debt({ name: "Préstamo", apr: 12 }), debt({ id: "d2", name: "Tarjeta", apr: 45, balance: 300_000 })] }),
    );
    const d = pack.deudaVsInversion;
    if (!d.disponible || d.sinDeudas) throw new Error("esperaba una deuda comparada");
    expect(d.nombre).toBe("Tarjeta");
    expect(d.saldo).toBe(300_000);
  });

  it("deudas SIN tasa registrada → no disponible (no se supone un 0%)", () => {
    const d = buildEvidencePack(ctx({ holdings: [holding()] }), tool({ debts: [debt({ apr: 0 })] })).deudaVsInversion;
    expect(d.disponible).toBe(false);
    if (d.disponible) return;
    expect(d.motivo).toMatch(/APR|tasa/i);
  });
});

describe("buildEvidencePack · descalce de moneda (colones vs. dólares)", () => {
  it("el peso se mide por donde COTIZA cada posición, no por donde se registró", () => {
    // La cripto está registrada en colones, pero cotiza en dólares: eso es exposición a USD.
    const holdings = [
      holding({ symbol: "BTC", currency: "CRC", monedaFila: "USD", value: 5660, valorPrimario: 3_000_000 }),
      holding({ symbol: "CERT", assetType: "otro", currency: "CRC", monedaFila: "CRC", value: 1_000_000, valorPrimario: 1_000_000 }),
    ];
    const m = buildEvidencePack(
      ctx({
        holdings,
        currency: "CRC",
        concentracion: conc({
          porMoneda: [
            { label: "USD", valor: 3_000_000, pct: 0.75 },
            { label: "CRC", valor: 1_000_000, pct: 0.25 },
          ],
        }),
      }),
      tool({ currency: "CRC" }),
    ).moneda;
    expect(m.disponible).toBe(true);
    if (!m.disponible) return;
    expect(m.visualizacion).toBe("CRC");
    expect(m.dominante).toEqual({ currency: "USD", pct: 0.75 });
    expect(m.descalce).toBe(true);
    expect(m.porMoneda).toEqual([
      { currency: "USD", pct: 0.75 },
      { currency: "CRC", pct: 0.25 },
    ]);
  });

  it("mayoría en la MISMA moneda que ve el usuario → sin descalce", () => {
    const holdings = [
      holding({ monedaFila: "CRC", value: 3_000_000, valorPrimario: 3_000_000 }),
      holding({ symbol: "VOO", monedaFila: "USD", value: 940, valorPrimario: 500_000 }),
    ];
    const m = buildEvidencePack(
      ctx({
        holdings,
        concentracion: conc({
          porMoneda: [
            { label: "CRC", valor: 3_000_000, pct: 0.857 },
            { label: "USD", valor: 500_000, pct: 0.143 },
          ],
        }),
      }),
      tool({ currency: "CRC" }),
    ).moneda;
    if (!m.disponible) throw new Error("esperaba sección de moneda");
    expect(m.descalce).toBe(false);
  });

  it("USD dominante pero por debajo del 50% del portafolio → no se marca descalce", () => {
    const holdings = [
      holding({ monedaFila: "USD", valorPrimario: 1_000_000 }),
      holding({ symbol: "A", monedaFila: "CRC", valorPrimario: 800_000 }),
      holding({ symbol: "B", monedaFila: "EUR", valorPrimario: 700_000 }),
    ];
    const m = buildEvidencePack(
      ctx({
        holdings,
        concentracion: conc({
          porMoneda: [
            { label: "USD", valor: 1_000_000, pct: 0.4 },
            { label: "CRC", valor: 800_000, pct: 0.32 },
            { label: "EUR", valor: 700_000, pct: 0.28 },
          ],
        }),
      }),
      tool({ currency: "CRC" }),
    ).moneda;
    if (!m.disponible) throw new Error("esperaba sección de moneda");
    expect(m.dominante.currency).toBe("USD");
    expect(m.descalce).toBe(false);
  });
});

describe("buildEvidencePack · defensa y banderas", () => {
  it("invertir con colchón < 3 meses se marca; las banderas §15 van tal cual", () => {
    const pack = buildEvidencePack(
      ctx({ holdings: [holding()], mesesDeColchon: 1.5, patrimonioDiagnosis: ["alta_concentracion", "deuda_mala_alta"] }),
      tool(),
    );
    expect(pack.defensa).toEqual({ disponible: true, meses: 1.5, invierteConColchonCorto: true });
    expect(pack.banderas).toEqual(["alta_concentracion", "deuda_mala_alta"]);
  });

  it("sin meses de colchón → sección no disponible (no se asume 0)", () => {
    const pack = buildEvidencePack(ctx({ holdings: [holding()] }), tool());
    expect(pack.defensa.disponible).toBe(false);
  });
});
