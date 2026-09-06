/**
 * QUÉ MES describen los indicadores (score de salud, DTI, tasa de ahorro) — motor puro.
 *
 * El presupuesto de un mes no nace completo: las líneas DERIVADAS (aportes a
 * metas, pagos de deuda, primas) se regeneran solas al cargar, pero los sobres
 * MANUALES los pone la persona durante la ventana de los días 1-5. Las fuentes
 * de ingreso recurrentes sí se materializan solas (`ensureRecurringIncome`).
 *
 * Esa asimetría es la trampa: con el ingreso completo y el gasto a medias, el
 * flujo libre se dispara y el score sale 100 "SÓLIDA" el día 2 de cada mes. Es
 * el mismo diagnóstico falsamente optimista que producían las tablas fósiles,
 * por una causa nueva.
 *
 * La salida NO es inventar gasto ni copiar sobres que nadie marcó como
 * recurrentes: es decir de qué mes se está hablando.
 *
 *   · El mes ya tiene presupuesto de gasto  → indicadores del mes, sin etiqueta.
 *   · Todavía no, y la ventana sigue abierta → indicadores del último mes CERRADO,
 *     etiquetados como tales en toda superficie (UI y contexto del asesor).
 *   · Todavía no, y la ventana ya venció     → indicadores del mes real, incompletos,
 *     con un aviso. No nos quedamos en el mes anterior para siempre.
 */

export type EstadoIndicadores = "actual" | "mes_cerrado" | "actual_incompleto";

export type PeriodoRef = { year: number; month: number };

export type DecisionIndicadores = {
  /** El periodo del que hay que calcular los indicadores. */
  periodo: PeriodoRef;
  estado: EstadoIndicadores;
  /**
   * Texto listo para mostrar y para inyectar en el contexto del asesor. `null`
   * cuando los indicadores son del mes en curso y están completos.
   *
   * Viaja con el dato a propósito: si la etiqueta viviera solo en la UI, el chat
   * afirmaría las cifras del mes anterior como si fueran de este.
   */
  etiqueta: string | null;
};

const MESES = [
  "enero",
  "febrero",
  "marzo",
  "abril",
  "mayo",
  "junio",
  "julio",
  "agosto",
  "septiembre",
  "octubre",
  "noviembre",
  "diciembre",
];

export function nombreMes(month: number): string {
  return MESES[month - 1] ?? "";
}

export function mesAnterior(p: PeriodoRef): PeriodoRef {
  return p.month === 1 ? { year: p.year - 1, month: 12 } : { year: p.year, month: p.month - 1 };
}

/**
 * @param actual          periodo en curso (zona del perfil)
 * @param tienePresupuestoDeGasto  ¿hay al menos un sobre MANUAL con monto este mes?
 *   Manual y no cualquiera: las derivadas se regeneran solas, así que contarlas
 *   haría que la condición fuese siempre verdadera y el corte nunca actuara.
 * @param ventanaAbierta  ¿sigue abierta la ventana de ajuste de sobres (días 1-5)?
 * @param hayMesCerrado   ¿existe un mes anterior del que se pueda hablar?
 */
export function decidirPeriodoIndicadores(args: {
  actual: PeriodoRef;
  tienePresupuestoDeGasto: boolean;
  ventanaAbierta: boolean;
  hayMesCerrado: boolean;
}): DecisionIndicadores {
  const { actual, tienePresupuestoDeGasto, ventanaAbierta, hayMesCerrado } = args;

  // Corte de salida: en cuanto el mes tiene presupuesto de gasto —por el ritual,
  // por "Traer mis recurrentes" o a mano— los indicadores son de ESTE mes.
  if (tienePresupuestoDeGasto) {
    return { periodo: actual, estado: "actual", etiqueta: null };
  }

  if (ventanaAbierta && hayMesCerrado) {
    const previo = mesAnterior(actual);
    return {
      periodo: previo,
      estado: "mes_cerrado",
      etiqueta: `según ${nombreMes(previo.month)} — ${nombreMes(actual.month)} aún sin presupuesto`,
    };
  }

  // Ventana vencida sin presupuesto (o cuenta nueva sin mes previo): se muestra
  // el mes real, incompleto, y se dice. Quedarse en el mes anterior para siempre
  // sería mentir con más elegancia.
  return {
    periodo: actual,
    estado: "actual_incompleto",
    etiqueta: `${nombreMes(actual.month)} aún sin presupuesto de gastos — configurá tus sobres para un score real`,
  };
}
