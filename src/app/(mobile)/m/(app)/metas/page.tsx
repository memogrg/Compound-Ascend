import { getControlSummary } from "@/modules/control";
import { getDisplayCurrency } from "@/modules/financial-base";
import { MobileHeader } from "../../components/mobile-header";
import { GoalManager } from "./goal-manager";

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
export default async function MobileMetas() {
  const [summary, currency] = await Promise.all([getControlSummary(), getDisplayCurrency()]);
  const { goals, diagnosis } = summary;
  const sem = SEMAFORO[diagnosis.semaforo] ?? SEMAFORO.amarillo!;

  return (
    <div className="m-scroll">
      <div className="m-pad">
        <MobileHeader variant="inner" eyebrow="Control" title="Ahorro" />

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

        {/* Metas gestionables: SwipeRow (editar/eliminar) + Aporte/Retirar + FAB de alta */}
        <div className="between" style={{ marginBottom: 6 }}>
          <div className="sec-title">Tus metas</div>
          {goals.length > 0 && (
            <span className="muted" style={{ fontSize: 12.5, fontWeight: 600 }}>
              {goals.length} {goals.length === 1 ? "meta" : "metas"}
            </span>
          )}
        </div>
        <GoalManager goals={goals} currency={currency} />
      </div>
    </div>
  );
}
