/**
 * Copy compartido (web + móvil) para eliminar una transacción huérfana de gasto
 * real desde "Por reasignar". Puro: recibe el monto YA formateado (cada plataforma
 * usa su formateador — formatMoney en web, mAmount en móvil).
 */
import type { OrphanLine } from "@/modules/financial-base/engine/expense-jars";

/** Cómo se llama el ledger que revierte un borrado, por tipo de vínculo. */
const LINKED_NOUN: Record<string, string> = {
  goal: "el acumulado de tu sobre",
  debt: "el saldo de tu deuda",
  holding: "el costo de tu inversión",
  policy: "tu póliza",
  rental: "tu renta",
};

/** ¿La transacción está vinculada a una entidad cuyo ledger se revierte al borrar? */
export function isLinkedOrphan(line: Pick<OrphanLine, "linkedKind">): boolean {
  return Boolean(line.linkedKind && line.linkedKind !== "none");
}

/**
 * Mensaje de confirmación del borrado, diferenciado:
 *  · Vinculada → advierte que REVIERTE el ledger de la entidad (con su nombre si
 *    se conoce; si la entidad ya no está listada, cae al tipo genérico). Sin esto
 *    el usuario perdería plata del frasco sin saberlo.
 *  · No vinculada → confirmación simple (el total gastado baja por ese monto).
 * `amountLabel` es el monto ya formateado en la moneda de visualización.
 */
export function orphanDeletionWarning(line: OrphanLine, amountLabel: string): string {
  if (!isLinkedOrphan(line)) {
    return `Se eliminará el gasto «${line.name}» (${amountLabel}). Tu total gastado baja por ese monto.`;
  }
  const noun = LINKED_NOUN[line.linkedKind!] ?? "la entidad vinculada";
  const target = line.linkedName ? `${noun} «${line.linkedName}»` : noun;
  return (
    `Este gasto está vinculado: borrarlo REVERTIRÁ su efecto en ${target}. ` +
    `Se le restará ${amountLabel}. Esta acción no se puede deshacer.`
  );
}
