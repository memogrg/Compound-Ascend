/**
 * Motor de PROGRESO DERIVADO de los cuatro asistentes.
 *
 * Puro y sin I/O: recibe la proyección del estado real (`SetupSnapshot`) y
 * devuelve, para cada asistente, qué pasos están resueltos. No hay ninguna
 * bandera guardada — "Presupuesto 4/4" significa literalmente "hay ingresos,
 * hay sobres y hay montos", así que si borrás un ingreso en /ingresos el
 * asistente vuelve a 3/4 sin que nadie sincronice nada.
 *
 * ── PASOS OPCIONALES ────────────────────────────────────────────────────────
 * Algunos pasos admiten "no tengo" como respuesta legítima y verdadera: quien
 * no debe nada no tiene deudas que cargar, y quien todavía no invierte no tiene
 * posiciones. Marcarlos como requeridos dejaría a esa persona en "3/4 para
 * siempre" — atrapada por una configuración que ya está completa. Por eso el
 * conteo los incluye (el detalle es honesto) pero el estado "listo" solo mira
 * los REQUERIDOS. Guardar un "no tengo deudas" sería exactamente el estado
 * paralelo que este módulo se prohíbe.
 */
import { formatMoney } from "@/lib/format";
import type {
  SetupSnapshot,
  SetupStepStatus,
  SetupStatus,
  SetupWizardId,
  SetupWizardProgress,
} from "@/modules/setup/types";

/**
 * Los detalles del hub muestran plata, así que usan el MISMO formateador que el
 * resto del producto (`formatMoney`): un separador de miles propio de este motor
 * haría que la misma cifra se leyera distinta según la pantalla.
 */
function money(v: number, currency: string): string {
  return formatMoney(v, currency);
}

function plural(count: number, one: string, many: string): string {
  return `${count} ${count === 1 ? one : many}`;
}

function step(
  id: string,
  label: string,
  done: boolean,
  detail: string,
  optional = false,
): SetupStepStatus {
  return { id, label, done, optional, detail };
}

/** Pasos del asistente de PRESUPUESTO, derivados del estado real. */
export function presupuestoSteps(s: SetupSnapshot): SetupStepStatus[] {
  const sobres = s.sobres.filter((x) => x.isFavorite);
  const conMonto = sobres.filter((x) => (x.budget ?? 0) > 0);
  const ingresos = s.incomes.length;
  const listoBase = ingresos > 0 && sobres.length > 0 && conMonto.length > 0;
  return [
    step(
      "ingresos",
      "Ingresos",
      ingresos > 0,
      ingresos > 0
        ? `${plural(ingresos, "fuente", "fuentes")} · ${money(s.incomeMonthly, s.currency)}/mes`
        : "Sin fuentes de ingreso",
    ),
    step(
      "sobres",
      "Sobres",
      sobres.length > 0,
      sobres.length > 0 ? plural(sobres.length, "sobre activo", "sobres activos") : "Sin sobres",
    ),
    step(
      "montos",
      "Montos",
      conMonto.length > 0,
      conMonto.length > 0
        ? `${conMonto.length}/${sobres.length} con monto · ${money(s.budgetedMonthly, s.currency)}`
        : "Sin montos asignados",
    ),
    // El resumen no es una decisión nueva: se resuelve solo cuando las tres
    // anteriores están, y existe para que el usuario VEA su reparto y su libre.
    step(
      "resumen",
      "Resumen",
      listoBase,
      listoBase
        ? `Libre: ${money(Math.max(0, s.incomeMonthly - s.budgetedMonthly), s.currency)}`
        : "Se calcula al terminar",
    ),
  ];
}

/** Pasos del asistente de CONTROL (deudas + metas). */
export function controlSteps(s: SetupSnapshot): SetupStepStatus[] {
  const deuda = s.debts.reduce((t, d) => t + d.balance, 0);
  // Los fondos de defensa son savings_goals también, pero se configuran en su
  // propio asistente: aquí solo cuentan las metas de vida, para no contar doble.
  const metas = s.goals.filter((g) => !(g.goalType ?? "").startsWith("defensa:"));
  const aporte = metas.reduce((t, g) => t + g.monthlyContribution, 0);
  return [
    step(
      "deudas",
      "Deudas",
      s.debts.length > 0,
      s.debts.length > 0
        ? `${plural(s.debts.length, "deuda", "deudas")} · ${money(deuda, s.currency)}`
        : "Sin deudas cargadas",
      true,
    ),
    step(
      "metas",
      "Metas de ahorro",
      metas.length > 0,
      metas.length > 0
        ? `${plural(metas.length, "meta", "metas")} · ${money(aporte, s.currency)}/mes`
        : "Sin metas",
    ),
  ];
}

/** Pasos del asistente de DEFENSA (emergencia -> paz -> pólizas). */
export function defensaSteps(s: SetupSnapshot): SetupStepStatus[] {
  const em = s.emergency;
  const pz = s.peace;
  return [
    step(
      "emergencia",
      "Fondo de emergencia",
      Boolean(em?.registered),
      em
        ? em.covered
          ? `Cubierto · ${money(em.current, s.currency)}`
          : `${money(em.current, s.currency)} de ${money(em.target, s.currency)} · faltan ${money(em.gap, s.currency)}`
        : "Sin dimensionar",
    ),
    step(
      "paz",
      "Fondo de paz",
      Boolean(pz?.registered),
      pz
        ? pz.covered
          ? `Cubierto · ${pz.months} meses`
          : `${pz.months} meses · faltan ${money(pz.gap, s.currency)}`
        : "Sin dimensionar",
    ),
    step(
      "polizas",
      "Seguros",
      s.policies.length > 0,
      s.policies.length > 0 ? plural(s.policies.length, "póliza", "pólizas") : "Sin pólizas",
      true,
    ),
  ];
}

/** Pasos del asistente de CRECIMIENTO (inversiones -> DCA -> número de Libertad). */
export function crecimientoSteps(s: SetupSnapshot): SetupStepStatus[] {
  const dca = s.holdings.reduce((t, h) => t + h.monthlyContribution, 0);
  const conDca = s.holdings.filter((h) => h.monthlyContribution > 0).length;
  const life = s.desiredLifestyle;
  return [
    step(
      "inversiones",
      "Inversiones",
      s.holdings.length > 0,
      s.holdings.length > 0
        ? plural(s.holdings.length, "posición", "posiciones")
        : "Sin posiciones",
      true,
    ),
    step(
      "dca",
      "Aporte mensual",
      dca > 0,
      dca > 0
        ? `${money(dca, s.currency)}/mes en ${plural(conDca, "posición", "posiciones")}`
        : "Sin aporte recurrente",
      true,
    ),
    step(
      "libertad",
      "Estilo de vida deseado",
      Boolean(life && life.amount > 0),
      life && life.amount > 0 ? `${money(life.amount, s.currency)}/mes` : "Sin definir",
    ),
  ];
}

const META: Record<
  SetupWizardId,
  { title: string; purpose: string; icon: string; steps: (s: SetupSnapshot) => SetupStepStatus[] }
> = {
  presupuesto: {
    title: "Presupuesto",
    purpose: "Cuánto entra y a qué sobre va cada colón.",
    icon: "budget",
    steps: presupuestoSteps,
  },
  control: {
    title: "Control",
    purpose: "Tus deudas y tus metas de ahorro, con su aporte.",
    icon: "savings",
    steps: controlSteps,
  },
  defensa: {
    title: "Defensa",
    purpose: "Fondo de emergencia, fondo de paz y seguros.",
    icon: "defense",
    steps: defensaSteps,
  },
  crecimiento: {
    title: "Crecimiento",
    purpose: "Inversiones, aporte mensual y tu número de Libertad.",
    icon: "invest",
    steps: crecimientoSteps,
  },
};

export const SETUP_WIZARD_IDS: SetupWizardId[] = [
  "presupuesto",
  "control",
  "defensa",
  "crecimiento",
];

/** ¿Es `v` uno de los cuatro asistentes? (guarda de la ruta dinámica). */
export function isSetupWizardId(v: string): v is SetupWizardId {
  return (SETUP_WIZARD_IDS as string[]).includes(v);
}

function statusOf(steps: SetupStepStatus[]): SetupStatus {
  if (steps.every((x) => !x.done)) return "sin_empezar";
  // "Listo" mira solo los requeridos: ver la nota sobre pasos opcionales arriba.
  return steps.filter((x) => !x.optional).every((x) => x.done) ? "listo" : "en_curso";
}

/** Progreso de UN asistente, derivado del estado real. */
export function deriveWizardProgress(id: SetupWizardId, s: SetupSnapshot): SetupWizardProgress {
  const meta = META[id];
  const steps = meta.steps(s);
  const firstOpen = steps.findIndex((x) => !x.done);
  return {
    id,
    title: meta.title,
    purpose: meta.purpose,
    href: `/configurar/${id}`,
    mobileHref: `/m/configurar/${id}`,
    icon: meta.icon,
    steps,
    done: steps.filter((x) => x.done).length,
    total: steps.length,
    status: statusOf(steps),
    resumeIndex: firstOpen < 0 ? 0 : firstOpen,
  };
}

/** Progreso de los cuatro, en orden de recorrido. */
export function deriveSetupProgress(s: SetupSnapshot): SetupWizardProgress[] {
  return SETUP_WIZARD_IDS.map((id) => deriveWizardProgress(id, s));
}

/**
 * Resumen para el hub. `allReady` decide si la tarjeta se colapsa a un acceso
 * discreto — nunca desaparece: el asistente también sirve para MODIFICAR.
 */
export function setupOverall(progress: SetupWizardProgress[]): {
  done: number;
  total: number;
  allReady: boolean;
  next: SetupWizardProgress | null;
} {
  const done = progress.filter((p) => p.status === "listo").length;
  const next =
    progress.find((p) => p.status === "en_curso") ??
    progress.find((p) => p.status === "sin_empezar") ??
    null;
  return { done, total: progress.length, allReady: done === progress.length, next };
}
