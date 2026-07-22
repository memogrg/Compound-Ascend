import { Icon } from "@/components/ui/icon";
import { DeleteButton } from "./delete-button";
// Fase 4.1 (interconexión): botón Retirar — aditivo, coordinar con el owner
// de esta pantalla. El componente es autocontenido (goal-withdraw-button).
import { GoalWithdrawButton } from "./goal-withdraw-button";
import { GoalSpendButton } from "./goal-spend-button";
import { GoalDetailButton } from "./goal-detail-button";
import { EditControlButton, AddControlButton } from "./control-actions";
import { formatMoney } from "@/lib/format";
import { groupByJar, type CategoryNode } from "@/modules/financial-base";
import type { ControlSummary } from "@/modules/control/services/control-service";
import type { GoalAction, SavingsGoal, Semaforo } from "@/modules/control/types";

const SEMAFORO: Record<Semaforo, { label: string; color: string }> = {
  verde: { label: "Saludable", color: "var(--pos)" },
  amarillo: { label: "Requiere ajustes", color: "var(--warn)" },
  rojo: { label: "Acción urgente", color: "var(--neg)" },
};

const RECURRENCE_LABEL: Record<string, string> = {
  mensual: "Mensual",
  trimestral: "Trimestral",
  semestral: "Semestral",
  anual: "Anual",
};

function fmtResetDate(iso: string): string {
  return new Date(`${iso}T00:00:00`).toLocaleDateString("es-CR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

const ACTION: Record<GoalAction, { label: string; color: string; bg: string }> = {
  mantener: { label: "Mantener", color: "var(--pos)", bg: "var(--pos-soft)" },
  acelerar: { label: "Acelerar", color: "var(--info)", bg: "var(--info-soft)" },
  reducir: { label: "Reducir", color: "var(--warn)", bg: "var(--warn-soft)" },
  pausar: { label: "Pausar", color: "var(--neg)", bg: "var(--neg-soft)" },
  convertir: { label: "Convertir a inversión", color: "var(--c-invest)", bg: "var(--info-soft)" },
  replantear: { label: "Replantear", color: "var(--warn)", bg: "var(--warn-soft)" },
};

export function ControlDashboard({
  summary,
  tree,
}: {
  summary: ControlSummary;
  /** Árbol de categorías para agrupar los objetivos por frasco (reusa groupByJar). */
  tree: CategoryNode[];
}) {
  const { diagnosis: d, goals, currency } = summary;
  const sem = SEMAFORO[d.semaforo];
  // "Objetivos activos" agrupados por frasco (default_category_id → frasco padre),
  // "Generales" primero. Mismo agrupador que los sobres de /gastos (groupByJar).
  const goalSections = groupByJar(goals, (g) => g.defaultCategoryId, tree);

  return (
    <div className="grid">
      {/* Hero: score + próxima acción */}
      <section className="dash-hero">
        <div className="card card-pad" style={{ display: "flex", alignItems: "center", gap: 22 }}>
          <div className="ring-wrap">
            <svg width="132" height="132" viewBox="0 0 42 42">
              <circle
                cx="21"
                cy="21"
                r="15.915"
                fill="none"
                stroke="var(--surface-2)"
                strokeWidth="4"
              />
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
            <div className="label">
              Score de Control
              <span
                className="tip"
                data-tip="Mide qué tan bajo control están tus ahorros y deudas (0-100): metas avanzando, deudas al día y flujo libre bien dirigido suben el score."
                style={{ width: 15, height: 15, borderRadius: "50%", border: "1px solid var(--line)", display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: 10, color: "var(--muted)", marginLeft: 6, verticalAlign: "middle" }}
              >
                ?
              </span>
            </div>
            <div
              className="chip"
              style={{
                marginTop: 8,
                fontWeight: 700,
                background: "color-mix(in srgb," + sem.color + " 16%, transparent)",
                color: sem.color,
              }}
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
            <span className="chip-ai">Motor de Prioridad</span>
          </div>
          <p style={{ fontSize: 15, lineHeight: 1.55, color: "var(--ink)", margin: "0 0 12px" }}>
            {d.nextBestAction}
          </p>
          <div
            style={{
              fontSize: 12.5,
              color: "var(--text-muted)",
              lineHeight: 1.5,
              paddingTop: 12,
              borderTop: "1px solid var(--border)",
            }}
          >
            <strong style={{ color: "var(--success)" }}>Por qué:</strong> {d.impact}
          </div>
        </div>
      </section>

      {/* Orden recomendado del flujo libre */}
      <div className="card card-pad">
        <div className="card-title">
          Orden recomendado de tu flujo libre
          <span
                className="tip"
                data-tip="El Motor de Prioridad ordena a dónde dirigir cada colón libre del mes: primero lo urgente (deuda cara, fondo de emergencia) y luego tus metas."
                style={{ width: 15, height: 15, borderRadius: "50%", border: "1px solid var(--line)", display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: 10, color: "var(--muted)", marginLeft: 6, verticalAlign: "middle" }}
              >
                ?
              </span>
        </div>
        <div className="card-sub" style={{ marginBottom: 12 }}>
          Flujo libre disponible: {formatMoney(summary.freeCashflow, currency)} / mes
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {d.allocation.map((a, i) => (
            <div key={i} style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <span
                style={{
                  width: 28,
                  height: 28,
                  borderRadius: 999,
                  background: "var(--accent-soft)",
                  color: "var(--accent)",
                  display: "grid",
                  placeItems: "center",
                  fontFamily: "var(--font-display)",
                  fontSize: 13,
                  fontWeight: 700,
                  flex: "none",
                }}
              >
                {i + 1}
              </span>
              <span style={{ fontSize: 13.5, color: "var(--ink-2)", flex: 1 }}>
                {a.label}
                {a.note ? (
                  <span className="muted" style={{ fontSize: 12 }}>
                    {" "}
                    · {a.note}
                  </span>
                ) : null}
              </span>
              {a.amount > 0 ? (
                <span
                  className="tnum"
                  style={{ fontFamily: "var(--font-mono)", fontSize: 13, fontWeight: 700 }}
                >
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
          <div style={{ marginTop: 4 }}>
            {d.alerts.map((a, i) => (
              <div key={i} className="li-ic alert">
                <span className="ic">
                  <Icon name="bell" width={2} />
                </span>
                <div className="tx">{a}</div>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {/* Objetivos */}
      <section>
        <div className="card">
          <div className="card-head">
            <div>
              <div className="card-title">Objetivos activos</div>
              <div className="card-sub">{goals.length} objetivo(s)</div>
            </div>
            {/* Botón permanente: siempre montado, también recibe el deep-link
                ?new=goal aunque ya existan objetivos. */}
            <AddControlButton
              kind="goal"
              currency={currency}
              label="Agregar objetivo"
              deepLinkKey="goal"
            />
          </div>
          {goals.length === 0 ? (
            <Empty text="Aún no agregas objetivos de ahorro." />
          ) : (
            // La inset (antes en .goals-grid) vive acá: encabezado de sección y tarjetas
            // comparten el mismo margen, y cada .goals-grid queda sin padding propio.
            <div style={{ display: "grid", gap: 18, padding: "16px 18px 18px" }}>
              {goalSections.map((section) => (
                <div key={section.key}>
                  <div
                    className="muted"
                    style={{
                      fontSize: 11.5,
                      fontWeight: 700,
                      letterSpacing: ".05em",
                      textTransform: "uppercase",
                      marginBottom: 8,
                    }}
                  >
                    {section.name}
                  </div>
                  <div className="goals-grid">
                    {section.items.map((g) => (
                      <GoalCard key={g.id} g={g} d={d} currency={currency} />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* Plan de 30 días */}
      <div className="card card-pad">
        <div className="card-title">Tu plan de 30 días</div>
        <div style={{ marginTop: 4 }}>
          {d.plan30.map((step, i) => (
            <div key={i} className="li-ic plan">
              <span className="ic">
                <Icon name="check" width={2.4} />
              </span>
              <div className="tx">{step}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/** Tarjeta de un objetivo (idéntica a antes); extraída para agrupar por frasco. */
function GoalCard({
  g,
  d,
  currency,
}: {
  g: SavingsGoal;
  d: ControlSummary["diagnosis"];
  currency: string;
}) {
  const rec = d.goalRecs.find((r) => r.goalId === g.id);
  const a = rec ? ACTION[rec.action] : ACTION.mantener;
  // Un sobre acumula sin meta: no hay barra ni % de progreso.
  const isSobre = g.kind === "sobre" || g.targetAmount <= 0;
  const progress = g.targetAmount > 0 ? Math.min(100, (g.currentAmount / g.targetAmount) * 100) : 0;
  return (
    <div className="goal">
      <div className="gt">
        <span className="gn">{g.name}</span>
        <span className="chip" style={{ background: a.bg, color: a.color, fontWeight: 700 }}>
          {a.label}
        </span>
      </div>
      {isSobre ? null : (
        <div className="bar">
          <div className="fl" style={{ width: `${progress}%` }} />
        </div>
      )}
      <div className="gs">
        <span className="gnum">{formatMoney(g.currentAmount, g.currency)}</span>
        {isSobre ? (
          <span className="muted"> · acumulado (sobre)</span>
        ) : (
          <> / {formatMoney(g.targetAmount, g.currency)}</>
        )}
        {rec?.reason ? <> · {rec.reason}</> : null}
      </div>
      {g.recurrence && g.recurrence !== "ninguna" ? (
        <div
          className="gs tip tip-wrap"
          data-tip="Frasco recurrente: al llegar la fecha, la meta se restaura al monto del período y lo no gastado se arrastra."
          style={{ display: "inline-flex", alignItems: "center", gap: 6, cursor: "help" }}
        >
          <span
            className="chip"
            style={{ background: "var(--info-soft)", color: "var(--info)", fontWeight: 700 }}
          >
            {RECURRENCE_LABEL[g.recurrence] ?? "Recurrente"}
          </span>
          {g.nextResetOn ? (
            <span className="muted">Próximo reinicio: {fmtResetDate(g.nextResetOn)}</span>
          ) : null}
        </div>
      ) : null}
      {/* Referencia "dónde está el dinero" (stored_in), discreta y solo si tiene valor. */}
      {g.storedIn ? (
        <div className="muted" style={{ fontSize: 11.5, marginTop: 2 }}>
          {g.storedIn}
        </div>
      ) : null}
      <div className="acts">
        <GoalDetailButton goal={g} />
        <GoalSpendButton goal={g} />
        <GoalWithdrawButton goal={g} />
        <EditControlButton kind="goal" item={g} currency={currency} />
        <DeleteButton id={g.id} kind="goal" />
      </div>
    </div>
  );
}

function Empty({ text, action }: { text: string; action?: React.ReactNode }) {
  return (
    <div
      className="muted"
      style={{
        padding: "20px 24px",
        fontSize: 13,
        display: "grid",
        gap: 12,
        justifyItems: "start",
      }}
    >
      <span>{text}</span>
      {action}
    </div>
  );
}
