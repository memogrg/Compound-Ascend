/**
 * Lista de frascos del tab de Gastos (reemplaza ExpenseEnvelopes). Presentación
 * de servidor; cada frasco es una fila clickable que abre su modal (cliente).
 * Frasco normal → sobres + crear subcategoría; frasco vinculado → entidades
 * reales del módulo origen (el modal llega en el commit de vinculados).
 */
import { JarRow } from "@/modules/financial-base/components/v2/expense-jars/jar-row";
import type { Jar } from "@/modules/financial-base/engine/expense-jars";
import type { Period } from "@/modules/financial-base/types";

export function ExpenseJars({ jars, currency, period }: { jars: Jar[]; currency: string; period: Period }) {
  if (jars.length === 0) {
    return (
      <div className="muted" style={{ padding: "20px 24px", fontSize: 13 }}>
        Aún no hay categorías de gasto este mes.
      </div>
    );
  }
  return (
    <div className="exp-list">
      {jars.map((jar) => (
        <JarRow key={jar.group} jar={jar} currency={currency} period={period} />
      ))}
    </div>
  );
}
