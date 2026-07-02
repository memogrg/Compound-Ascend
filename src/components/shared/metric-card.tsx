/**
 * Card de métrica premium: valor grande, microcopy, variación y estado de color.
 * Reutilizable en todos los tabs de Base Financiera.
 */
export type MetricTone = "pos" | "warn" | "neg" | "neutral";

const TONE_COLOR: Record<MetricTone, string> = {
  pos: "var(--success)",
  warn: "var(--warning)",
  neg: "var(--danger)",
  neutral: "var(--text)",
};

const DLT_CLASS: Record<MetricTone, string> = {
  pos: "dlt up",
  warn: "dlt warn",
  neg: "dlt down",
  neutral: "dlt",
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
    <div className="card kpi" style={{ padding: "15px 16px" }}>
      <div className="met-k">{label}</div>
      <div className="num-xl" style={{ fontSize: 22, marginTop: 9, color: TONE_COLOR[valueTone] }}>
        {value}
      </div>
      <div
        style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 6, flexWrap: "wrap" }}
      >
        {delta ? (
          <span className={DLT_CLASS[deltaTone]}>
            {deltaTone === "pos" || deltaTone === "neg" || deltaTone === "warn" ? (
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="3"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d={deltaTone === "pos" ? "m6 15 6-6 6 6" : "m6 9 6 6 6-6"} />
              </svg>
            ) : null}
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
