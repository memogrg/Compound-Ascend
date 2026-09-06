import { describe, it, expect } from "vitest";
import {
  decidirPeriodoIndicadores,
  mesAnterior,
} from "@/modules/financial-base/engine/periodo-indicadores";
import { computeBaseIndicators } from "@/modules/financial-base/engine/base-engine";
import { computeHealthScore } from "@/modules/financial-base/engine/health";
import type { IncomeSource, ExpenseItem } from "@/modules/financial-base/types";

const SEP = { year: 2026, month: 9 };

/**
 * EL CASO QUE ORIGINÓ TODO: día 2 del mes. Las fuentes recurrentes ya se
 * materializaron solas (ensureRecurringIncome), pero los sobres del mes todavía
 * no están puestos. Con ingreso completo y gasto a medias, el flujo libre se
 * dispara y el score sale 100 "SÓLIDA" — un diagnóstico falsamente optimista
 * justo en el número que más se mira.
 */
describe("día 2 · ingreso materializado, gasto sin configurar", () => {
  const ingreso = (monthly: number): IncomeSource =>
    ({
      id: "i1",
      name: "Salario",
      incomeType: "activo",
      amount: monthly,
      currency: "USD",
      frequency: "mensual",
      isFixed: true,
      ownerScope: "usuario",
      includeInBudget: true,
      amountMonthly: monthly,
    }) as IncomeSource;

  const gasto = (monthly: number, nature: ExpenseItem["nature"]): ExpenseItem =>
    ({
      id: `e-${nature}-${monthly}`,
      name: nature,
      nature,
      amount: monthly,
      currency: "USD",
      frequency: "mensual",
      isFixed: true,
      ownerScope: "usuario",
      amountMonthly: monthly,
    }) as ExpenseItem;

  // Septiembre a medias: el ingreso ya materializado contra SÓLO las líneas
  // derivadas (aportes y primas). Los sobres manuales —lo esencial— no están.
  const septiembreAMedias = () =>
    computeBaseIndicators([ingreso(20_534)], [gasto(3_530, "ahorro"), gasto(513, "proteccion")]);
  // Agosto, mes completo: los mismos más los sobres manuales.
  const agostoCompleto = () =>
    computeBaseIndicators(
      [ingreso(20_534)],
      [gasto(3_530, "ahorro"), gasto(513, "proteccion"), gasto(2_812, "esencial")],
    );

  it("el score del mes a medias sale 100 SÓLIDA sobre un gasto que no está cargado", () => {
    const sep = septiembreAMedias();
    const score = computeHealthScore(sep);
    expect(score.score).toBe(100);
    expect(score.grade).toBe("SÓLIDA");
    // La marca del mes incompleto: sin sobres manuales no hay gasto esencial,
    // así que el pilar de esenciales puntúa perfecto por ausencia de datos.
    expect(sep.essentialsWeight).toBe(0);
  });

  it("con el corte, los indicadores son los de agosto y van etiquetados", () => {
    const d = decidirPeriodoIndicadores({
      actual: SEP,
      tienePresupuestoDeGasto: false, // ningún sobre manual todavía
      ventanaAbierta: true, // día 2
      hayMesCerrado: true,
    });

    expect(d.periodo).toEqual({ year: 2026, month: 8 });
    expect(d.estado).toBe("mes_cerrado");
    expect(d.etiqueta).toBe("según agosto — septiembre aún sin presupuesto");
  });

  it("agosto puede dar 100 también — pero es un 100 con el gasto cargado", () => {
    // El punto NO es que el score baje: con ingreso 20.534 y gasto 6.855 el 100
    // es legítimo. El punto es de qué mes habla el número. La diferencia
    // medible entre los dos meses es que en agosto el gasto esencial EXISTE.
    const ago = agostoCompleto();
    expect(ago.essentialsWeight).toBeGreaterThan(0);
    expect(ago.expenseMonthly).toBeGreaterThan(septiembreAMedias().expenseMonthly);
  });
});

describe("corte de salida: en cuanto el mes tiene presupuesto de gasto", () => {
  it("pasa a los indicadores del mes real, sin etiqueta", () => {
    // Da igual cómo se pobló (el ritual, "Traer mis recurrentes" o a mano).
    const d = decidirPeriodoIndicadores({
      actual: SEP,
      tienePresupuestoDeGasto: true,
      ventanaAbierta: true,
      hayMesCerrado: true,
    });
    expect(d.periodo).toEqual(SEP);
    expect(d.estado).toBe("actual");
    expect(d.etiqueta).toBeNull();
  });

  it("el presupuesto manda incluso con la ventana ya vencida", () => {
    const d = decidirPeriodoIndicadores({
      actual: SEP,
      tienePresupuestoDeGasto: true,
      ventanaAbierta: false,
      hayMesCerrado: true,
    });
    expect(d.estado).toBe("actual");
    expect(d.etiqueta).toBeNull();
  });
});

describe("ventana vencida SIN presupuesto: no nos quedamos en el mes anterior", () => {
  it("muestra el mes real incompleto y lo avisa", () => {
    const d = decidirPeriodoIndicadores({
      actual: SEP,
      tienePresupuestoDeGasto: false,
      ventanaAbierta: false, // día 6+
      hayMesCerrado: true,
    });
    expect(d.periodo).toEqual(SEP);
    expect(d.estado).toBe("actual_incompleto");
    expect(d.etiqueta).toContain("configurá tus sobres");
  });
});

describe("bordes", () => {
  it("cuenta nueva sin mes previo: no hay a dónde caer, se muestra el mes real avisado", () => {
    const d = decidirPeriodoIndicadores({
      actual: SEP,
      tienePresupuestoDeGasto: false,
      ventanaAbierta: true,
      hayMesCerrado: false,
    });
    expect(d.periodo).toEqual(SEP);
    expect(d.estado).toBe("actual_incompleto");
  });

  it("enero cae a diciembre del año anterior", () => {
    expect(mesAnterior({ year: 2027, month: 1 })).toEqual({ year: 2026, month: 12 });
    const d = decidirPeriodoIndicadores({
      actual: { year: 2027, month: 1 },
      tienePresupuestoDeGasto: false,
      ventanaAbierta: true,
      hayMesCerrado: true,
    });
    expect(d.periodo).toEqual({ year: 2026, month: 12 });
    expect(d.etiqueta).toBe("según diciembre — enero aún sin presupuesto");
  });

  it("la etiqueta nombra los dos meses: es lo que copian la UI y el asesor", () => {
    // Si esto cambia de forma, hay que revisar el fact del system-prompt que la
    // antepone a las cifras.
    const d = decidirPeriodoIndicadores({
      actual: { year: 2026, month: 3 },
      tienePresupuestoDeGasto: false,
      ventanaAbierta: true,
      hayMesCerrado: true,
    });
    expect(d.etiqueta).toBe("según febrero — marzo aún sin presupuesto");
  });
});
