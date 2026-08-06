/**
 * ACCIÓN SUGERIDA por tipo de insight: qué se puede HACER al respecto y dónde.
 *
 * Vive acá y no en la fila persistida a propósito: la acción es función del `kind`, no un dato
 * del usuario. Derivarla en lectura evita una columna nueva (y su migración) y, sobre todo, evita
 * que insights viejos queden con una acción desactualizada cuando la app cambie de pantalla.
 *
 * La usa el asesor para CERRAR la observación con una salida concreta ("si querés lo ajustamos"),
 * que es la diferencia entre señalar un problema y ayudar a resolverlo.
 *
 * Puro, sin IO: importable desde cualquier capa.
 */
import type { InsightKind } from "@/lib/insights/types";

export type InsightAction = {
  /** Qué se hace, en infinitivo y en una frase corta. */
  label: string;
  /** Dónde se hace, en la app. */
  route: string;
};

const ACTIONS: Record<InsightKind, InsightAction> = {
  sobre_sobregirado: {
    label: "ajustar el presupuesto de ese sobre o ver dónde recortar",
    route: "/gastos",
  },
  ahorro_bajo: {
    label: "revisar el plan de gastos para liberar flujo",
    route: "/mi-base-financiera",
  },
  deuda_cara: { label: "priorizar esa deuda y simular el abono", route: "/deudas" },
  deuda_creciendo: { label: "ponerse al día con esa deuda", route: "/deudas" },
  fondo_emergencia: {
    label: "definir un aporte mensual al fondo de emergencia",
    route: "/patrimonio/proteccion",
  },
  fondo_paz: {
    label: "definir un aporte mensual al fondo de paz",
    route: "/patrimonio/proteccion",
  },
  concentracion_inversion: {
    label: "revisar la distribución del portafolio",
    route: "/patrimonio",
  },
  rendimiento_bajo_inflacion: {
    label: "revisar el portafolio y su composición",
    route: "/patrimonio",
  },
  meta_estancada: { label: "ajustar el aporte mensual de esa meta", route: "/control-financiero" },
  gasto_disfrute_alza: {
    label: "definir un monto libre para disfrutar sin culpa",
    route: "/gastos",
  },
  aporte_pendiente: { label: "confirmar el precio de compra del aporte", route: "/patrimonio" },
  racha_positiva: { label: "definir el próximo objetivo", route: "/control-financiero" },
  ritual_patrimonio: { label: "revisar el marco patrimonial", route: "/mi-rich-life" },
  perfil_revision: { label: "revisar el perfil financiero", route: "/mi-perfil-financiero" },
  alerta_precio: { label: "revisar la alerta en el portafolio", route: "/patrimonio" },
};

/** Acción sugerida para un kind. `undefined` para un kind desconocido (no inventa una salida). */
export function suggestedAction(kind: InsightKind): InsightAction | undefined {
  return ACTIONS[kind];
}
