/**
 * Cabecera común de las páginas de Base Financiera: título + subtítulo y el
 * selector de periodo. Presentación pura (servidor); el PeriodSelector es
 * cliente y se renderiza como hijo.
 */
import { monthParam } from "@/modules/financial-base/engine/period";
import { PeriodSelector } from "@/modules/financial-base/components/v2/period-selector";
import type { Period } from "@/modules/financial-base/types";

export function BaseHeader({ title, sub, period }: { title: string; sub: string; period: Period }) {
  return (
    <div
      className="card card-pad"
      style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 16, flexWrap: "wrap" }}
    >
      <div>
        <div className="card-title">{title}</div>
        <div className="card-sub">{sub}</div>
      </div>
      <PeriodSelector current={monthParam(period)} />
    </div>
  );
}
