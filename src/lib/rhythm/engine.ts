/**
 * EL RITMO DEL MES — motor puro. Sin IO, sin `server-only`: lo importan tanto los
 * detectores del servidor como los componentes cliente del pop-up (web y móvil).
 *
 * Tres momentos del ciclo mensual, y una regla que los une: la app ACOMPAÑA, no regaña.
 * Nada de acá bloquea nada. La ventana que se vence sigue dejando editar (con una
 * confirmación que queda registrada); el cierre de mes lista lo que falta sin reprochar
 * lo que no se hizo; el recordatorio diario no aparece si ya registraste algo.
 *
 * TODO cálculo de calendario recibe el día/hora YA RESUELTOS en la zona del PERFIL
 * (`userToday()` / `userHour()` de lib/time/user-time). Nada acá llama a `new Date()`
 * sin argumentos: en Vercel eso sería UTC y un usuario en Costa Rica (UTC−6) vería la
 * ventana cerrarse la noche del día 4.
 */
import { lastDayOfMonth } from "@/modules/financial-base/engine/period";

// ── Constantes del ritmo ────────────────────────────────────────────────────
// Nombradas y exportadas para poder ajustarlas sin cazar números por el código, y para
// que los tests afirmen contra ellas en vez de contra literales (si mañana la ventana
// es de 7 días, los tests siguen siendo verdad).

/** Primer día del mes en que la ventana de configuración está abierta. */
export const VENTANA_PRIMER_DIA = 1;
/** Último día (inclusive) de la ventana de configuración. */
export const VENTANA_ULTIMO_DIA = 5;

/**
 * Primer día del ritual de cierre. El último es el último del mes, sea 28, 30 o 31
 * — de ahí que sea una sola constante y no un rango: febrero no tiene día 31.
 */
export const CIERRE_PRIMER_DIA = 28;

/** Hora local del perfil a la que se dispara el recordatorio diario (0-23). */
export const RECORDATORIO_HORA = 19;

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

/** "agosto" (minúscula, para incrustar en una frase). */
export function nombreMes(month: number): string {
  return MESES[month - 1] ?? "";
}

/** "Agosto" (capitalizado, para títulos). */
export function nombreMesCap(month: number): string {
  const m = nombreMes(month);
  return m.charAt(0).toUpperCase() + m.slice(1);
}

/** Día del mes (1-31) de un "YYYY-MM-DD". 0 si la fecha no es parseable. */
export function diaDe(todayIso: string): number {
  return Number(todayIso.slice(8, 10)) || 0;
}

/** { year, month } de un "YYYY-MM-DD". */
export function periodoDe(todayIso: string): { year: number; month: number } {
  return { year: Number(todayIso.slice(0, 4)), month: Number(todayIso.slice(5, 7)) };
}

// ── 1. Ventana de configuración (días 1-5) ──────────────────────────────────

/**
 * Por qué la ventana está como está. La distinción importa para el COPY: "se venció"
 * y "vos la cerraste" merecen frases distintas, y "abierta" tiene que decir cuánto
 * queda para que sea accionable y no decorativa.
 */
export type VentanaEstado = "abierta" | "cerrada_por_el_usuario" | "vencida";

export type Ventana = {
  estado: VentanaEstado;
  /** Atajo: editar el presupuesto es libre (sin confirmación ni contador). */
  abierta: boolean;
  /** Días que quedan de ventana, HOY incluido. 0 si ya no está abierta. */
  diasRestantes: number;
  /** Día en que se vence (siempre VENTANA_ULTIMO_DIA; expuesto para el copy). */
  ultimoDia: number;
};

/**
 * Estado de la ventana para un día del mes.
 *
 * `closedAt` gana sobre el calendario: cerrar a mano el día 2 cierra de verdad — es una
 * decisión del hogar ("ya está, así queda el mes"), y desautorizarla porque "todavía es
 * día 2" convertiría el botón en decorativo.
 *
 * Lo que NO cierra la ventana: copiar el presupuesto del mes anterior. Copiar es un
 * PUNTO DE PARTIDA, no una decisión final; el usuario copia el día 1 y sigue ajustando
 * hasta el 5. Por eso `copyPreviousMonthExpenseBudget` no toca `budget_month_config`.
 */
export function estadoVentana(args: { dia: number; closedAt: string | null }): Ventana {
  const ultimoDia = VENTANA_ULTIMO_DIA;
  if (args.closedAt) {
    return { estado: "cerrada_por_el_usuario", abierta: false, diasRestantes: 0, ultimoDia };
  }
  const dentro = args.dia >= VENTANA_PRIMER_DIA && args.dia <= VENTANA_ULTIMO_DIA;
  if (!dentro) return { estado: "vencida", abierta: false, diasRestantes: 0, ultimoDia };
  return {
    estado: "abierta",
    abierta: true,
    // HOY cuenta: el día 5 todavía quedan "1 día" (hoy), no 0.
    diasRestantes: VENTANA_ULTIMO_DIA - args.dia + 1,
    ultimoDia,
  };
}

/** Copy del contador de días. Cálido y concreto; nunca una cuenta regresiva alarmista. */
export function copyDiasRestantes(diasRestantes: number): string {
  if (diasRestantes <= 0) return "";
  if (diasRestantes === 1) return "Hoy es el último día para ajustarlos sin registro.";
  return `Te quedan ${diasRestantes} días para ajustarlos con total libertad.`;
}

// ── 2. Cierre de mes (día 28 → último) ──────────────────────────────────────

/** ¿Estamos en los días de cierre? Vale para febrero: el tope es el último día real. */
export function enDiasDeCierre(args: { dia: number; year: number; month: number }): boolean {
  return args.dia >= CIERRE_PRIMER_DIA && args.dia <= lastDayOfMonth(args.year, args.month);
}

/** Un pendiente del cierre: qué falta, cuántos, y adónde se va a resolverlo. */
export type PendienteCierre = {
  clave: "metas" | "deudas" | "sobres_sin_uso" | "sin_sobre";
  /** Frase ya armada, en plural o singular según `cantidad`. */
  texto: string;
  cantidad: number;
  /** Ruta web; la superficie móvil la traduce con su propio mapa. */
  ruta: string;
};

/**
 * Arma la lista de pendientes del cierre a partir de conteos ya calculados. Puro: quien
 * llama hace las consultas (ver rhythm-service.ts) y acá solo se decide qué se dice.
 *
 * Devuelve solo los que tienen cantidad > 0 — una lista con "0 metas pendientes" es
 * ruido, y peor: hace que el aviso aparezca cuando no hay nada que hacer.
 */
export function pendientesDeCierre(conteos: {
  metasSinAporte: number;
  deudasSinPago: number;
  sobresSinMovimiento: number;
  transaccionesSinSobre: number;
}): PendienteCierre[] {
  const out: PendienteCierre[] = [];
  const plural = (n: number, uno: string, varios: string) => (n === 1 ? uno : varios);

  if (conteos.metasSinAporte > 0) {
    out.push({
      clave: "metas",
      cantidad: conteos.metasSinAporte,
      texto: `${conteos.metasSinAporte} ${plural(conteos.metasSinAporte, "meta sin su aporte", "metas sin su aporte")} del mes`,
      ruta: "/control-financiero",
    });
  }
  if (conteos.deudasSinPago > 0) {
    out.push({
      clave: "deudas",
      cantidad: conteos.deudasSinPago,
      texto: `${conteos.deudasSinPago} ${plural(conteos.deudasSinPago, "cuota de deuda sin registrar", "cuotas de deuda sin registrar")}`,
      ruta: "/deudas",
    });
  }
  if (conteos.transaccionesSinSobre > 0) {
    out.push({
      clave: "sin_sobre",
      cantidad: conteos.transaccionesSinSobre,
      texto: `${conteos.transaccionesSinSobre} ${plural(conteos.transaccionesSinSobre, "movimiento sin sobre", "movimientos sin sobre")}`,
      ruta: "/transacciones",
    });
  }
  // Va al final a propósito: es el más informativo y el menos urgente. Un sobre sin
  // movimientos puede ser perfectamente normal (el seguro que se paga en marzo).
  if (conteos.sobresSinMovimiento > 0) {
    out.push({
      clave: "sobres_sin_uso",
      cantidad: conteos.sobresSinMovimiento,
      texto: `${conteos.sobresSinMovimiento} ${plural(conteos.sobresSinMovimiento, "sobre sin movimientos", "sobres sin movimientos")}`,
      ruta: "/gastos",
    });
  }
  return out;
}

// ── 3. Recordatorio diario (19:00 hora del perfil) ──────────────────────────

/**
 * ¿Le toca el recordatorio a este usuario, ahora?
 *
 * `horaLocal` es la hora en la zona de SU perfil, no la del servidor: el cron corre cada
 * hora y le pregunta esto a cada usuario, de modo que a cada quien le llega a SUS 19:00.
 *
 * `movimientosHoy > 0` lo apaga. Es la regla que separa "acompañar" de "hostigar": quien
 * ya registró algo hoy no necesita que le recuerden registrar.
 */
export function tocaRecordatorioDiario(args: {
  horaLocal: number;
  movimientosHoy: number;
  yaNotificadoHoy: boolean;
}): boolean {
  if (args.yaNotificadoHoy) return false;
  if (args.movimientosHoy > 0) return false;
  return args.horaLocal === RECORDATORIO_HORA;
}

/**
 * La versión in-app del recordatorio: más laxa que la del correo. El correo se manda UNA
 * vez, a las 19:00 en punto (el cron pasa una vez por hora). El pop-up, en cambio, se
 * muestra desde las 19:00 y hasta que termine el día — si el usuario abre la app a las
 * 21:30 sigue teniendo sentido preguntarle, y exigir la hora exacta lo haría invisible
 * para casi todo el mundo.
 */
export function mostrarNudgeDiario(args: { horaLocal: number; movimientosHoy: number }): boolean {
  return args.horaLocal >= RECORDATORIO_HORA && args.movimientosHoy === 0;
}
