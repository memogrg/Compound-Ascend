import { Icon } from "@/components/ui/icon";
import { DeleteButton } from "./delete-button";
import { EditControlButton, AddControlButton } from "./control-actions";
import { formatMoney } from "@/lib/format";
import type { ControlSummary } from "@/modules/control/services/control-service";
import type { GoalAction, Semaforo } from "@/modules/control/types";

const SEMAFORO: Record<Semaforo, { label: string; color: string }> = {
  verde: { label: "Saludable", color: "var(--pos)" },
  amarillo: { label: "Requiere ajustes", color: "var(--warn)" },
  rojo: { label: "Acción urgente", color: "var(--neg)" },
};

const ACTION: Record<GoalAction, { label: string; color: string; bg: string }> = {
  mantener: { label: "Mantener", color: "var(--pos)", bg: "var(--pos-soft)" },
  acelerar: { label: "Acelerar", color: "var(--info)", bg: "var(--info-soft)" },
  reducir: { label: "Reducir", color: "var(--warn)", bg: "var(--warn-soft)" },
  pausar: { label: "Pausar", color: "var(--neg)", bg: "var(--neg-soft)" },
  convertir: { label: "Convertir a inversión", color: "var(--c-invest)", bg: "var(--info-soft)" },
  replantear: { label: "Replantear", color: "var(--warn)", bg: "var(--warn-soft)" },
};

const METHOD_LABEL: Record<string, string> = {
  avalancha: "Avalancha",
  bola_nieve: "Bola de nieve",
  hibrido: "Híbrido",
};

export function ControlDashboard({ summary }: { summary: ControlSummary }) {
  const { diagnosis: d, goals, debts, currency, indexRates } = summary;
  const sem = SEMAFORO[d.semaforo];

  return (
    <div className="grid">
      {/* Hero: score + próxima acción */}
      <section className="dash-hero">
        <div className="card card-pad" style={{ display: "flex", alignItems: "center", gap: 22 }}>
          <div className="ring-wrap">
            <svg width="120" height="120" viewBox="0 0 42 42">
              <circle cx="21" cy="21" r="15.915" fill="none" stroke="var(--chip)" strokeWidth="4" />
              <circle
                cx="21"
                cy="21"
                r="15.915"
                fill="none"
                stroke={sem.color}
                strokeWidth="4"
                strokeLinecap={d.scoreControl >= 100 ? "butt" : "round"}
                pathLength={100}
                strokeDasharray={`${d.scoreControl} 100`}
                strokeDashoffset="25"
                transform="rotate(-90 21 21)"
              />
            </svg>
            <div className="ring-center">
              <div>
                <div className="num-xl" style={{ fontSize: 38 }}>
                  {d.scoreControl}
                </div>
                <div style={{ fontSize: 10, color: "var(--muted)" }}>/ 100</div>
              </div>
            </div>
          </div>
          <div>
            <div className="label">Score de Control</div>
            <div
              className="chip"
              style={{ marginTop: 8, background: "color-mix(in srgb," + sem.color + " 16%, transparent)", color: sem.color }}
            >
              ● {sem.label}
            </div>
            <p className="muted" style={{ fontSize: 12.5, marginTop: 10, lineHeight: 1.5 }}>
              {d.diagnosis}
            </p>
          </div>
        </div>

        <div className="card card-pad">
          <div className="row" style={{ justifyContent: "space-between", marginBottom: 10 }}>
            <div className="card-title">Tu próxima mejor acción</div>
            <span
              className="chip"
              style={{ background: "linear-gradient(140deg,var(--pos-soft),var(--info-soft))", color: "var(--ink-2)" }}
            >
              Motor de Prioridad
            </span>
          </div>
          <p style={{ fontSize: 15, lineHeight: 1.55, color: "var(--ink)", margin: "0 0 12px" }}>
            {d.nextBestAction}
          </p>
          <div style={{ fontSize: 12.5, color: "var(--muted)", lineHeight: 1.5 }}>
            <strong style={{ color: "var(--ink-2)" }}>Por qué:</strong> {d.impact}
          </div>
        </div>
      </section>

      {/* Orden recomendado del flujo libre */}
      <div className="card card-pad">
        <div className="card-title">Orden recomendado de tu flujo libre</div>
        <div className="card-sub" style={{ marginBottom: 12 }}>
          Flujo libre disponible: {formatMoney(summary.freeCashflow, currency)} / mes
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {d.allocation.map((a, i) => (
            <div key={i} style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <span
                style={{
                  width: 22,
                  height: 22,
                  borderRadius: 999,
                  background: "var(--chip)",
                  color: "var(--ink-2)",
                  display: "grid",
                  placeItems: "center",
                  fontSize: 11,
                  fontWeight: 600,
                  flex: "none",
                }}
              >
                {i + 1}
              </span>
              <span style={{ fontSize: 13.5, color: "var(--ink-2)", flex: 1 }}>
                {a.label}
                {a.note ? <span className="muted" style={{ fontSize: 12 }}> · {a.note}</span> : null}
              </span>
              {a.amount > 0 ? (
                <span className="tnum" style={{ fontSize: 13.5, fontWeight: 500 }}>
                  {formatMoney(a.amount, currency)}
                </span>
              ) : null}
            </div>
          ))}
        </div>
      </div>

      {/* Alertas de contradicción */}
      {d.alerts.length > 0 ? (
        <div className="card card-pad">
          <div className="card-title">Alertas</div>
          <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 8 }}>
            {d.alerts.map((a, i) => (
              <div key={i} style={{ display: "flex", gap: 10, alignItems: "flex-start", fontSize: 13, color: "var(--ink-2)" }}>
                <span style={{ color: "var(--warn)", flex: "none" }}>
                  <Icon name="bell" width={2} />
                </span>
                {a}
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {/* Objetivos y deudas */}
      <section className="dash-split">
        <div className="card">
          <div className="card-head">
            <div>
              <div className="card-title">Objetivos activos</div>
              <div className="card-sub">{goals.length} objetivo(s)</div>
            </div>
          </div>
          {goals.length === 0 ? (
            <Empty
              text="Aún no agregas objetivos de ahorro."
              action={<AddControlButton kind="goal" currency={currency} label="Agregar objetivo" />}
            />
          ) : (
            goals.map((g) => {
              const rec = d.goalRecs.find((r) => r.goalId === g.id);
              const a = rec ? ACTION[rec.action] : ACTION.mantener;
              const progress = g.targetAmount > 0 ? Math.min(100, (g.currentAmount / g.targetAmount) * 100) : 0;
              return (
                <div key={g.id} className="list-row" style={{ gridTemplateColumns: "1fr auto" }}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                      <span style={{ fontSize: 13.5, fontWeight: 500 }}>{g.name}</span>
                      <span className="chip" style={{ background: a.bg, color: a.color }}>
                        {a.label}
                      </span>
                    </div>
                    <div className="bar-track" style={{ marginTop: 8, maxWidth: 260 }}>
                      <div className="bar-fill" style={{ width: `${progress}%`, background: "var(--c-savings)" }} />
                    </div>
                    <div className="muted" style={{ fontSize: 11.5, marginTop: 6, lineHeight: 1.45 }}>
                      {formatMoney(g.currentAmount, g.currency)} / {formatMoney(g.targetAmount, g.currency)} · {rec?.reason}
                    </div>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <EditControlButton kind="goal" item={g} currency={currency} />
                    <DeleteButton id={g.id} kind="goal" />
                  </div>
                </div>
              );
            })
          )}
        </div>

        <div className="card">
          <div className="card-head">
            <div>
              <div className="card-title">Obligaciones y deudas</div>
              <div className="card-sub">
                {debts.length} deuda(s)
                {d.debtMethod ? ` · método sugerido: ${METHOD_LABEL[d.debtMethod.method]}` : ""}
              </div>
            </div>
          </div>
          {debts.length === 0 ? (
            <Empty text="No registras deudas. ¡Bien!" />
          ) : (
            debts.map((dt) => (
              <div key={dt.id} className="list-row" style={{ gridTemplateColumns: "1fr auto auto" }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 13.5, fontWeight: 500 }}>{dt.name}</div>
                  <div className="muted" style={{ fontSize: 11.5, marginTop: 2 }}>
                    {formatMoney(dt.balance, dt.currency)}
                    {dt.apr ? ` · ${dt.apr}% TAE` : ""}
                    {dt.delinquency && dt.delinquency !== "no" ? " · con atraso" : ""}
                  </div>
                </div>
                {(dt.apr ?? 0) >= 30 ? (
                  <span className="chip" style={{ background: "var(--neg-soft)", color: "var(--neg)" }}>
                    Crítica
                  </span>
                ) : (
                  <span className="chip">Controlada</span>
                )}
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <EditControlButton kind="debt" item={dt} currency={currency} indexRates={indexRates} />
                  <DeleteButton id={dt.id} kind="debt" />
                </div>
              </div>
            ))
          )}
          {d.debtMethod ? (
            <div className="muted" style={{ padding: "12px 24px", fontSize: 12, lineHeight: 1.5, borderTop: "1px solid var(--line)" }}>
              {d.debtMethod.reason}
            </div>
          ) : null}
        </div>
      </section>

      {/* Plan de 30 días */}
      <div className="card card-pad">
        <div className="card-title">Tu plan de 30 días</div>
        <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 10 }}>
          {d.plan30.map((step, i) => (
            <div key={i} style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
              <span style={{ color: "var(--pos)", flex: "none", marginTop: 1 }}>
                <Icon name="check" width={2.4} />
              </span>
              <span style={{ fontSize: 13.5, color: "var(--ink-2)", lineHeight: 1.5 }}>{step}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function Empty({ text, action }: { text: string; action?: React.ReactNode }) {
  return (
    <div className="muted" style={{ padding: "20px 24px", fontSize: 13, display: "grid", gap: 12, justifyItems: "start" }}>
      <span>{text}</span>
      {action}
    </div>
  );
}
