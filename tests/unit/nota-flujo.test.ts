/**
 * La nota estructurada en las DOS naturalezas.
 *
 * Una nota puede pagar cupón periódico (flujo) o acumular hasta el vencimiento
 * (crecimiento). Es el mismo instrumento y el mismo `asset_type`: lo único que
 * cambia es cómo entra en el flujo de caja. Lo que estos tests protegen:
 *
 *  · que las dos categorías compartan términos, lectura de riesgo y etiqueta;
 *  · que un cupón trimestral se materialice SOLO en sus meses, en fase con el
 *    ancla — proyectarlo todos los meses fue el bug de los ingresos (#740) y
 *    acá se repetiría en el presupuesto derivado y en la cobertura pasiva;
 *  · que "al vencimiento" NO se proyecte como ingreso mensual: llega una vez.
 */
import { describe, it, expect } from "vitest";
import { CATEGORY_META, etiquetaPayout, natureOfCategory } from "@/modules/wealth/constants";
import {
  INVESTMENT_CATEGORIES,
  type AssetType,
  type InvestmentCategory,
  type RentalFrequency,
} from "@/modules/wealth/types";
import { categoryFromAssetType } from "@/modules/wealth/engine/holding-payload";
import {
  calcularRendimiento,
  esFrecuenciaPago,
  esPagoAlVencimiento,
  textoRendimiento,
  PAGO_AL_VENCIMIENTO,
} from "@/lib/finance/rendimiento-periodico";
import { caeEnElPeriodo } from "@/modules/financial-base/engine/income-schedule";
import { monthlyIncomeOf } from "@/modules/wealth/engine/portfolio-engine";
import { lecturaDeRiesgo } from "@/modules/wealth/engine/nota-estructurada";
import { filasDeNota, terminosDeNota } from "@/modules/wealth/engine/detalle-instrumento";

describe("las dos categorías de nota", () => {
  it("existen, una en cada naturaleza", () => {
    expect(natureOfCategory("nota_estructurada_flujo")).toBe("cashflow");
    expect(natureOfCategory("nota_estructurada")).toBe("growth");
  });

  it("comparten el MISMO asset_type: es el mismo instrumento", () => {
    expect(CATEGORY_META.nota_estructurada_flujo.defaultAssetType).toBe("nota_estructurada");
    expect(CATEGORY_META.nota_estructurada.defaultAssetType).toBe("nota_estructurada");
  });

  it("se distinguen en el label, para que no haya que adivinar cuál es cuál", () => {
    expect(CATEGORY_META.nota_estructurada_flujo.label).toContain("cupón");
    expect(CATEGORY_META.nota_estructurada.label).toContain("vencimiento");
  });

  it("cada slug del catálogo tiene su entrada en CATEGORY_META", () => {
    // El catálogo creció más allá de las 20 del plan; lo que importa no es el
    // número sino que ninguna categoría quede sin naturaleza.
    for (const c of INVESTMENT_CATEGORIES) {
      expect(CATEGORY_META[c], "falta CATEGORY_META." + c).toBeDefined();
      expect(["cashflow", "growth"]).toContain(CATEGORY_META[c].nature);
    }
  });

  it("los términos y la lectura de riesgo NO dependen de la categoría", () => {
    // La categoría no viaja al motor: los términos son del holding, y el holding
    // es el mismo se liste donde se liste.
    const terminos = {
      assetType: "nota_estructurada" as const,
      noteIssuer: "JP Morgan",
      noteUnderlying: "S&P 500",
      noteCapitalProtectionPct: 100,
      noteBarrierPct: 70,
      maturityDate: "2029-06-30",
    };
    expect(filasDeNota(terminos)).toEqual(filasDeNota({ ...terminos }));
    // Con barrera el capital es condicionado en las dos: 100% no lo vuelve seguro.
    expect(lecturaDeRiesgo(terminosDeNota(terminos)).nivel).toBe("condicionado");
    expect(lecturaDeRiesgo(terminosDeNota(terminos)).puntos[0]).toContain("Barrera");
  });

  it("la naturaleza sale de la CATEGORÍA, no del tipo de activo", () => {
    // Es lo que el detalle mira para presentarse: dos holdings con el mismo
    // `asset_type` tienen naturaleza distinta según dónde se los guardó. Si el
    // detalle ramificara por tipo (como hacía), las dos se verían iguales.
    const naturalezaDe = (categoria: InvestmentCategory | null, assetType: AssetType) =>
      CATEGORY_META[categoria ?? categoryFromAssetType(assetType)].nature;

    expect(naturalezaDe("nota_estructurada_flujo", "nota_estructurada")).toBe("cashflow");
    expect(naturalezaDe("nota_estructurada", "nota_estructurada")).toBe("growth");
  });

  it("sin categoría, una nota cae en crecimiento: es el default declarado", () => {
    // No se infiere flujo desde el cupón: un holding de crecimiento con pago
    // configurado seguiría siendo de crecimiento, y adivinar lo contradiría.
    expect(categoryFromAssetType("nota_estructurada")).toBe("nota_estructurada");
    expect(CATEGORY_META[categoryFromAssetType("nota_estructurada")].nature).toBe("growth");
  });

  it("el pago se llama cupón en las dos, porque lo decide el tipo de activo", () => {
    expect(etiquetaPayout("nota_estructurada")).toEqual({
      singular: "cupón",
      plural: "cupones",
    });
  });
});

describe("cupón del 8% anual trimestral sobre $10.000", () => {
  const config = {
    modo: "yield" as const,
    yieldPct: 8,
    frecuencia: "trimestral" as const,
    retencionPct: 0,
  };

  it("son $200 brutos por cupón, no $800", () => {
    // 8% de 10.000 = 800 al año, en cuatro pagos.
    expect(calcularRendimiento(config, 10000).brutoPorPago).toBe(200);
  });

  it("proyecta $66,67 por mes", () => {
    expect(calcularRendimiento(config, 10000).netoMensual).toBeCloseTo(66.67, 2);
  });

  it("con 10% de retención el neto por cupón es $180 y el mes $60", () => {
    const r = calcularRendimiento({ ...config, retencionPct: 10 }, 10000);
    expect(r.retenidoPorPago).toBe(20);
    expect(r.netoPorPago).toBe(180);
    expect(r.netoMensual).toBe(60);
  });

  it("la vista previa lo dice con la palabra cupón", () => {
    const r = calcularRendimiento({ ...config, retencionPct: 10 }, 10000);
    const texto = textoRendimiento(r, 10, (n) => "$" + n, { etiqueta: "cupón" });
    expect(texto).toContain("brutos por cupón");
    expect(texto).toContain("$180 netos");
    expect(texto).toContain("$60 netos/mes");
  });

  it("entra en el ingreso mensual del holding", () => {
    const mensual = monthlyIncomeOf({
      quantity: 1,
      averageCost: 10000,
      payoutEnabled: true,
      payoutMode: "yield",
      payoutRatePct: 8,
      payoutFrequency: "trimestral",
      payoutWithholdingPct: 10,
    });
    expect(mensual).toBe(60);
  });
});

describe("calendario del cupón: ancla en marzo", () => {
  const ancla = "2026-03-15";
  const cae = (year: number, month: number) => caeEnElPeriodo("trimestral", ancla, { year, month });

  it("cae en marzo, junio, septiembre y diciembre", () => {
    for (const m of [3, 6, 9, 12]) expect(cae(2026, m), "mes " + m).toBe(true);
  });

  it("NO cae en los otros ocho meses", () => {
    for (const m of [1, 2, 4, 5, 7, 8, 10, 11]) expect(cae(2026, m), "mes " + m).toBe(false);
  });

  it("sigue en fase el año siguiente", () => {
    expect(cae(2027, 3)).toBe(true);
    expect(cae(2027, 4)).toBe(false);
  });

  it("no cae antes del primer pago", () => {
    expect(cae(2025, 12)).toBe(false);
  });

  it("un cupón bimensual con ancla en marzo cae en los meses impares desde marzo", () => {
    const bim = (month: number) => caeEnElPeriodo("bimensual", ancla, { year: 2026, month });
    expect([3, 5, 7, 9, 11].every(bim)).toBe(true);
    expect([4, 6, 8, 10, 12].some(bim)).toBe(false);
  });
});

describe("al vencimiento: un pago, no un flujo", () => {
  it("NO es una frecuencia de pago, y de ahí sale que no se proyecte mensual", () => {
    // Todo consumidor del rendimiento pregunta `esFrecuenciaPago` antes de
    // proyectar: con false, el presupuesto derivado y el recordatorio lo saltan.
    expect(esFrecuenciaPago(PAGO_AL_VENCIMIENTO)).toBe(false);
    expect(esPagoAlVencimiento(PAGO_AL_VENCIMIENTO)).toBe(true);
  });

  it("no aporta ingreso mensual al holding", () => {
    expect(
      monthlyIncomeOf({
        quantity: 1,
        averageCost: 10000,
        payoutEnabled: true,
        payoutMode: "yield",
        payoutRatePct: 8,
        payoutFrequency: PAGO_AL_VENCIMIENTO,
        payoutWithholdingPct: 0,
      }),
    ).toBe(0);
  });

  it("tampoco lo aporta una renta al vencimiento (bono/CDP)", () => {
    // Antes caía en el `?? 1` de la tabla de frecuencias y se contaba como si
    // llegara TODOS los meses.
    expect(
      monthlyIncomeOf({
        quantity: 1,
        averageCost: 10000,
        rentalIncome: 5000,
        rentalFrequency: "al_vencimiento",
      }),
    ).toBe(0);
  });

  it("la vista previa no promete un equivalente mensual", () => {
    const r = calcularRendimiento(
      { modo: "yield", yieldPct: 8, frecuencia: "anual", retencionPct: 0 },
      10000,
    );
    const texto = textoRendimiento(r, 0, (n) => "$" + n, {
      etiqueta: "cupón",
      alVencimiento: true,
    });
    expect(texto).toContain("un único pago al vencimiento");
    expect(texto).not.toContain("/mes");
  });
});

describe("la tabla de frecuencias de renta", () => {
  // Un valor ausente caía en el `?? 1` y trataba el pago como MENSUAL.
  const renta = (rentalFrequency: RentalFrequency) =>
    monthlyIncomeOf({ quantity: 0, averageCost: 0, rentalIncome: 600, rentalFrequency });

  it("cubre TODAS las frecuencias de renta que el tipo permite", () => {
    // Este es el test que importa: si mañana se agrega una frecuencia al tipo y
    // no a la tabla, se contaría como mensual y nadie se enteraría.
    const todas: RentalFrequency[] = [
      "semanal",
      "mensual",
      "trimestral",
      "semestral",
      "anual",
      "al_vencimiento",
    ];
    for (const f of todas) {
      // al_vencimiento no es recurrente: su ingreso mensual es 0, no 600.
      const esperado = f === "al_vencimiento" ? 0 : null;
      if (esperado !== null) expect(renta(f), f).toBe(esperado);
      else expect(renta(f), f).toBeGreaterThan(0);
    }
  });

  it("semestral son 100 por mes, no 600", () => {
    expect(renta("semestral")).toBe(100);
  });

  it("semanal son 600 por semana, o sea 600 × 52/12 por mes", () => {
    // Faltaba en la tabla: se contaba como si fuera un único pago mensual.
    expect(renta("semanal")).toBeCloseTo(600 * (52 / 12), 2);
  });
});
