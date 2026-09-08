/**
 * Motor de "Mis acciones" — PURO, sin IO.
 *
 * Toma lo que los motores ya calcularon (diagnóstico de control, decisión del excedente,
 * insights, fondos de defensa) y produce UN plan: la próxima mejor acción, hasta tres más,
 * lo bloqueado con su razón, la etapa del camino y una nota que explica el orden.
 *
 * Cuatro invariantes que este archivo hace cumplir:
 *
 *  1. Ninguna cifra nace acá. Todo número entra por `input`, ya calculado y ya en la moneda de
 *     display. Este motor formatea y ordena; no estima.
 *  2. Sin impacto medido, no hay acción. Un generador que no puede decir cuánto (monto, meses,
 *     porcentaje o la brecha con su dato) devuelve nada. «Ahorrá más» no es una acción.
 *  3. La prioridad REORDENA y cambia el tono; no cambia las reglas. La regla del 12%
 *     (`expensiveDebts`, que el servicio filtra con DEBT_INVEST_THRESHOLD), la precondición
 *     `fundsCovered` y el bloqueo de lo que implica invertir se aplican igual con las cuatro
 *     prioridades. Con «Hacer crecer» y una tarjeta al 24%, la NOTA explica por qué liquidarla
 *     es hoy su mejor inversión — y el aporte sigue bloqueado.
 *  4. La app informa, no ordena. El plan ofrece; la persona decide (y su decisión vive en
 *     `states`, que este motor respeta).
 *
 * Por qué `compararAbono` se INYECTA en vez de importar `compareExtra`: mantener el motor sin
 * dependencias de servicios lo deja testeable y liviano. El cálculo sigue siendo el de la
 * amortización real — el servicio ata `compareExtra` con la deuda cara antes de llamar acá.
 */
import { formatMoney } from "@/lib/format";
// Puro y sin IO por contrato propio (ver la cabecera de ese archivo): la acción sugerida por
// tipo de insight es función del `kind`, y acá se necesita su `route`. Importarlo directo evita
// arrastrar el barrel de insights (que sí es "server-only") a un motor puro.
import { suggestedAction } from "@/lib/insights/actions";
import type { Insight, InsightKind } from "@/lib/insights";
import type { ControlDiagnosis, Debt, SavingsGoal } from "@/modules/control";
import type { DefenseFundsReport, SurplusDecisionReport } from "@/modules/wealth";
import type {
  Action,
  ActionImpact,
  ActionKind,
  ActionPlan,
  ActionPriority,
  ActionSource,
  ActionState,
  ExpensiveDebt,
  Stage,
} from "@/modules/actions/types";

// ── Pesos ───────────────────────────────────────────────────────────────────
//
// La prioridad elegida sube su dominio y baja los demás, pero NUNCA a cero: una deuda al 24%
// sigue pesando aunque la persona haya elegido «Hacer crecer». Eso es lo que hace que el orden
// cambie sin que cambien las reglas.
const PESO_BASE: Record<ActionKind, Record<ActionPriority, number>> = {
  deuda: { deudas: 100, orden: 70, proteger: 62, crecer: 78 },
  orden: { deudas: 72, orden: 100, proteger: 70, crecer: 58 },
  proteger: { deudas: 78, orden: 74, proteger: 100, crecer: 66 },
  crecer: { deudas: 40, orden: 44, proteger: 42, crecer: 100 },
};

/**
 * Bono por fuente: una decisión ESTRUCTURAL (a dónde va todo el sobrante del mes, cerrar el
 * fondo de defensa) pesa más que una observación puntual de la campana del mismo dominio.
 */
const BONO_FUENTE: Record<ActionSource, number> = {
  surplus: 12,
  defense: 10,
  control: 4,
  insight: 0,
  wealth: 0,
};

function pesos(kind: ActionKind, source: ActionSource): Record<ActionPriority, number> {
  const base = PESO_BASE[kind];
  const bono = BONO_FUENTE[source];
  return {
    deudas: base.deudas + bono,
    orden: base.orden + bono,
    proteger: base.proteger + bono,
    crecer: base.crecer + bono,
  };
}

// ── Derivación de la prioridad ──────────────────────────────────────────────

/**
 * Sinónimos del ranking `priorities` del onboarding → prioridad de acciones. El wizard guarda
 * frases; acá solo se busca la raíz. Sin coincidencia, 'orden': ordenar el mes es lo que
 * cualquiera puede hacer primero.
 */
const SINONIMOS: { re: RegExp; priority: ActionPriority }[] = [
  { re: /deuda|tarjeta|pr[eé]stamo/i, priority: "deudas" },
  { re: /orden|presupuesto|control|gast/i, priority: "orden" },
  { re: /proteg|seguridad|fondo|emergencia|respaldo/i, priority: "proteger" },
  { re: /invertir|invers|crecer|patrimonio|libertad/i, priority: "crecer" },
];

/**
 * Prioridad efectiva: la declarada gana; si no hay, se deriva de `priorities[0]` del perfil.
 * Se exporta porque la usan tanto el servicio (para el plan) como la UI (para preseleccionar).
 */
export function resolveActionPriority(
  stored: ActionPriority | null | undefined,
  priorities: string[] | undefined,
): ActionPriority {
  if (stored) return stored;
  const primera = priorities?.[0];
  if (primera) {
    for (const s of SINONIMOS) if (s.re.test(primera)) return s.priority;
  }
  return "orden";
}

// ── Utilidades de fecha y formato ───────────────────────────────────────────

const MESES = [
  "enero",
  "febrero",
  "marzo",
  "abril",
  "mayo",
  "junio",
  "julio",
  "agosto",
  "setiembre",
  "octubre",
  "noviembre",
  "diciembre",
] as const;

function nombreMes(iso: string): string {
  const m = Number(iso.slice(5, 7));
  return MESES[m - 1] ?? "este mes";
}

/** 'YYYY-MM' — el período al que pertenece una decisión mensual. */
function periodo(iso: string): string {
  return iso.slice(0, 7);
}

/** Fecha larga en es-CR sin depender de Intl con zona (la ISO ya viene en la zona del perfil). */
function fechaLarga(iso: string): string {
  const d = Number(iso.slice(8, 10));
  return `${d} de ${nombreMes(iso)}`;
}

/**
 * Fecha con AÑO. La liquidación de una deuda cae a años vista: «1 de marzo» sin el año no dice
 * nada — y peor, se lee como si fuera este año.
 */
function fechaLargaConAno(iso: string): string {
  return `${fechaLarga(iso)} de ${iso.slice(0, 4)}`;
}

/** Primer día del mes siguiente (ISO): la próxima revisión del plan. */
function proximaRevision(today: string): string {
  const y = Number(today.slice(0, 4));
  const m = Number(today.slice(5, 7));
  const ny = m === 12 ? y + 1 : y;
  const nm = m === 12 ? 1 : m + 1;
  return `${ny}-${String(nm).padStart(2, "0")}-01`;
}

// ── Entrada del motor ───────────────────────────────────────────────────────

export type ActionEngineInput = {
  diagnosis: ControlDiagnosis;
  goals: SavingsGoal[];
  /** Deudas en moneda de display, con saldo VIVO (el servicio ya convirtió). */
  debts: Debt[];
  /** Deudas por encima del umbral del 12%, de mayor a menor TAE. Las filtra el servicio. */
  expensiveDebts: ExpensiveDebt[];
  surplus: SurplusDecisionReport;
  insights: Insight[];
  funds: DefenseFundsReport;
  /** Flujo libre mensual (moneda de display). Etapa 1 del camino. */
  freeCashflow: number;
  /** Cuántas posiciones cotizadas tienen aporte recurrente > 0. Etapa 4 del camino. */
  recurringHoldings: number;
  /** Ranking `priorities` del onboarding (para derivar la prioridad si no hay declarada). */
  priorities: string[];
  states: ActionState[];
  currency: string;
  /** Hoy en la zona del perfil (ISO). */
  today: string;
  /** compareExtra ya atado a la deuda cara por el servicio. */
  compararAbono?: (extraMensual: number) => { interestSaved: number; monthsSaved: number } | null;
  /** Fecha de liquidación proyectada de la deuda cara, si el servicio la pudo calcular. */
  payoffDate?: string | null;
};

// ── Generadores ─────────────────────────────────────────────────────────────
//
// Uno por fuente. Cada uno devuelve Action[] CON impacto, o nada.

/** Fondos de defensa (F1) y decisión del excedente (F3). La precondición manda el orden. */
function generarExcedente(input: ActionEngineInput): Action[] {
  const { funds, surplus, currency } = input;
  const c = (n: number) => formatMoney(n, currency);

  // Precondición: sin fondos cubiertos NO hay comparación de excedente. Lo que corresponde es
  // cerrar la brecha del fondo activo — y la brecha ES el impacto.
  if (!surplus.fundsCovered) {
    const esPaz = funds.activeFund === "peace";
    const fondo = esPaz ? funds.peace : funds.emergency;
    if (fondo.gap <= 0) return [];
    const nombre = esPaz ? "paz" : "emergencia";
    const cuota =
      fondo.recommendedMonthly > 0
        ? ` Apartando ${c(fondo.recommendedMonthly)}/mes lo cerrás en ${funds.horizonMonths} meses.`
        : "";
    return [
      {
        key: `defense:proteger:fondo_${esPaz ? "paz" : "emergencia"}`,
        kind: "proteger",
        source: "defense",
        title: `Completá tu fondo de ${nombre}`,
        why: `Llevás ${c(fondo.current)} de ${c(fondo.target)}.${cuota}`,
        impact: {
          kind: "brecha",
          value: fondo.gap,
          currency,
          label: `Brecha de ${c(fondo.gap)}`,
        },
        effort: "Definir un aporte mensual",
        route: "/patrimonio/proteccion",
        teach: esPaz
          ? `El fondo de **paz** cubre ${funds.peace.months} meses de tus gastos esenciales: es lo que te deja decidir sin apuro si perdés el ingreso. Va después del de emergencia y antes de invertir, porque sin colchón la primera emergencia te saca del mercado en el peor momento.`
          : "El fondo de **emergencia** es la primera red: cubre el imprevisto chico sin que termine en la tarjeta. Mientras no esté, cada gasto inesperado se convierte en deuda cara — por eso va antes que cualquier aporte.",
        weights: pesos("proteger", "defense"),
      },
    ];
  }

  // Con fondos cubiertos y sobrante: a dónde va el sobrante del mes. El impacto es el interés
  // que NO se paga, calculado por la amortización real (viene dentro de `surplus.pay`).
  if (surplus.monthlySurplus <= 0 || !surplus.debtName || !surplus.pay) return [];
  const { interestSaved, monthsSaved } = surplus.pay;
  if (interestSaved <= 0) return [];
  const tasa = surplus.apr != null ? `${Math.round(surplus.apr * 100)}%` : null;
  return [
    {
      key: `surplus:deuda:${periodo(input.today)}`,
      kind: "deuda",
      source: "surplus",
      title: `Dirigí el sobrante de ${nombreMes(input.today)} a ${surplus.debtName}`,
      why: `Con ${c(surplus.monthlySurplus)}/mes de sobrante la liquidás ${monthsSaved} meses antes${
        tasa ? `, y a ${tasa} ese ahorro es garantizado` : ""
      }.`,
      impact: {
        kind: "monto",
        value: interestSaved,
        currency,
        label: `${c(interestSaved)} de interés que no pagás`,
      },
      effort: "Una transferencia",
      route: "/deudas",
      teach: surplus.gated
        ? `**La regla del 12%.** Arriba de esa tasa, abonar la deuda es un retorno *garantizado* que ningún activo supera con certeza${
            tasa ? ` — la tuya está al ${tasa}` : ""
          }. Por eso acá no se plantea invertir: no es prudencia, es aritmética.`
        : "Debajo del 12% la comparación es legítima: abonar da certeza, invertir da un rango con su peor caso. La pestaña **Decisiones** muestra los dos lados con la caída máxima histórica a la vista.",
      weights: pesos("deuda", "surplus"),
    },
  ];
}

/** Recomendaciones del Motor de Prioridad sobre los objetivos (pausar / reducir / convertir). */
function generarControl(input: ActionEngineInput): Action[] {
  const { diagnosis, goals, currency, compararAbono, expensiveDebts } = input;
  const c = (n: number) => formatMoney(n, currency);
  const cara = expensiveDebts[0] ?? null;
  const out: Action[] = [];

  for (const rec of diagnosis.goalRecs) {
    if (rec.action !== "pausar" && rec.action !== "reducir" && rec.action !== "convertir") continue;
    const goal = goals.find((g) => g.id === rec.goalId);
    const aporte = goal?.monthlyContribution ?? 0;

    if (rec.action === "pausar") {
      // El impacto de pausar es el interés que ese aporte evita si va a la deuda cara. Sin
      // deuda cara no hay cifra que sostenga la acción, así que la acción no existe.
      if (!cara || !compararAbono || aporte <= 0) continue;
      const cmp = compararAbono(aporte);
      if (!cmp || cmp.interestSaved <= 0) continue;
      out.push({
        key: `control:deuda:${rec.goalId}`,
        kind: "deuda",
        source: "control",
        title: `Pausá "${rec.goalName}" y mandá su aporte a ${cara.name}`,
        why: `${rec.reason} Los ${c(aporte)}/mes de este objetivo adelantan la liquidación ${cmp.monthsSaved} meses.`,
        impact: {
          kind: "monto",
          value: cmp.interestSaved,
          currency,
          label: `${c(cmp.interestSaved)} de interés que no pagás`,
        },
        effort: "Una decisión",
        route: "/control-financiero",
        teach: `Pausar no es renunciar: es cambiar el orden. Mientras ${cara.name} corre al ${cara.apr}%, cada colón que va al objetivo rinde menos que el que va a la deuda. Cuando la deuda salga, el aporte vuelve — con más margen que hoy.`,
        weights: pesos("deuda", "control"),
      });
      continue;
    }

    if (rec.action === "reducir") {
      const requerido = rec.requiredMonthly ?? 0;
      const liberado = Math.max(0, aporte - requerido);
      if (liberado <= 0) continue;
      out.push({
        key: `control:orden:${rec.goalId}`,
        kind: "orden",
        source: "control",
        title: `Bajá el aporte de "${rec.goalName}"`,
        why: `${rec.reason} Con ${c(requerido)}/mes llega igual a la fecha.`,
        impact: {
          kind: "monto",
          value: liberado,
          currency,
          label: `${c(liberado)}/mes liberados`,
        },
        effort: "2 minutos",
        route: "/control-financiero",
        teach:
          "Un objetivo que va sobrado inmoviliza flujo que hoy hace falta en otro lado. Bajarlo al aporte que la fecha realmente pide no atrasa nada: solo deja de reservar de más.",
        weights: pesos("orden", "control"),
      });
      continue;
    }

    // convertir: el aporte que hoy duerme en efectivo con un horizonte largo.
    if (aporte <= 0) continue;
    out.push({
      key: `control:crecer:${rec.goalId}`,
      kind: "crecer",
      source: "control",
      title: `Evaluá "${rec.goalName}" como inversión`,
      why: `${rec.reason} Hoy son ${c(aporte)}/mes en efectivo.`,
      impact: {
        kind: "monto",
        value: aporte,
        currency,
        label: `${c(aporte)}/mes hoy en efectivo`,
      },
      effort: "Una decisión",
      route: "/patrimonio",
      teach:
        "A más de cinco años, el efectivo pierde contra la inflación con bastante certeza, mientras que un portafolio diversificado históricamente la superó — con caídas por el camino. Es un cambio de riesgo, no una mejora garantizada: la decisión depende de tu tolerancia.",
      weights: pesos("crecer", "control"),
    });
  }

  return out;
}

/** Kinds de la campana que SÍ son acciones, con el dominio al que pertenecen. */
const INSIGHT_KIND: Partial<Record<InsightKind, ActionKind>> = {
  sobre_sobregirado: "orden",
  ritmo_sobre: "orden",
  sobre_ocioso: "orden",
  deuda_cara: "deuda",
  deuda_creciendo: "deuda",
  fondo_emergencia: "proteger",
  fondo_paz: "proteger",
  concentracion_inversion: "crecer",
  rendimiento_bajo_inflacion: "crecer",
};

/** Esfuerzo y didáctica por kind: lo que hay que hacer, y por qué esto antes que otra cosa. */
const INSIGHT_TEACH: Partial<Record<InsightKind, { effort: string; teach: string }>> = {
  sobre_sobregirado: {
    effort: "5 minutos",
    teach:
      "Un sobre pasado no se arregla gastando menos «en general»: se arregla moviendo presupuesto desde un sobre con holgura, o bajando el ritmo de éste. Lo que no se decide, lo decide el saldo a fin de mes.",
  },
  ritmo_sobre: {
    effort: "2 minutos",
    teach:
      "Todavía no te pasaste: vas más rápido que el calendario. Verlo a mitad de mes es lo que permite corregir sin recortar de golpe.",
  },
  sobre_ocioso: {
    effort: "2 minutos",
    teach:
      "Presupuesto reservado que no se usa no es ahorro: es plata inmovilizada que le falta a otro sobre. A veces es a propósito — por eso esto se propone, no se aplica solo.",
  },
  deuda_cara: {
    effort: "Una decisión",
    teach:
      "La tasa manda. Cada colón abonado a la deuda más cara rinde exactamente esa tasa, garantizado y sin riesgo de mercado. Es el único «rendimiento» que la app puede prometer.",
  },
  deuda_creciendo: {
    effort: "Ponerse al día",
    teach:
      "El atraso es lo primero: mientras corre, se suman intereses y cargos sobre una deuda que ya era cara, y el historial crediticio también lo registra.",
  },
  fondo_emergencia: {
    effort: "Definir un aporte",
    teach:
      "Sin colchón, cada imprevisto se convierte en deuda cara. Por eso el fondo va antes que invertir: no es rendimiento, es lo que evita el retroceso.",
  },
  fondo_paz: {
    effort: "Definir un aporte",
    teach:
      "El fondo de paz compra tiempo para decidir sin apuro si el ingreso se corta. Va después del de emergencia y antes del mercado.",
  },
  concentracion_inversion: {
    effort: "Revisar la distribución",
    teach:
      "Concentrar no es invertir mal, pero ata tu patrimonio a un solo resultado. Diversificar reduce ese riesgo específico sin cambiar el plan de largo plazo.",
  },
  rendimiento_bajo_inflacion: {
    effort: "Revisar la composición",
    teach:
      "Rendir menos que la inflación es perder poder de compra con el dinero adentro. Un año no define nada; una tendencia sí pide revisar la composición.",
  },
};

/** Impacto de un insight a partir de su `metric` (que cada detector documenta). */
function impactoInsight(
  ins: Insight,
  currency: string,
  funds: DefenseFundsReport,
): ActionImpact | null {
  const c = (n: number) => formatMoney(n, currency);
  const m = ins.metric;
  switch (ins.kind) {
    case "sobre_sobregirado":
      return m == null
        ? null
        : { kind: "monto", value: m, currency, label: `${c(m)} por encima del sobre` };
    case "ritmo_sobre":
      return m == null
        ? null
        : { kind: "monto", value: m, currency, label: `Proyección de ${c(m)} al cierre` };
    case "sobre_ocioso":
      return m == null
        ? null
        : { kind: "monto", value: m, currency, label: `${c(m)}/mes inmovilizados` };
    case "deuda_cara":
      return m == null
        ? null
        : { kind: "porcentaje", value: m, label: `${m}% anual sobre el saldo` };
    case "deuda_creciendo":
      return m == null ? null : { kind: "monto", value: m, currency, label: `${c(m)} con atraso` };
    case "fondo_emergencia":
      return m == null ? null : { kind: "brecha", value: m, currency, label: `Brecha de ${c(m)}` };
    // El detector del fondo de paz no publica `metric`: la brecha sale del mismo reporte de
    // fondos con el que se dimensionó el insight.
    case "fondo_paz":
      return funds.peace.gap > 0
        ? {
            kind: "brecha",
            value: funds.peace.gap,
            currency,
            label: `Brecha de ${c(funds.peace.gap)}`,
          }
        : null;
    case "concentracion_inversion":
      return m == null
        ? null
        : { kind: "porcentaje", value: m, label: `${m}% en una sola posición` };
    case "rendimiento_bajo_inflacion":
      return m == null
        ? null
        : { kind: "porcentaje", value: m, label: `${m}% anual, bajo la inflación` };
    default:
      return null;
  }
}

/**
 * Insights accionables → acciones. Los kinds del RITMO del mes (ventana_presupuesto,
 * cierre_mes, registro_diario) y todo lo 'celebrar' quedan fuera a propósito: son recordatorios
 * del ciclo o felicitaciones, no decisiones con impacto.
 */
function generarInsights(input: ActionEngineInput, fondoYaPropuesto: boolean): Action[] {
  const { insights, currency, funds } = input;
  const out: Action[] = [];
  for (const ins of insights) {
    if (ins.severity === "celebrar") continue;
    const kind = INSIGHT_KIND[ins.kind];
    if (!kind) continue;
    // El generador de fondos ya emitió la acción del fondo activo, con las mismas cifras.
    if (fondoYaPropuesto && (ins.kind === "fondo_emergencia" || ins.kind === "fondo_paz")) continue;
    const impact = impactoInsight(ins, currency, funds);
    if (!impact) continue; // sin impacto medido, no hay acción
    const sugerida = suggestedAction(ins.kind);
    if (!sugerida) continue;
    const extra = INSIGHT_TEACH[ins.kind];
    out.push({
      key: `insight:${kind}:${ins.relatedId ?? ins.kind}`,
      kind,
      source: "insight",
      title: ins.title,
      why: ins.body,
      impact,
      effort: extra?.effort ?? "Unos minutos",
      route: sugerida.route,
      teach: extra?.teach ?? `Lo que se puede hacer: ${sugerida.label}.`,
      relatedInsightId: ins.id,
      weights: pesos(kind, "insight"),
    });
  }
  return out;
}

// ── Bloqueo (barandas), estado y orden ──────────────────────────────────────

/**
 * Bloquea lo que implica invertir mientras exista deuda cara o falten los fondos. Esto NO
 * depende de la prioridad elegida: es la misma baranda con «Salir de deudas» y con «Hacer
 * crecer» — lo único que cambia con la prioridad es la nota que lo explica.
 */
function aplicarBarandas(acciones: Action[], input: ActionEngineInput): Action[] {
  const cara = input.expensiveDebts[0] ?? null;
  return acciones.map((a) => {
    if (a.kind !== "crecer") return a;
    if (cara) {
      return {
        ...a,
        locked: true,
        lockReason: `Se desbloquea cuando ${cara.name} esté liquidada (regla del 12%)`,
      };
    }
    if (!input.surplus.fundsCovered) {
      return {
        ...a,
        locked: true,
        lockReason: "Se desbloquea al completar tus fondos de defensa",
      };
    }
    return a;
  });
}

/** Monto comparable (moneda de display) para desempatar. Lo que no es dinero no desempata. */
function montoDe(a: Action): number {
  return a.impact.kind === "monto" || a.impact.kind === "brecha" ? (a.impact.value ?? 0) : 0;
}

export function buildActionPlan(input: ActionEngineInput, priority: ActionPriority): ActionPlan {
  const estados = new Map(input.states.map((s) => [s.actionKey, s]));
  const mesActual = periodo(input.today);

  const excedente = generarExcedente(input);
  // Si el generador del excedente ya propuso cerrar un fondo, el insight del mismo fondo sería
  // la misma frase dos veces (mismas cifras, misma fuente).
  const fondoYaPropuesto = excedente.some((a) => a.source === "defense");
  const brutas = [
    ...excedente,
    ...generarControl(input),
    ...generarInsights(input, fondoYaPropuesto),
  ];

  // Una acción por clave: si dos fuentes describen el mismo hecho, gana la de más peso.
  const porClave = new Map<string, Action>();
  for (const a of brutas) {
    const previa = porClave.get(a.key);
    if (!previa || a.weights[priority] > previa.weights[priority]) porClave.set(a.key, a);
  }

  const conBarandas = aplicarBarandas([...porClave.values()], input);

  // Estado de la persona. 'hecha' de ESTE período y 'descartada' desaparecen; 'pospuesta'
  // vigente se muestra abajo, con la fecha (que es una promesa que la app le hizo).
  const vivas: Action[] = [];
  for (const a of conBarandas) {
    const st = estados.get(a.key);
    if (!st) {
      vivas.push(a);
      continue;
    }
    if (st.status === "descartada") continue;
    if (st.status === "hecha" && periodo(st.updatedAt) === mesActual) continue;
    if (st.status === "pospuesta" && st.snoozeUntil && st.snoozeUntil > input.today) {
      vivas.push({
        ...a,
        locked: true,
        lockReason: `Pospuesta hasta el ${fechaLarga(st.snoozeUntil)}`,
      });
      continue;
    }
    vivas.push(a);
  }

  const ordenadas = [...vivas].sort(
    (a, b) =>
      b.weights[priority] - a.weights[priority] ||
      montoDe(b) - montoDe(a) ||
      a.key.localeCompare(b.key),
  );

  const libres = ordenadas.filter((a) => !a.locked);
  const bloqueadas = ordenadas.filter((a) => a.locked);

  const hero = libres[0] ?? null;
  const now = libres.slice(1, 4); // máximo 3, siempre
  const later = [...libres.slice(4), ...bloqueadas];

  const stage = buildStage(input);
  const cara = input.expensiveDebts[0] ?? null;

  return {
    priority,
    note: buildNote(input, priority),
    hero,
    now,
    later,
    stage,
    inputs: {
      surplus: input.surplus.monthlySurplus,
      expensiveDebt: cara,
      fundsCovered: input.surplus.fundsCovered,
      activeGoals: input.goals.length,
      nextReview: proximaRevision(input.today),
    },
    currency: input.currency,
  };
}

// ── Etapa del camino ────────────────────────────────────────────────────────

const ETAPAS: { level: Stage["level"]; label: string }[] = [
  { level: 1, label: "Estabilidad" },
  { level: 2, label: "Protección mínima" },
  { level: 3, label: "Sin deuda cara" },
  { level: 4, label: "Crecimiento inicial" },
  { level: 5, label: "Crecimiento estructurado" },
];

/** Las cinco etiquetas, para pintar el stepper completo sin duplicar la lista en la UI. */
export const STAGE_LABELS = ETAPAS.map((e) => e.label);

/**
 * La etapa ACTUAL es la primera que falla. Cada blocker lleva su dato: «Falta: …» sin cifra
 * es exactamente la clase de frase que este módulo existe para no escribir.
 */
export function buildStage(input: ActionEngineInput): Stage {
  const c = (n: number) => formatMoney(n, input.currency);

  // 1 · Estabilidad
  if (!(input.freeCashflow > 0)) {
    return {
      ...ETAPAS[0]!,
      blockers: [`Falta: tu flujo libre es ${c(input.freeCashflow)}/mes`],
    };
  }
  // 2 · Protección mínima
  if (input.funds.activeFund !== "done") {
    const esPaz = input.funds.activeFund === "peace";
    const f = esPaz ? input.funds.peace : input.funds.emergency;
    return {
      ...ETAPAS[1]!,
      blockers: [`Falta: fondo de ${esPaz ? "paz" : "emergencia"} · ${c(f.gap)} por cerrar`],
    };
  }
  // 3 · Sin deuda cara
  if (input.expensiveDebts.length > 0) {
    return {
      ...ETAPAS[2]!,
      blockers: input.expensiveDebts.map((d) => `Falta: ${d.name} · ${c(d.balance)} al ${d.apr}%`),
    };
  }
  // 4 · Crecimiento inicial
  if (input.recurringHoldings <= 0) {
    return {
      ...ETAPAS[3]!,
      blockers: ["Falta: ningún aporte mensual automático a una posición cotizada"],
    };
  }
  // 5 · Crecimiento estructurado
  const conc = input.insights.find((i) => i.kind === "concentracion_inversion");
  if (conc) {
    return {
      ...ETAPAS[4]!,
      blockers: [
        `Falta: ${conc.metric != null ? `${conc.metric}% del portafolio en una sola posición` : conc.title}`,
      ],
    };
  }
  return { ...ETAPAS[4]!, blockers: [] };
}

// ── La nota: qué significa esta prioridad HOY, con datos ────────────────────

/**
 * Una frase por prioridad, plantilla determinista sobre datos reales. No es un texto de modelo
 * y no cambia ninguna regla: explica el orden que las reglas produjeron.
 */
export function buildNote(input: ActionEngineInput, priority: ActionPriority): string {
  const c = (n: number) => formatMoney(n, input.currency);
  const cara = input.expensiveDebts[0] ?? null;
  const { surplus, funds } = input;
  const liquidacion = input.payoffDate
    ? ` Hoy la liquidás el ${fechaLargaConAno(input.payoffDate)}.`
    : "";

  if (priority === "deudas") {
    if (cara && surplus.pay && surplus.monthlySurplus > 0) {
      return `Todo lo extra va a ${cara.name}: ${c(surplus.monthlySurplus)}/mes te ahorran ${c(surplus.pay.interestSaved)} de interés y la sacan ${surplus.pay.monthsSaved} meses antes.${liquidacion}`;
    }
    if (cara) {
      return `${cara.name} corre al ${cara.apr}% sobre ${c(cara.balance)}: es la tasa más alta que pagás y por eso encabeza el orden.${liquidacion}`;
    }
    return "No tenés deuda cara: lo extra rinde más en tus fondos y objetivos que en un abono adicional.";
  }

  if (priority === "orden") {
    const desorden = input.insights.filter(
      (i) => INSIGHT_KIND[i.kind] === "orden" && i.severity !== "celebrar",
    ).length;
    if (desorden > 0) {
      return `Primero el mes: ${desorden} ${desorden === 1 ? "sobre está" : "sobres están"} fuera de ritmo. Ordenar el mes es lo que libera el flujo con el que se paga todo lo demás.`;
    }
    return `El mes va en ritmo y te sobran ${c(surplus.monthlySurplus)}/mes. Con el presupuesto bajo control, lo que sigue es decidir a dónde va ese sobrante.`;
  }

  if (priority === "proteger") {
    if (funds.activeFund !== "done") {
      const esPaz = funds.activeFund === "peace";
      const f = esPaz ? funds.peace : funds.emergency;
      return `Tu red primero: te faltan ${c(f.gap)} para completar el fondo de ${esPaz ? "paz" : "emergencia"}. Sin colchón, el próximo imprevisto se convierte en deuda cara.`;
    }
    return `Tus fondos de defensa están cubiertos: la protección ya no es tu cuello de botella. El orden ahora lo marca ${cara ? `${cara.name} al ${cara.apr}%` : "el destino de tu sobrante"}.`;
  }

  // 'crecer'
  if (cara) {
    return `Liquidar ${cara.name} ES hoy tu mejor inversión: ${cara.apr}% garantizado, sin riesgo de mercado, contra un rango histórico que nadie te firma. Por eso el aporte sigue bloqueado hasta saldarla.`;
  }
  if (!surplus.fundsCovered) {
    const f = funds.activeFund === "peace" ? funds.peace : funds.emergency;
    return `Antes del mercado, el colchón: te faltan ${c(f.gap)} de fondo de defensa. Sin él, la primera emergencia te obliga a vender justo cuando no conviene.`;
  }
  return `Sin deuda cara y con los fondos cubiertos, ${c(surplus.monthlySurplus)}/mes pueden ir al mercado. Lo que verás es un rango con su peor caso, no una promesa.`;
}
