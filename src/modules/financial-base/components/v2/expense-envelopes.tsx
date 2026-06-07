/**
 * Sobres de gasto (`.env`) estilo diseño Claude: barra presupuesto-vs-real por
 * categoría. Presentación pura (servidor); se alimenta de `TopRow[]` ya
 * calculado por el motor V2 (budget.expenseByKey vs real.expenseByKey).
 */
import { Icon } from "@/components/ui/icon";
import { formatMoney } from "@/lib/format";
import type { TopRow } from "@/modules/financial-base/engine/base-v2";

const PALETTE = ["var(--pos)", "var(--info)", "var(--warn)", "var(--c-networth)", "var(--teal)", "var(--gold)"];

function clampPct(real: number, budget: number): number {
  if (budget <= 0) return real > 0 ? 100 : 0;
  return Math.min(100, Math.round((real / budget) * 100));
}

export function ExpenseEnvelopes({ rows, currency }: { rows: TopRow[]; currency: string }) {
  if (rows.length === 0) {
    return (
      <div className="muted" style={{ padding: "20px 24px", fontSize: 13 }}>
        Aún no hay gastos por categoría este mes.
      </div>
    );
  }

  return (
    <div className="exp-list">
      {rows.map((r, i) => {
        const over = r.budget > 0 && r.real > r.budget;
        const color = over ? "var(--neg)" : PALETTE[i % PALETTE.length]!;
        const width = clampPct(r.real, r.budget);
        const remaining = r.budget - r.real;
        return (
          <div key={r.key} className={over ? "env over" : "env"}>
            <div
              className="env-ic"
              style={{ background: `color-mix(in srgb, ${color} 14%, transparent)`, color }}
            >
              <Icon name="expense" />
            </div>
            <div style={{ minWidth: 0 }}>
              <div className="env-name" style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {r.label}
              </div>
              {/* TODO(data): el diseño muestra sub-etiqueta descriptiva
                  (p. ej. "Renta · seguro") y meta Recurrente/Variable · Fijo/Auto.
                  V2 no guarda esa naturaleza por categoría → usamos el presupuesto. */}
              <div className="env-sub">
                {r.budget > 0 ? `Presupuestado ${formatMoney(r.budget, currency)}` : "Sin presupuesto"}
              </div>
            </div>
            <div className="env-bar-cell">
              <div className="bar-track">
                <div className="bar-fill" style={{ width: `${width}%`, background: color }} />
              </div>
              <div className="env-bar-meta">
                <span style={over ? { color: "var(--neg)" } : undefined}>{formatMoney(r.real, currency)} gastado</span>
                <span>
                  {over
                    ? `excedido ${formatMoney(Math.abs(remaining), currency)}`
                    : `${formatMoney(remaining, currency)} restante`}
                </span>
              </div>
            </div>
            <div className="env-num">
              <div className="big">{formatMoney(r.budget, currency)}</div>
              <div className="small">presupuestado</div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
