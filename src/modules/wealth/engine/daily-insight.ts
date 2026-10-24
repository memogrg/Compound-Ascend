/**
 * Ritual diario patrimonial (puro, sin IO). Elige UN micro-insight del día a
 * partir del reporte patrimonial: si hay fragilidad, la de mayor prioridad como
 * microacción de 30s; si no, un mensaje aspiracional de progreso hacia el Número
 * de Libertad. Microcopy §13: aspiracional, nunca humillante.
 */
import { formatMoney } from "@/lib/format";
import type {
  PatrimonioReport,
  PatrimonioLevel,
  DiagnosisFlag,
} from "@/modules/wealth/engine/patrimonio-engine";
import type { DetectedInsight } from "@/lib/insights/types";
import type { ProtectionGap } from "@/modules/wealth/types";

/** Tipo (kind) fijo del insight del ritual diario. */
export const RITUAL_KIND = "ritual_patrimonio";

/**
 * Prioridad de las banderas de fragilidad (§15): lo más urgente primero. Si una
 * bandera no está aquí, va al final (no se pierde, pero cede ante las críticas).
 */
const FLAG_PRIORITY: string[] = [
  "patrimonio_neto_negativo",
  "deuda_mala_alta",
  "alta_tasa_baja_proteccion",
  "patrimonio_alto_baja_liquidez",
  "alto_gasto_vs_patrimonio",
  "alto_pero_poco_productivo",
  "alta_concentracion",
];

/** Copy aspiracional por bandera: título + microacción de 30s (nunca humillante). */
const ACTION_BY_FLAG: Record<string, { title: string; action: string }> = {
  patrimonio_neto_negativo: {
    title: "Tu primer paso: estabilizar la base",
    action: "Hoy en 30s: anota cuál es tu deuda más cara. El plan empieza por ahí.",
  },
  deuda_mala_alta: {
    title: "Libera flujo este mes",
    action: "Hoy en 30s: marca un abono extra (aunque sea pequeño) a tu deuda más cara.",
  },
  alta_tasa_baja_proteccion: {
    title: "Protege lo que estás construyendo",
    // La acción real la elige `accionDeProteccion` con las brechas de verdad; esta es el
    // respaldo de cuando no llegan (llamadores viejos).
    action: "Hoy en 30s: mirá qué te falta en tu tablero de protección.",
  },
  patrimonio_alto_baja_liquidez: {
    title: "Suma un poco de colchón",
    action: "Hoy en 30s: define cuánto líquido quieres tener disponible.",
  },
  alto_gasto_vs_patrimonio: {
    title: "Acerca tu libertad",
    action: "Hoy en 30s: elige un gasto que puedas ajustar este mes.",
  },
  alto_pero_poco_productivo: {
    title: "Pon tu dinero a trabajar",
    action: "Hoy en 30s: identifica un activo dormido que podrías invertir.",
  },
  alta_concentracion: {
    title: "Diversifica de a poco",
    action: "Hoy en 30s: anota una alternativa para repartir mejor tu patrimonio.",
  },
};

/**
 * Qué decirle a alguien cuya PROTECCIÓN está baja, según lo que de verdad le falta.
 *
 * `alta_tasa_baja_proteccion` son cinco casillas —tres seguros y los dos fondos de defensa— y la
 * microacción decía siempre «revisá tu fondo de emergencia». En la cuenta de demo eso apunta a lo
 * único que esa persona SÍ tiene: el fondo está cubierto y lo que falta son las tres pólizas.
 *
 * Los seguros van primero cuando faltan las dos cosas: un fondo de emergencia no cubre una
 * hospitalización, y el orden de `essentials` en `computeProtection` ya dice lo mismo.
 *
 * «Gastos médicos menores» queda fuera: está en `gaps` con severidad baja justamente porque NO
 * puntúa, así que mandar a comprarlo sería actuar sobre una casilla que no disparó nada.
 */
export function accionDeProteccion(gaps: ProtectionGap[]): string {
  const cuentan = gaps.filter((g) => g.severity !== "bajo");
  const seguros = cuentan.filter((g) => /^Seguro/i.test(g.type));
  if (seguros.length > 0) {
    const nombre = (seguros[0]?.type ?? "").replace(/^Seguro de\s*/i, "").toLowerCase();
    const resto = seguros.length - 1;
    const cola = resto > 0 ? ` (y ${resto} más)` : "";
    return `Hoy en 30s: mirá qué cubre tu seguro de ${nombre}${cola}, o anotá que no lo tenés.`;
  }
  const fondos = cuentan.filter((g) => /^Fondo/i.test(g.type));
  if (fondos.length > 0) {
    const cual = (fondos[0]?.type ?? "").toLowerCase();
    return `Hoy en 30s: definí cuánto querés en tu ${cual} y apartá el primer aporte.`;
  }
  return "Hoy en 30s: mirá tu tablero de protección y elegí la brecha que más te pesa.";
}

/** Elige la bandera activa de mayor prioridad (o null si no hay). */
function topFlag(diagnosis: DiagnosisFlag[]): DiagnosisFlag | null {
  if (diagnosis.length === 0) return null;
  const ranked = [...diagnosis].sort((a, b) => {
    const ia = FLAG_PRIORITY.indexOf(a.code);
    const ib = FLAG_PRIORITY.indexOf(b.code);
    return (ia < 0 ? FLAG_PRIORITY.length : ia) - (ib < 0 ? FLAG_PRIORITY.length : ib);
  });
  return ranked[0] ?? null;
}

/**
 * Construye el micro-insight del día. Determinista: mismos datos → mismo insight.
 */
export function buildDailyPatrimonioInsight(
  report: PatrimonioReport,
  level: PatrimonioLevel,
  diagnosis: DiagnosisFlag[],
  /**
   * Las brechas reales de `computeProtection`. Opcional: un llamador que no las pase se queda
   * con el copy genérico, que ya no promete mirar un fondo que puede estar bien.
   */
  protectionGaps?: ProtectionGap[],
): DetectedInsight {
  const flag = topFlag(diagnosis);
  if (flag) {
    const copy = ACTION_BY_FLAG[flag.code] ?? {
      title: "Tu siguiente paso patrimonial",
      action: "Hoy en 30s: revisá este punto en tu panel de patrimonio.",
    };
    // La bandera de protección es la única cuya acción depende de QUÉ falta.
    const action =
      flag.code === "alta_tasa_baja_proteccion" && protectionGaps
        ? accionDeProteccion(protectionGaps)
        : copy.action;
    return {
      kind: RITUAL_KIND,
      severity: "accionar",
      title: copy.title,
      body: action,
      metric: report.indice,
    };
  }

  // Sin fragilidad: progreso aspiracional hacia el Número de Libertad.
  if (report.investableWealth <= 0 || report.numeroDeIndependencia <= 0) {
    return {
      kind: RITUAL_KIND,
      severity: "info",
      title: "Estás sentando tu base patrimonial",
      body: "Tu mayor oportunidad ahora es construir patrimonio invertible. Hoy en 30s: registra tu primer activo o aporte.",
      metric: report.indice,
    };
  }

  const anios = Math.round(report.añosDeLibertad);
  const numero = formatMoney(report.numeroDeIndependencia, report.currency);
  return {
    kind: RITUAL_KIND,
    severity: report.ratioLibertad >= 0.5 ? "celebrar" : "info",
    title: `Vas construyendo tu libertad · ${level.name}`,
    body: `Tu patrimonio invertible ya te compra ${anios} ${anios === 1 ? "año" : "años"} de tu estilo de vida; tu Número de Libertad es ${numero}. Hoy en 30s: registra un aporte, aunque sea pequeño.`,
    metric: report.indice,
  };
}
