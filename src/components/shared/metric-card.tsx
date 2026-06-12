/**
 * Card de métrica premium: valor grande, microcopy, variación y estado de color.
 * Reutilizable en todos los tabs de Base Financiera.
 */
export type MetricTone = "pos" | "warn" | "neg" | "neutral";

const TONE_COLOR: Record<MetricTone, string> = {
  pos: "var(--pos)",
  warn: "var(--warn)",
  neg: "var(--neg)",
  neutral: "var(--ink)",
};

export function MetricCard({
  label,
  value,
  sub,
  delta,
  deltaTone = "neutral",
  valueTone = "neutral",
}: {
  label: string;
  value: string;
  sub?: string;
  delta?: string;
  deltaTone?: MetricTone;
  valueTone?: MetricTone;
}) {
  return (
    <div className="card kpi" style={{ padding: "16px 18px" }}>
      <div className="label" style={{ fontSize: 11 }}>
        {label}
      </div>
      <div className="num-xl" style={{ fontSize: 25, marginTop: 9, color: TONE_COLOR[valueTone] }}>
        {value}
      </div>
      <div
        style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 7, flexWrap: "wrap" }}
      >
        {delta ? (
          <span
            className="tnum"
            style={{ fontSize: 11.5, fontWeight: 600, color: TONE_COLOR[deltaTone] }}
          >
            {delta}
          </span>
        ) : null}
        {sub ? (
          <span className="muted" style={{ fontSize: 11 }}>
            {sub}
          </span>
        ) : null}
      </div>
    </div>
  );
}
