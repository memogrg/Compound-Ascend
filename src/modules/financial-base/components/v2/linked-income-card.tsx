/**
 * "Ingresos vinculados a inversiones" (tab Ingresos · read-only). Muestra las
 * fuentes de ingreso atadas a una inversión (dividendos auto-derivados o stubs
 * de renta/dividendos creados desde el registro). No se editan aquí: se
 * gestionan en Patrimonio. Evita que queden contados-pero-invisibles.
 */
import Link from "next/link";
import { Icon } from "@/components/ui/icon";
import { formatMoney } from "@/lib/format";
import type { BudgetItem } from "@/modules/financial-base/types";

const TIP =
  "Estos ingresos provienen de tus inversiones (dividendos o renta) y se gestionan en Patrimonio.";

export function LinkedIncomeCard({
  items,
  received,
}: {
  items: BudgetItem[];
  /** Recibido en la moneda NATIVA del ítem (sin convertir). */
  received: Record<string, number>;
}) {
  if (items.length === 0) return null;

  return (
    <div className="card">
      <div className="card-head">
        <div>
          <div className="card-title" style={{ display: "flex", alignItems: "center", gap: 6 }}>
            Ingresos vinculados a inversiones
            <span
              className="tip tip-wrap"
              data-tip={TIP}
              aria-label={TIP}
              style={{ display: "inline-flex", color: "var(--muted)", cursor: "help" }}
            >
              <Icon name="info" />
            </span>
          </div>
          <div className="card-sub">Se gestionan en Patrimonio · solo lectura</div>
        </div>
      </div>

      {items.map((b) => {
        const chip = b.sourceKind === "dividend" ? "Dividendos" : "Inversión";
        const got = received[b.id] ?? 0;
        return (
          <div
            key={b.id}
            className="list-row"
            style={{ gridTemplateColumns: "1fr auto auto", alignItems: "center", gap: 10 }}
          >
            <div style={{ minWidth: 0 }}>
              <div
                style={{
                  fontSize: 13.5,
                  fontWeight: 500,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                {b.name}
              </div>
              <span className="inc-tag" style={{ marginTop: 4, display: "inline-block" }}>
                {chip}
              </span>
            </div>
            <span className="tnum muted" style={{ fontSize: 12.5, whiteSpace: "nowrap" }}>
              {got > 0
                ? `${formatMoney(got, b.currency)} recibido`
                : `${formatMoney(b.amount, b.currency)} plan.`}
            </span>
            <Link
              className="btn btn-ghost"
              href="/patrimonio"
              style={{ fontSize: 12.5, padding: "6px 12px" }}
            >
              Ver inversión
            </Link>
          </div>
        );
      })}
    </div>
  );
}
