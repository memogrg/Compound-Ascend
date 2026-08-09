/**
 * Detectores del RITMO DEL MES (puros, sin IO). Mismo contrato que
 * lib/insights/detectors.ts: reciben datos ya cargados y devuelven DetectedInsight[].
 *
 * Viven acá y no en insights/detectors.ts porque necesitan las constantes y el copy del
 * engine de ritmo, y porque los tres se leen juntos: son un ciclo, no tres reglas
 * sueltas. Se integran a la MISMA pasada de `syncInsights` (ver insights-service.ts) —
 * eso no es un detalle: `syncInsights` marca 'resuelto' todo activo que no venga en el
 * array, así que un detector que corriera por su cuenta mataría a los demás.
 *
 * De ahí sale gratis la auto-limpieza: el día 6 `detectVentanaPresupuesto` deja de
 * emitir y la tarjeta se cierra sola; registrás un gasto y el recordatorio del día
 * desaparece. Nadie tiene que acordarse de borrar nada.
 *
 * ── SOBRE `relatedId` ───────────────────────────────────────────────────────
 * Ninguno de los tres cuelga de una entidad (no hay una fila "ventana de agosto"), así
 * que usan una clave de texto estable con el período adentro. Eso exige que
 * `user_insights.related_id` sea `text` — lo es desde la migración 20260813000001, que
 * arregla justamente el uuid que hacía fallar la pasada entera. Sin ese arreglo, estos
 * tres detectores no solo no funcionarían: tumbarían todos los demás insights.
 *
 * La GRANULARIDAD de la clave decide el comportamiento de descarte, y por eso difiere:
 *  · ventana y cierre → por MES. Una tarjeta que se actualiza (los días que quedan
 *    cambian en el body), no cinco tarjetas apiladas. Descartarla la calla todo el mes,
 *    que es lo que el usuario quiere decir con la X.
 *  · recordatorio diario → por DÍA. Descartarlo significa "hoy no", no "nunca más".
 *    Mañana es otra clave y vuelve a aparecer.
 */
import type { DetectedInsight } from "@/lib/insights/types";
import {
  copyDiasRestantes,
  enDiasDeCierre,
  estadoVentana,
  mostrarNudgeDiario,
  nombreMes,
  pendientesDeCierre,
  type PendienteCierre,
} from "@/lib/rhythm/engine";
import { semanaISO, textoDiagnostico, type SenalRitmo } from "@/lib/rhythm/spend-pace";
import { textoOcioso, type SobreOcioso } from "@/lib/rhythm/idle-envelopes";

/** "2026-08" — sufijo de las claves mensuales. */
function claveMes(year: number, month: number): string {
  return `${year}-${String(month).padStart(2, "0")}`;
}

// ── 1. Ventana de configuración (días 1-5) ──────────────────────────────────

/**
 * "Ajustá tus sobres de {mes}" mientras la ventana esté abierta.
 *
 * No se emite si el hogar ya cerró la configuración a mano: cerrar es decir "ya está",
 * y seguir insistiendo después de eso es no escuchar.
 *
 * `sobresConPresupuesto` cambia el TONO, no la presencia del aviso. Con cero sobres el
 * mes está en blanco y el mensaje es de arranque; con sobres ya puestos es una
 * invitación a repasar. Los dos casos merecen el recordatorio — el segundo es
 * precisamente la gente que copió del mes anterior y todavía puede afinar.
 */
export function detectVentanaPresupuesto(input: {
  dia: number;
  year: number;
  month: number;
  closedAt: string | null;
  sobresConPresupuesto: number;
}): DetectedInsight[] {
  const ventana = estadoVentana({ dia: input.dia, closedAt: input.closedAt });
  if (!ventana.abierta) return [];

  const mes = nombreMes(input.month);
  const arranque = input.sobresConPresupuesto === 0;
  const cuerpo = arranque
    ? `Todavía no repartiste tu presupuesto de ${mes}. Definilo ahora y el resto del mes se cuenta solo.`
    : `Tenés ${input.sobresConPresupuesto} ${input.sobresConPresupuesto === 1 ? "sobre" : "sobres"} con monto. Este es el momento de acomodarlos a lo que viene en ${mes}.`;

  return [
    {
      kind: "ventana_presupuesto",
      severity: "accionar",
      title: `Ajustá tus sobres de ${mes}`,
      body: `${cuerpo} ${copyDiasRestantes(ventana.diasRestantes)}`.trim(),
      metric: ventana.diasRestantes,
      relatedId: `ventana:${claveMes(input.year, input.month)}`,
    },
  ];
}

// ── 2. Cierre de mes (día 28 → último) ──────────────────────────────────────

/**
 * "Cerrá {mes} con todo registrado", listando lo que falta.
 *
 * Silencio activo cuando no falta nada: sin pendientes NO se emite. Un aviso que dice
 * "todo en orden" entrena a ignorar los avisos, y el mérito de llegar al día 28 al día
 * ya se celebra en otro lado (`racha_positiva`).
 */
export function detectCierreMes(input: {
  dia: number;
  year: number;
  month: number;
  conteos: {
    metasSinAporte: number;
    deudasSinPago: number;
    sobresSinMovimiento: number;
    transaccionesSinSobre: number;
  };
}): DetectedInsight[] {
  if (!enDiasDeCierre({ dia: input.dia, year: input.year, month: input.month })) return [];

  const pendientes = pendientesDeCierre(input.conteos);
  if (pendientes.length === 0) return [];

  const mes = nombreMes(input.month);
  return [
    {
      kind: "cierre_mes",
      severity: "accionar",
      title: `Cerrá ${mes} con todo registrado`,
      body: `${listaPendientes(pendientes)} Cuando termines, pegá tu estado de cuenta y conciliamos lo que falte.`,
      metric: pendientes.reduce((acc, p) => acc + p.cantidad, 0),
      relatedId: `cierre:${claveMes(input.year, input.month)}`,
    },
  ];
}

/** "Te faltan A, B y C." — coma española: la 'y' reemplaza a la última coma. */
function listaPendientes(pendientes: PendienteCierre[]): string {
  const textos = pendientes.map((p) => p.texto);
  if (textos.length === 1) return `Te falta ${textos[0]}.`;
  const ultimo = textos[textos.length - 1];
  return `Te faltan ${textos.slice(0, -1).join(", ")} y ${ultimo}.`;
}

// ── 3. Recordatorio diario (19:00 hora del perfil) ──────────────────────────

/**
 * "¿Tenés algún gasto de hoy para registrar?" a partir de las 19:00 locales.
 *
 * `movimientosHoy > 0` lo apaga: quien ya registró algo no necesita el recordatorio.
 * Esa es la regla entera, y es la que evita que esto se vuelva una alarma diaria que se
 * silencia a la semana.
 *
 * `severity: "info"`, no "accionar": no hay ningún problema que resolver — es una
 * invitación. Reservar la severidad alta para lo que de verdad duele es lo que hace que
 * el rojo signifique algo (en la campana ordena por severidad, así que un recordatorio
 * en rojo se pondría encima de una deuda en mora).
 */
export function detectRegistroDiario(input: {
  /** "YYYY-MM-DD" en la zona del perfil: la clave del insight es el día. */
  todayIso: string;
  horaLocal: number;
  movimientosHoy: number;
}): DetectedInsight[] {
  if (!mostrarNudgeDiario({ horaLocal: input.horaLocal, movimientosHoy: input.movimientosHoy })) {
    return [];
  }
  return [
    {
      kind: "registro_diario",
      severity: "info",
      title: "¿Algún gasto de hoy para registrar?",
      body: "Un minuto ahora te ahorra reconstruir el mes después. Podés dictárselo al asistente o cargarlo a mano.",
      relatedId: `registro:${input.todayIso}`,
    },
  ];
}

// ── 4. Ritmo de gasto por sobre (Fase B) ────────────────────────────────────

/**
 * "Vas rápido para el día que es" — un insight por sobre que corre por delante del calendario.
 *
 * ── UNA VEZ POR SOBRE POR SEMANA, SIN CONTADOR ──────────────────────────────
 * La semana va dentro de `relatedId` (`ritmo:{categoryId}:2026-W33`), así que el tope semanal
 * lo impone el índice único de `syncInsights` y no un contador que alguien tenga que mantener:
 *  · todas las pasadas de la misma semana caen en la MISMA fila → una tarjeta que se actualiza
 *    con cifras frescas, no siete tarjetas apiladas;
 *  · descartarla la calla hasta el lunes, cuando la clave cambia y la pregunta vuelve a ser
 *    legítima (el ritmo de la semana pasada ya no dice nada del de esta);
 *  · si el sobre vuelve a su carril, deja de emitirse y la tarjeta se cierra sola.
 *
 * ── SEVERIDAD 'observar', NO 'accionar' ─────────────────────────────────────
 * Todavía no pasó nada malo: el sobre está dentro de su presupuesto y esto es una proyección.
 * La campana ordena por severidad, y poner una advertencia preventiva por encima de una deuda
 * en mora sería mentir sobre la urgencia. Cuando el sobre SÍ se pasa, el que habla es
 * `detectOverspentEnvelopes` — ese sí es 'accionar'.
 *
 * `max` topea cuántos se emiten (2 por defecto): con un insight por sobre, un mes flojo
 * convierte la campana en una lista de reproches y el usuario la vacía sin leer.
 */
export function detectRitmoSobre(input: {
  senales: SenalRitmo[];
  dia: number;
  todayIso: string;
  /** Formateador de moneda (se inyecta para no acoplar el detector a la capa de formato). */
  fmt: (amount: number, currency: string) => string;
  max?: number;
}): DetectedInsight[] {
  const semana = semanaISO(input.todayIso);
  return input.senales.slice(0, input.max ?? 2).map((s) => ({
    kind: "ritmo_sobre" as const,
    severity: "observar" as const,
    title: `Vas rápido en ${s.path}`,
    body: `${textoDiagnostico(s, input.dia, input.fmt)} ${resumenSalidas(s, input.fmt)}`.trim(),
    metric: Math.round(s.proyeccion),
    // 'category' ya está permitido por el check de user_insights (20260810000001), así que la
    // campana puede hacer deep-link al tab de Gastos por relatedKind.
    relatedKind: "category" as const,
    relatedId: `ritmo:${s.categoryId}:${semana}`,
  }));
}

/**
 * Cierra el diagnóstico con las salidas, en una frase.
 *
 * Que el cuerpo del insight NOMBRE las salidas —y no solo la tarjeta de la pantalla de
 * Gastos— es lo que hace que el aviso sirva desde la campana y desde el chat, que es donde
 * mucha gente lo va a leer primero. Un insight que dice el problema y esconde la solución en
 * otra pantalla es medio insight.
 */
// ── 5. Sobres ociosos (Fase C) ──────────────────────────────────────────────

/**
 * "Tenés plata apartada en {sobre} y casi no la usás" — un insight por sobre ocioso.
 *
 * ── UNA VEZ POR SOBRE POR MES ───────────────────────────────────────────────
 * Mismo truco de clave que el ritmo, pero anclado al MES y no a la semana
 * (`ocioso:{categoryId}:2026-08`): un sobre ocioso es una conclusión sobre tres meses de
 * historia y no cambia de un lunes al otro. Recordárselo cada semana sería insistir con la
 * misma frase sobre datos que no se movieron — el camino más corto a que el usuario deje de
 * leer la campana.
 *
 * ── SEVERIDAD 'info' ────────────────────────────────────────────────────────
 * Ni siquiera es un riesgo: es plata inmovilizada, y a veces a propósito. Va por debajo del
 * ritmo ('observar') y muy por debajo de un sobregiro ('accionar') en el orden de la campana.
 * Ese escalonamiento es lo que hace que las severidades signifiquen algo.
 */
export function detectSobreOcioso(input: {
  ociosos: SobreOcioso[];
  /** "YYYY-MM-DD" en la zona del perfil: de acá sale el ancla mensual de la clave. */
  todayIso: string;
  fmt: (amount: number, currency: string) => string;
  max?: number;
}): DetectedInsight[] {
  const mes = input.todayIso.slice(0, 7);
  return input.ociosos.slice(0, input.max ?? 2).map((o) => ({
    kind: "sobre_ocioso" as const,
    severity: "info" as const,
    title: `Casi no usás ${o.path}`,
    body: `${textoOcioso(o, input.fmt)} ${resumenSalidasOcioso(o, input.fmt)}`.trim(),
    metric: Math.round(o.ociosoMensual),
    relatedKind: "category" as const,
    relatedId: `ocioso:${o.categoryId}:${mes}`,
  }));
}

/** Cierra el diagnóstico del ocioso con sus salidas, para que sirva desde la campana. */
function resumenSalidasOcioso(o: SobreOcioso, fmt: (a: number, c: string) => string): string {
  const mover = o.salidas.find((x) => x.tipo === "mover");
  const fusionar = o.salidas.find((x) => x.tipo === "fusionar");
  const partes: string[] = [];
  if (mover) partes.push(`mover ${fmt(mover.monto, o.currency)} a ${mover.hastaPath}`);
  if (fusionar) partes.push(`fusionarlo con ${fusionar.hastaPath}`);
  if (partes.length === 0) {
    // Sin receptor ni hermano no hay nada que proponer, pero el dato igual vale: el usuario
    // puede decidir bajarlo él. Lo que no se hace es fingir una salida que no existe.
    return "Si no lo necesitás apartado, ese margen puede ir a otro lado.";
  }
  return `Podés ${partes.join(" o ")}. O dejarlo como está, si lo querés disponible.`;
}

function resumenSalidas(s: SenalRitmo, fmt: (a: number, c: string) => string): string {
  const mover = s.salidas.find((x) => x.tipo === "mover");
  const bajar = s.salidas.find((x) => x.tipo === "bajar_ritmo");
  const partes: string[] = [];
  if (mover) partes.push(`mover ${fmt(mover.monto, s.currency)} desde ${mover.desdePath}`);
  if (bajar && bajar.diasRestantes > 0) {
    partes.push(`o quedarte en ${fmt(bajar.porDia, s.currency)} por día`);
  }
  if (partes.length === 0) return "";
  return `Podés ${partes.join(" ")}. Y dejarlo así también es una opción.`;
}
