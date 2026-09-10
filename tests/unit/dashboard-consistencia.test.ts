/**
 * Consistencia del Centro de mando: cada KPI del panel === el valor del MOTOR UNIFICADO.
 *
 * El bug que evita: el panel quedó leyendo motores viejos mientras el resto de la app
 * migró, y la misma pantalla llegó a decir "Inversiones $0 · configurá tu patrimonio" al
 * lado de "18 posiciones", "0% de libertad" con cupones y CDP configurados, y un aporte a
 * metas de "$395.710/mes" que era ₡ sumado como $. Ninguno era un cálculo malo: eran
 * DOS fuentes para la misma métrica.
 *
 * Por eso el test no verifica fórmulas (para eso están los tests de cada motor): corre los
 * motores unificados sobre un fixture con posiciones cotizadas y manuales, payouts, metas
 * en ₡ y en $ y deudas, y exige que lo que sale por el panel sea EL MISMO NÚMERO. Si
 * alguien cambia un motor, el panel no puede quedarse atrás sin que esto falle.
 */
import { describe, it, expect } from "vitest";
import { buildDashboardKpis } from "@/modules/dashboard/engine/kpis";
import { buildPanel } from "@/modules/dashboard/engine/pillars";
import { computePortfolioAnalytics } from "@/modules/wealth/engine/portfolio-engine";
import { computePortfolio } from "@/modules/wealth/engine/wealth-engine";
import { computePatrimonio } from "@/modules/wealth/engine/patrimonio-engine";
import { sumAssetsByClass } from "@/modules/wealth/engine/patrimonio-mappers";
import { computeRichLifeIndicators } from "@/modules/rich-life/engine/rich-life-engine";
import { aggregateMonthFlow } from "@/modules/financial-base/engine/month-flow";
import { computeHealthScore, computeBaseIndicators } from "@/modules/financial-base";
import { crearConversor, sumarEnMoneda } from "@/lib/fx";
import { formatMoney, formatPercent } from "@/lib/format";
import type { Holding } from "@/modules/wealth/types";
import type { Asset, Liability } from "@/modules/rich-life/types";
import type { BaseIndicators } from "@/modules/financial-base";

// ── Fixture ─────────────────────────────────────────────────────────────────
// Moneda de visualización USD; hay datos en ₡ a propósito (es donde el panel mentía).
const MONEDA = "USD";
const RATES = { USD: 1, CRC: 500 };
const convertir = crearConversor(MONEDA, RATES);

/** Dos cotizadas (con precio), una cotizable SIN precio y una valuada a mano. */
const HOLDINGS: Holding[] = [
  { id: "h1", symbol: "VOO", assetType: "etf", quantity: 10, averageCost: 400, currency: MONEDA },
  {
    id: "h2",
    symbol: "BTC",
    assetType: "cripto",
    quantity: 0.5,
    averageCost: 50_000,
    currency: MONEDA,
  },
  {
    id: "h3",
    symbol: "XYZ",
    assetType: "accion",
    quantity: 100,
    averageCost: 12,
    currency: MONEDA,
  },
  {
    id: "h4",
    symbol: "CDP-BAC",
    assetType: "certificado",
    quantity: 1,
    averageCost: 20_000,
    currency: MONEDA,
    currentValueManual: 26_000,
    updatedAt: "2026-09-01T00:00:00.000Z",
  },
];
// XYZ no cotiza hoy a propósito: su "valor" es el costo, como placeholder.
const PRECIOS = { VOO: 520, BTC: 60_000 };

/** Metas en DOS monedas: el caso exacto del "$395.710/mes". */
const METAS = [
  { amount: 1_600, currency: "USD" }, // aporte mensual
  { amount: 68_000, currency: "CRC" },
  { amount: 125_000, currency: "CRC" },
];
const APORTE_METAS = sumarEnMoneda(METAS, convertir); // 1600 + 136 + 250 = 1986 USD

const DEUDAS_NATIVAS = [
  { saldo: 4_000, cuota: 200, currency: "USD" },
  { saldo: 1_500_000, cuota: 90_000, currency: "CRC" },
];
const DEUDAS_SALDOS = DEUDAS_NATIVAS.map((d) => convertir(d.saldo, d.currency));
const DEUDAS_CUOTA = sumarEnMoneda(
  DEUDAS_NATIVAS.map((d) => ({ amount: d.cuota, currency: d.currency })),
  convertir,
);

/** Payouts ya clasificados como pasivos (dividendos + cupón del CDP + renta). */
const INGRESO_PASIVO = 900;
const INGRESO_MENSUAL = 8_000;

// ── Motores unificados sobre el fixture ─────────────────────────────────────

const analytics = computePortfolioAnalytics(HOLDINGS, PRECIOS);

/** El motor VIEJO que el panel leía: la tabla `investments`, vacía en cuentas migradas. */
const portfolioViejo = computePortfolio([]);

const ACTIVOS: Asset[] = [
  {
    id: "a1",
    name: "Portafolio",
    assetClass: "inversion",
    value: analytics.totalPortfolioValue,
    currency: MONEDA,
    generatesIncome: false,
    liquidity: "media",
  },
  {
    id: "a2",
    name: "Liquidez",
    assetClass: "liquido",
    value: 12_000,
    currency: MONEDA,
    generatesIncome: false,
    liquidity: "alta",
  },
  {
    id: "a3",
    name: "Local alquilado",
    assetClass: "productivo",
    value: 40_000,
    currency: MONEDA,
    generatesIncome: true,
    liquidity: "baja",
  },
];
const PASIVOS: Liability[] = DEUDAS_SALDOS.map((balance, i) => ({
  id: `l${i}`,
  name: `Deuda ${i}`,
  liabilityClass: "consumo",
  balance,
  currency: MONEDA,
}));

const COMPROMISO = APORTE_METAS + DEUDAS_CUOTA + 600; // metas + deudas + sobres

const richLife = computeRichLifeIndicators({
  assets: ACTIVOS,
  liabilities: PASIVOS,
  passiveIncomeMonthly: INGRESO_PASIVO,
  monthlyExpenses: 600,
  monthlyCommitment: COMPROMISO,
  freeCashflow: 2_000,
  protectionScore: 70,
  diversification: "media",
  previous: { netWorth: 90_000 },
  closedWealthDelta: 1_200,
  currency: MONEDA,
});

const patrimonio = computePatrimonio({
  assetsByClass: sumAssetsByClass(ACTIVOS),
  totalLiabilities: PASIVOS.reduce((s, l) => s + l.balance, 0),
  protectedCoverage: 100_000,
  protectionScore: 70,
  monthlyExpenses: 600,
  monthlyCommitment: COMPROMISO,
  passiveIncomeMonthly: INGRESO_PASIVO,
  netMonthlyIncome: INGRESO_MENSUAL,
  monthlyInvested: APORTE_METAS,
  badDebtMonthlyPayment: 0,
  diversification: "media",
  topConcentration: 0.4,
  essentialMonthlyExpenses: 450,
  desiredMonthlyLifestyle: 12_000,
  currency: MONEDA,
});

const monthFlow = aggregateMonthFlow({
  rows: [
    {
      flow: "operating_income",
      kind: "ingreso",
      value: 9_500,
      confirmed: true,
      countsInBudget: true,
    },
    {
      flow: "operating_expense",
      kind: "gasto",
      value: 4_200,
      confirmed: true,
      countsInBudget: true,
    },
    // Capital: NO entra en el flujo operativo (aporte a meta).
    { flow: "capital_out", kind: "gasto", value: 1_000, confirmed: true, countsInBudget: true },
  ],
  plan: { income: INGRESO_MENSUAL, expense: 5_000 },
  budget: 5_000,
  currency: MONEDA,
});

// ── El panel, alimentado por esos MISMOS reports ─────────────────────────────

const kpis = buildDashboardKpis({
  currency: MONEDA,
  monthFlow,
  patrimonio: {
    coberturaPasiva: patrimonio.coberturaPasiva,
    passiveIncomeMonthly: INGRESO_PASIVO,
    gastoReferenciaMensual: patrimonio.gastoReferenciaMensual,
    progresoIndependencia: patrimonio.progresoIndependencia,
    hitoAlcanzado: patrimonio.hitoAlcanzado,
    netMonthlyIncome: INGRESO_MENSUAL,
    aporteMetasMensual: APORTE_METAS,
    aporteDcaMensual: 0,
    mesesDeColchon: patrimonio.mesesDeColchon,
  },
  richLife: {
    netWorth: richLife.netWorth,
    totalAssets: richLife.totalAssets,
    totalLiabilities: richLife.totalLiabilities,
    productiveAssetsPct: richLife.productiveAssetsPct,
    trend: richLife.trend,
    wealthVelocity: richLife.wealthVelocity,
    velocityIsPartial: richLife.velocityIsPartial,
  },
  deudas: {
    saldos: DEUDAS_SALDOS,
    incomeMonthly: INGRESO_MENSUAL,
    pagoMensual: DEUDAS_CUOTA,
    metodo: "avalancha",
  },
  portafolio: {
    valorTotal: analytics.totalPortfolioValue,
    costoTotal: analytics.totalCostBasis,
    plTotal: analytics.totalProfitLoss,
    posiciones: analytics.holdingsWithPerformance,
  },
  ahora: Date.parse("2026-09-09T00:00:00.000Z"),
});

const panel = buildPanel({ ind: {} as BaseIndicators, kpis });
const pilar = (k: string) => panel.pillars.find((p) => p.key === k)!;

// ── Aserciones: un KPI, un motor ────────────────────────────────────────────

describe("cada KPI del panel === el motor unificado", () => {
  it("INVERSIONES sale del portafolio a valor de MERCADO, no de la tabla investments", () => {
    expect(kpis.inversiones!.valorMercado).toBe(analytics.totalPortfolioValue);
    expect(kpis.inversiones!.invertido).toBe(analytics.totalCostBasis);
    expect(kpis.inversiones!.posiciones).toBe(HOLDINGS.length);
    // El motor viejo daba 0 con las mismas posiciones: es exactamente el "$0 · configurá
    // tu patrimonio" al lado de "4 posiciones". Si alguien lo vuelve a enchufar, falla.
    expect(portfolioViejo.totalInvested).toBe(0);
    expect(kpis.inversiones!.valorMercado).not.toBe(portfolioViejo.totalInvested);
    expect(pilar("inversiones").value).toBe(formatMoney(analytics.totalPortfolioValue, MONEDA));
  });

  it("INVERSIONES separa mercado, manual y sin precio (no funde los tres en un titular)", () => {
    const i = kpis.inversiones!;
    expect(i.manual.posiciones).toBe(1); // el CDP valuado a mano
    expect(i.manual.valor).toBe(26_000);
    expect(i.sinPrecio.posiciones).toBe(1); // XYZ, cotizable sin precio hoy
    expect(i.conPrecio.posiciones).toBe(2); // VOO + BTC
    // El resultado publicado es SOLO el de lo que cotiza: el +6.000 escrito a mano no
    // puede presentarse como un resultado de mercado.
    expect(i.conPrecio.pl).toBe(i.conPrecio.valor - i.conPrecio.invertido);
    expect(pilar("inversiones").meta).toMatch(/valuada.? por vos/);
    expect(pilar("inversiones").meta).toMatch(/sin precio hoy/);
  });

  it("LIBERTAD es la cobertura pasiva del motor de patrimonio, nunca 0% con payouts", () => {
    expect(kpis.libertad!.cobertura).toBe(patrimonio.coberturaPasiva);
    expect(kpis.libertad!.cobertura).toBeGreaterThan(0);
    expect(kpis.libertad!.gastoReferencia).toBe(patrimonio.gastoReferenciaMensual);
    expect(panel.norte.freedomPct).toBeCloseTo(patrimonio.coberturaPasiva, 6);
    expect(panel.norte.freedomText).toContain(formatMoney(INGRESO_PASIVO, MONEDA));
  });

  it("LIBERTAD usa el mismo progreso que los tres números de Patrimonio", () => {
    expect(kpis.libertad!.progresoIndependencia).toBe(patrimonio.progresoIndependencia);
    expect(kpis.libertad!.fase).toBe(patrimonio.hitoAlcanzado);
  });

  it("FLUJO es ingreso − gasto operativo del mes, la misma definición que Mi Base", () => {
    expect(kpis.flujo!.real).toBe(monthFlow.real.operatingFlow);
    expect(kpis.flujo!.real).toBe(monthFlow.real.operatingIncome - monthFlow.real.operatingExpense);
    expect(kpis.flujo!.plan).toBe(monthFlow.plan.free);
    expect(pilar("flujo").value).toBe(formatMoney(monthFlow.real.operatingFlow, MONEDA));
    // El aporte a meta (capital) NO se cuela en el flujo operativo.
    expect(kpis.flujo!.realGasto).toBe(4_200);
  });

  it("FLUJO explica cuando el real supera al plan, en vez de dejar un número imposible", () => {
    const conExceso = buildDashboardKpis({
      currency: MONEDA,
      monthFlow: aggregateMonthFlow({
        rows: [
          {
            flow: "operating_income",
            kind: "ingreso",
            value: 35_000,
            confirmed: true,
            countsInBudget: true,
          },
        ],
        plan: { income: 21_441, expense: 4_138 },
        budget: 4_138,
        currency: MONEDA,
      }),
      patrimonio: null,
      richLife: null,
      deudas: null,
      portafolio: null,
    });
    expect(conExceso.flujo!.real).toBeGreaterThan(conExceso.flujo!.plan);
    expect(conExceso.flujo!.explicacion).toMatch(/163%/);
    expect(conExceso.flujo!.explicacion).toMatch(/gasto registrado/);
  });

  it("AHORRO es aportes ÷ ingreso, con las metas en ₡ CONVERTIDAS", () => {
    // 1.600 USD + ₡68.000 + ₡125.000 = 1.600 + 136 + 250 = 1.986 USD, no "194.600".
    expect(APORTE_METAS).toBeCloseTo(1_986, 6);
    expect(kpis.ahorro!.aporteMetas).toBeCloseTo(APORTE_METAS, 2);
    expect(kpis.ahorro!.tasa).toBeCloseTo(APORTE_METAS / INGRESO_MENSUAL, 4);
    expect(pilar("ahorro").value).toBe(formatPercent(kpis.ahorro!.tasa));
    expect(pilar("ahorro").meta).toContain(formatMoney(APORTE_METAS, MONEDA));
    // Y NO la suma cruda, que es el número que el hub llegó a publicar.
    const crudo = METAS.reduce((s, m) => s + m.amount, 0);
    expect(kpis.ahorro!.aporteMetas).not.toBeCloseTo(crudo, 0);
  });

  it("AHORRO alimenta el score de salud con la MISMA tasa que muestra el pilar", () => {
    const ind = computeBaseIndicators(
      [
        {
          id: "i",
          name: "Salario",
          incomeType: "activo",
          amount: INGRESO_MENSUAL,
          currency: MONEDA,
          frequency: "mensual",
          isFixed: true,
          ownerScope: "usuario",
          includeInBudget: true,
          amountMonthly: INGRESO_MENSUAL,
        },
      ],
      [],
    );
    // Sin gastos presupuestados, `ind.savingsRate` es 100%: el número que daba "salud 100".
    expect(ind.savingsRate).toBe(1);
    const health = computeHealthScore(ind, ind.investmentRate, kpis.ahorro!.tasa);
    const barra = health.bars.find((b) => b.label === "Tasa de ahorro")!;
    // La barra del score dice lo mismo que el pilar. Antes decía 100% mientras el pilar
    // (si hubiera existido) decía 25%.
    expect(barra.display).toBe(`${Math.round(kpis.ahorro!.tasa * 100)}%`);
    expect(barra.display).toBe(pilar("ahorro").value.replace(/\s/g, ""));
    // Y el override MANDA: con una tasa real baja el score baja, aunque
    // `ind.savingsRate` siga diciendo 100%.
    const conTasaBaja = computeHealthScore(ind, ind.investmentRate, 0.02);
    expect(conTasaBaja.score).toBeLessThan(computeHealthScore(ind, ind.investmentRate).score);
    expect(conTasaBaja.bars[0]!.display).toBe("2%");
  });

  it("DEUDAS sale de la tabla debts (saldo + DTI), con los saldos en ₡ convertidos", () => {
    expect(kpis.deudas!.numDeudas).toBe(2);
    expect(kpis.deudas!.total).toBeCloseTo(4_000 + 3_000, 2); // ₡1.500.000 = $3.000
    expect(kpis.deudas!.dti).toBeCloseTo(DEUDAS_CUOTA / INGRESO_MENSUAL, 4);
    expect(pilar("deudas").value).toBe(formatMoney(kpis.deudas!.total, MONEDA));
  });

  it("PATRIMONIO usa el neto de rich-life, con activos y pasivos ya normalizados", () => {
    expect(kpis.patrimonio!.neto).toBe(richLife.netWorth);
    expect(kpis.patrimonio!.activos).toBeCloseTo(richLife.totalAssets, 2);
    expect(kpis.patrimonio!.pasivos).toBeCloseTo(richLife.totalLiabilities, 2);
    expect(panel.norte.netWorth).toBe(richLife.netWorth);
    expect(panel.norte.trend).toBe(richLife.trend);
  });

  it("el patrimonio del panel y el de Patrimonio hablan del mismo dinero", () => {
    // Los dos motores agregan los mismos activos/pasivos: si divergen, uno de los dos
    // está leyendo otra cosa y la pantalla vuelve a contradecirse sola.
    expect(kpis.patrimonio!.neto).toBeCloseTo(patrimonio.netWorth, 0);
  });

  it("NINGUNA tarjeta inventa un cero cuando su motor no cargó", () => {
    const sinNada = buildDashboardKpis({
      currency: MONEDA,
      monthFlow: null,
      patrimonio: null,
      richLife: null,
      deudas: null,
      portafolio: null,
    });
    expect(sinNada.libertad).toBeNull();
    expect(sinNada.inversiones).toBeNull();
    expect(sinNada.ahorro).toBeNull();
    expect(sinNada.deudas).toBeNull();
    const p = buildPanel({ ind: {} as BaseIndicators, kpis: sinNada });
    expect(p.norte.freedomPct).toBeNull();
    for (const card of p.pillars) {
      expect(card.value).toBe("—");
      expect(card.sinDato).toBe(true);
    }
  });

  it("todos los montos del panel se rotulan con LA MISMA moneda de visualización", () => {
    const simbolo = formatMoney(0, MONEDA).replace(/[\d.,\s]/g, "");
    const textos = [
      ...panel.pillars.flatMap((p) => [p.value, p.meta, p.ai]),
      panel.norte.freedomText,
      panel.norte.velocityText,
    ].join(" ");
    // No puede aparecer el símbolo de otra moneda: todo pasó por el mismo conversor.
    expect(textos).not.toContain("₡");
    expect(textos).toContain(simbolo);
  });
});
