/**
 * Tipos de la memoria conductual (insights del asesor). Sin IO.
 * Un detector produce `DetectedInsight` (sin estado); al persistirse pasa a `Insight`.
 */

export type InsightSeverity = "celebrar" | "info" | "observar" | "accionar";
export type InsightStatus = "activo" | "descartado" | "resuelto";
export type InsightRelatedKind = "goal" | "debt" | "category" | "holding";

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
  | "rendimiento_bajo_inflacion";

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
