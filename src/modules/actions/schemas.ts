/** Validación de las decisiones sobre acciones. La acción se deriva; solo su estado se escribe. */
import { z } from "zod";

/** Clave determinista '<source>:<kind>:<related|periodo>'. Acotada: la genera el motor. */
export const actionKeySchema = z.string().min(3).max(200);

export const actionImpactSchema = z.object({
  kind: z.enum(["monto", "meses", "porcentaje", "brecha"]),
  value: z.number().finite().optional(),
  currency: z.string().min(3).max(3).optional(),
  label: z.string().min(1).max(160),
});

export const markDoneSchema = z.object({
  key: actionKeySchema,
  impact: actionImpactSchema.optional(),
});

export const snoozeSchema = z.object({
  key: actionKeySchema,
  /** Fecha ISO (YYYY-MM-DD) hasta la que no se vuelve a proponer. */
  until: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Fecha inválida"),
});

export const dismissSchema = z.object({
  key: actionKeySchema,
  /** Insight que originó la acción: se descarta con ella para que la campana no la repita. */
  relatedInsightId: z.string().uuid().optional(),
});

export const prioritySchema = z.object({
  priority: z.enum(["deudas", "orden", "proteger", "crecer"]),
});
