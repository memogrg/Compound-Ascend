/**
 * SEGUIMIENTO DE RECOMENDACIONES — el motor PURO (sin IO: testeable entero).
 *
 * Cierra el loop del asesor. El hilo de coaching ya guardaba QUÉ se recomendó; lo que faltaba era
 * cruzarlo con LO QUE PASÓ. Sin esto el asesor recomienda al vacío: no sabe si le hicieron caso, así
 * que no puede celebrar lo que sí se hizo ni retomar lo que quedó pendiente — y eso es literalmente
 * la diferencia entre un asesor y un generador de consejos.
 *
 * NADA se infiere del texto de la recomendación. El cruce es contra el ESTADO REAL: el saldo de la
 * deuda, el acumulado de la meta, el aporte configurado. Si el dato real no está, la recomendación
 * queda 'abierta' — nunca se celebra algo que no se pudo verificar.
 */

/** Estado del seguimiento de una recomendación. Espeja el check de la migración. */
export type FollowStatus = "abierta" | "cumplida" | "vencida" | "sin_seguimiento";

/** Una recomendación del hilo, ya estructurada (las filas viejas sin `actionType` no se siguen). */
export type Recomendacion = {
  id: string;
  /** YYYY-MM-DD en que se recomendó. */
  fecha: string;
  summary: string;
  actionType: string | null;
  /** Id de la entidad recomendada (meta, deuda, posición). */
  actionRef: string | null;
  actionAmount: number | null;
  status: FollowStatus;
};

/**
 * El estado REAL de las entidades que una recomendación pudo tocar. Lo arma el servicio leyendo los
 * módulos de dominio; acá solo se compara.
 */
export type EstadoActual = {
  /** Metas por id: cuánto llevan acumulado hoy y cuál es su aporte mensual configurado. */
  metas: Record<string, { nombre: string; acumulado: number; aporteMensual: number | null }>;
  /** Deudas por id: saldo vivo hoy. */
  deudas: Record<string, { nombre: string; saldo: number }>;
  /** Posiciones por id: aporte DCA mensual configurado hoy. */
  posiciones: Record<string, { nombre: string; aporteMensual: number | null }>;
  /**
   * Cuánto había ANTES, tomado del snapshot del día de la recomendación. Sin esto no se puede saber
   * si la meta avanzó POR el consejo o ya venía avanzando — y celebrar lo segundo suena a que el
   * asesor no está mirando.
   */
  previo?: {
    metas?: Record<string, number>;
    deudas?: Record<string, number>;
  };
};

/** Días tras los cuales una recomendación sin cumplir se considera vencida (un ciclo mensual + margen). */
export const DIAS_PARA_VENCER = 45;

/** Días de gracia antes de evaluar: una recomendación de ayer todavía no tuvo tiempo de cumplirse. */
export const DIAS_DE_GRACIA = 3;

/** Días enteros entre dos fechas YYYY-MM-DD (b − a). */
export function diasEntre(a: string, b: string): number {
  const ta = Date.parse(`${a}T00:00:00.000Z`);
  const tb = Date.parse(`${b}T00:00:00.000Z`);
  if (!Number.isFinite(ta) || !Number.isFinite(tb)) return 0;
  return Math.round((tb - ta) / (24 * 60 * 60 * 1000));
}

/**
 * Tolerancia al comparar montos: el usuario hace "el aporte que hablamos" con un número redondo,
 * no con el centavo exacto que calculó el motor. Se da por cumplido desde el 80% de lo recomendado
 * — por debajo de eso es otra cosa, no ese consejo.
 */
const CUMPLIMIENTO_MIN = 0.8;

/**
 * ¿Esta recomendación se CUMPLIÓ? Devuelve el avance verificado, o `null` si no se puede verificar
 * (la entidad ya no existe, el tipo de acción no tiene seguimiento, falta el estado previo).
 *
 * `null` NO es "no se cumplió": es "no lo sé", y se trata distinto — una recomendación sin verificar
 * queda abierta y el asesor la retoma preguntando, no afirmando.
 */
export function verificarCumplimiento(
  rec: Recomendacion,
  estado: EstadoActual,
): { cumplida: boolean; avance: number; entidad: string } | null {
  const ref = rec.actionRef;
  if (!ref || !rec.actionType) return null;
  const objetivo = rec.actionAmount;

  switch (rec.actionType) {
    case "create_goal": {
      const meta = estado.metas[ref];
      if (!meta) return null;
      const antes = estado.previo?.metas?.[ref];
      if (antes === undefined) return null;
      const avance = meta.acumulado - antes;
      // Sin monto recomendado, cualquier avance positivo cuenta: el consejo era "empezá a aportar".
      const umbral = objetivo != null && objetivo > 0 ? objetivo * CUMPLIMIENTO_MIN : 0.01;
      return { cumplida: avance >= umbral, avance, entidad: meta.nombre };
    }
    case "debt_extra_payment": {
      const deuda = estado.deudas[ref];
      if (!deuda) return null;
      const antes = estado.previo?.deudas?.[ref];
      if (antes === undefined) return null;
      // La deuda BAJA cuando se abona: el avance es cuánto se redujo el saldo.
      const avance = antes - deuda.saldo;
      const umbral = objetivo != null && objetivo > 0 ? objetivo * CUMPLIMIENTO_MIN : 0.01;
      return { cumplida: avance >= umbral, avance, entidad: deuda.nombre };
    }
    case "set_dca": {
      const pos = estado.posiciones[ref];
      if (!pos) return null;
      // Acá no hace falta el previo: el DCA es una CONFIGURACIÓN, y que hoy exista con el monto
      // recomendado ES el cumplimiento (no hay que esperar a que se ejecute el aporte).
      const actual = pos.aporteMensual ?? 0;
      const umbral = objetivo != null && objetivo > 0 ? objetivo * CUMPLIMIENTO_MIN : 0.01;
      return { cumplida: actual >= umbral, avance: actual, entidad: pos.nombre };
    }
    default:
      // adjust_budget / move_budget y las demás no tienen todavía una señal limpia de "se hizo".
      return null;
  }
}

export type SeguimientoResuelto = {
  id: string;
  status: FollowStatus;
  /** Lo que el asesor puede DECIR de esta recomendación. `null` = no hay nada que decir. */
  linea: string | null;
  avance?: number;
};

/** Formatea un monto sin depender del módulo de moneda (el motor es puro). */
function money(n: number, currency: string): string {
  const simbolo = currency === "CRC" ? "₡" : currency === "USD" ? "$" : "";
  return `${simbolo}${Math.round(Math.abs(n)).toLocaleString("es-CR")}`;
}

/**
 * Resuelve UNA recomendación abierta contra el estado real. Es lo que decide si el asesor celebra,
 * retoma o se calla.
 *
 * Las tres salidas, y por qué:
 *  - CUMPLIDA → una línea de celebración CONCRETA, con el monto real y la consecuencia. "Bien hecho"
 *    a secas no vale nada; "hiciste el aporte que hablamos" sí, porque demuestra que estaba mirando.
 *  - VENCIDA → una línea para RETOMAR sin regaño. El producto no regaña: se nombra el hecho y se
 *    ofrece seguir, nunca se reprocha.
 *  - ABIERTA → `null`. Todavía no pasó nada que valga decir, y hablar por hablar gasta el turno.
 */
export function resolverSeguimiento(
  rec: Recomendacion,
  estado: EstadoActual,
  hoy: string,
  currency: string,
): SeguimientoResuelto {
  const dias = diasEntre(rec.fecha, hoy);
  if (dias < DIAS_DE_GRACIA) return { id: rec.id, status: "abierta", linea: null };

  const v = verificarCumplimiento(rec, estado);
  if (v === null) {
    // No verificable: si además ya venció el plazo, se deja de seguir en vez de arrastrarla para
    // siempre. Nunca se marca como incumplida algo que no se pudo mirar.
    return {
      id: rec.id,
      status: dias > DIAS_PARA_VENCER ? "sin_seguimiento" : "abierta",
      linea: null,
    };
  }

  if (v.cumplida) {
    return {
      id: rec.id,
      status: "cumplida",
      avance: v.avance,
      linea: `Hizo lo que acordaron sobre ${v.entidad}: ${money(v.avance, currency)}. Reconocelo por su nombre antes de seguir.`,
    };
  }

  if (dias > DIAS_PARA_VENCER) {
    return {
      id: rec.id,
      status: "vencida",
      avance: v.avance,
      linea: `Lo que acordaron sobre ${v.entidad} no se movió en ${dias} días. Retomalo SIN reproche: nombralo y ofrecé un paso más chico.`,
    };
  }

  return { id: rec.id, status: "abierta", linea: null };
}

/** Cuántas líneas de seguimiento entran al prompt. Dos alcanzan: más es un informe, no una charla. */
export const MAX_SEGUIMIENTO = 2;

/**
 * Resuelve todas las recomendaciones abiertas y devuelve (a) las líneas para el prompt y (b) los
 * cambios de estado a persistir. Las CUMPLIDAS van primero: celebrar un logro real vale más que
 * retomar un pendiente, y si solo entra una línea, tiene que ser esa.
 */
export function resolverTodas(
  recs: Recomendacion[],
  estado: EstadoActual,
  hoy: string,
  currency: string,
): { lineas: string[]; cambios: { id: string; status: FollowStatus }[] } {
  const resueltas = recs
    .filter((r) => r.status === "abierta")
    .map((r) => resolverSeguimiento(r, estado, hoy, currency));

  const cambios = resueltas
    .filter((r) => r.status !== "abierta")
    .map((r) => ({ id: r.id, status: r.status }));

  const cumplidas = resueltas.filter((r) => r.status === "cumplida" && r.linea);
  const vencidas = resueltas.filter((r) => r.status === "vencida" && r.linea);
  const lineas = [...cumplidas, ...vencidas].map((r) => r.linea!).slice(0, MAX_SEGUIMIENTO);

  return { lineas, cambios };
}
