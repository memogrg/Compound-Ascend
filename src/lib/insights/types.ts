/**
 * Tipos de la memoria conductual (insights del asesor). Sin IO.
 * Un detector produce `DetectedInsight` (sin estado); al persistirse pasa a `Insight`.
 */

export type InsightSeverity = "celebrar" | "info" | "observar" | "accionar";
export type InsightStatus = "activo" | "descartado" | "resuelto";

/**
 * Entidades a las que un insight se puede asociar.
 *
 * Es un ARRAY en runtime y no solo un tipo porque el check de `user_insights.related_kind`
 * (migración 20260810000001) tiene que decir EXACTAMENTE lo mismo. Un valor que exista acá y no
 * en la BD no falla solo en su fila: syncInsights hace un upsert con todas las filas de la
 * pasada, así que el statement entero se aborta y el usuario se queda sin NINGÚN insight. Ya
 * pasó una vez con 'holding'; hay un test que lo vigila.
 */
export const INSIGHT_RELATED_KINDS = ["goal", "debt", "category", "holding"] as const;
export type InsightRelatedKind = (typeof INSIGHT_RELATED_KINDS)[number];

export type InsightKind =
  | "meta_estancada"
  | "gasto_disfrute_alza"
  | "deuda_creciendo"
  | "racha_positiva"
  | "ritual_patrimonio"
  | "aporte_pendiente"
  | "perfil_revision"
  | "fondo_paz"
  | "alerta_precio"
  // ── Cobertura de "daño": lo que un asesor amigo vería y diría. Todos deterministas,
  // sobre datos reales del usuario, con severidad y una acción concreta (ver actions.ts).
  | "sobre_sobregirado"
  | "ahorro_bajo"
  | "deuda_cara"
  | "fondo_emergencia"
  | "concentracion_inversion"
  | "rendimiento_bajo_inflacion"
  // ── El ritmo del mes: los tres momentos del ciclo (ver lib/rhythm/detectors.ts).
  // `kind` NO tiene check en la BD —solo severity/status/related_kind lo tienen—, así que
  // sumar tipos acá no necesita migración. Lo que sí la necesitó fue `related_id`: estos
  // tres usan claves de texto con el período adentro ('ventana:2026-08'), imposibles en la
  // columna uuid original (arreglado en 20260813000001).
  | "ventana_presupuesto"
  | "cierre_mes"
  | "registro_diario"
  // Ritmo de gasto: el sobre va más rápido que el calendario. Preventivo — cuando SÍ se pasa
  // habla `sobre_sobregirado`, que es el que merece severidad 'accionar'.
  | "ritmo_sobre"
  /**
   * Aviso ÚNICO (no lo emite ningún detector): la frecuencia de una fuente de
   * ingreso quedó normalizada a "mensual" al unificar la semántica del monto
   * (el monto pasó a ser SIEMPRE lo que se recibe por pago). Se siembra a mano
   * para las cuentas afectadas y sobrevive a la reconciliación — ver
   * KINDS_SIN_RECONCILIAR en insights-service.
   */
  | "frecuencia_ingreso_revisar"
  // Sobre con presupuesto asignado y casi sin uso en los últimos meses. Severidad 'info': ni
  // siquiera es un riesgo — es plata inmovilizada, y a veces a propósito.
  | "sobre_ocioso"
  // El feed de precios lleva más de un día sin refrescar las posiciones cotizadas. NO es un
  // problema del usuario: es nuestro. Va a la campana igual porque mientras dure, la valuación
  // del portafolio (y lo que el asesor diga sobre ella) está apoyada en precios viejos, y eso
  // el usuario tiene derecho a saberlo antes de decidir algo con esos números.
  | "feed_precios_stale";

/** Lo que produce un detector (puro, sin IO ni estado de persistencia). */
export type DetectedInsight = {
  kind: InsightKind;
  severity: InsightSeverity;
  title: string;
  body: string;
  metric?: number;
  relatedKind?: InsightRelatedKind;
  relatedId?: string;
};

/** Insight ya persistido (con estado y timestamps). */
export type Insight = DetectedInsight & {
  id: string;
  status: InsightStatus;
  createdAt: string;
  updatedAt: string;
};
