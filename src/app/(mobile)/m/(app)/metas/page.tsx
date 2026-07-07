import { getControlSummary } from "@/modules/control";
import { formatMoney } from "@/lib/format";

/**
 * /m/metas — "Metas": metas de ahorro con progreso + lectura del MOTOR DE
 * PRIORIDADES. Reutiliza el barrel control (getControlSummary: goals +
 * diagnosis del priority-engine). Sin reimplementar cálculos. Piel del diseño
 * (data-screen="metas"), es-MX "tú", tema claro.
 */
export const dynamic = "force-dynamic"; // datos por sesión

const SEMAFORO: Record<string, { label: string; color: string }> = {
  verde: { label: "Saludable", color: "var(--accent)" },
  amarillo: { label: "Atención", color: "var(--warning)" },
  rojo: { label: "En riesgo", color: "var(--danger)" },
};
const STATUS_BADGE: Record<string, string> = {
  saludable: "up",
  atrasado: "neutral",
  no_viable: "down",
  revisar: "neutral",
};

function fmtMonth(iso: string | null | undefined): string {
  if (!iso) return "Sin fecha límite";
  return new Date(`${iso}T00:00:00`).toLocaleDateString("es-MX", { month: "long", year: "numeric" });
}

export default async function MobileMetas() {
  const summary = await getControlSummary();
  const { goals, diagnosis } = summary;
  const sem = SEMAFORO[diagnosis.semaforo] ?? SEMAFORO.amarillo!;

  return (
    <div className="m-scroll">
      <div className="m-pad">
        <div className="between" style={{ marginBottom: 16 }}>
          <div>
            <div className="ov">Ahorro</div>
            <div className="h-title" style={{ marginTop: 6 }}>
              Metas
            </div>
          </div>
        </div>

        {/* Motor de prioridades */}
        <div className="card card-p" style={{ marginBottom: 16, background: "var(--accent-soft)", borderColor: "transparent" }}>
          <div className="between" style={{ marginBottom: 8 }}>
            <span className="ov" style={{ color: sem.color }}>
              Prioridades · {sem.label}
            </span>
            <span className="display" style={{ fontSize: 20, color: sem.color }}>
              {diagnosis.scoreControl}
            </span>
          </div>
          <div style={{ fontSize: 13.5, lineHeight: 1.5 }}>{diagnosis.nextBestAction}</div>
        </div>

        {/* Metas */}
        {goals.length === 0 ? (
          <div className="card card-p">
            <div className="muted" style={{ fontSize: 13.5, lineHeight: 1.5 }}>
              Aún no tienes metas de ahorro. Crea una para ponerle nombre y fecha a lo que quieres lograr.
            </div>
          </div>
        ) : (
          goals.map((g) => {
            const pct = g.targetAmount > 0 ? Math.min(1, g.currentAmount / g.targetAmount) : 0;
            const missing = Math.max(0, g.targetAmount - g.currentAmount);
            const months = g.monthlyContribution > 0 ? Math.ceil(missing / g.monthlyContribution) : null;
            const badgeCls = STATUS_BADGE[g.status] ?? "neutral";
            return (
              <div className="goal" style={{ marginBottom: 14 }} key={g.id}>
                <div className="gtop">
                  <span
                    className="gemoji"
                    style={{ background: "var(--accent-soft)", color: "var(--accent)" }}
                    aria-hidden
                  >
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
                      <circle cx="12" cy="12" r="9" />
                      <circle cx="12" cy="12" r="4" />
                    </svg>
                  </span>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 700, fontSize: 15 }}>{g.name}</div>
                    <div className="muted" style={{ fontSize: 12 }}>
                      {fmtMonth(g.targetDate)}
                    </div>
                  </div>
                  <span className={`badge ${badgeCls}`}>{Math.round(pct * 100)}%</span>
                </div>
                <div className="between" style={{ marginBottom: 8 }}>
                  <div className="display" style={{ fontSize: 22 }}>
                    {formatMoney(g.currentAmount, g.currency)}
                  </div>
                  <div className="muted mono" style={{ fontSize: 12 }}>
                    de {formatMoney(g.targetAmount, g.currency)}
                  </div>
                </div>
                <div className="bar" style={{ height: 9 }}>
                  <i style={{ width: `${Math.round(pct * 100)}%`, background: "linear-gradient(90deg, var(--s1), var(--s5))" }} />
                </div>
                <div className="between" style={{ marginTop: 10 }}>
                  <span className="muted" style={{ fontSize: 11.5 }}>
                    Faltan {formatMoney(missing, g.currency)}
                  </span>
                  {months != null && (
                    <span className="mono" style={{ fontSize: 11.5, color: "var(--text-muted)" }}>
                      {months} {months === 1 ? "mes" : "meses"}
                    </span>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
