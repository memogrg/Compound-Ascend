import { Icon, type IconName } from "@/components/ui/icon";
import { dismissInsightAction } from "@/modules/dashboard/api/actions";

export type Observation = { id: string; severity: string; title: string; body: string };

/** Color de acento + icono por severidad (tokens del design system). */
const STYLE: Record<string, { color: string; icon: IconName }> = {
  celebrar: { color: "var(--pos)", icon: "check" },
  accionar: { color: "var(--neg)", icon: "bell" },
  observar: { color: "var(--warn)", icon: "info" },
  info: { color: "var(--muted)", icon: "info" },
};

/**
 * "Qué noté": observaciones conductuales recientes (memoria conductual, Fase 4).
 * Componente de servidor; el descarte va por server action en un <form>.
 */
export function Observations({ observations }: { observations: Observation[] }) {
  if (observations.length === 0) return null;

  return (
    <div className="card card-pad">
      <div className="card-title">Qué noté</div>
      <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 10 }}>
        {observations.map((o) => {
          const s = STYLE[o.severity] ?? STYLE.info!;
          return (
            <div
              key={o.id}
              style={{
                display: "flex",
                gap: 12,
                alignItems: "flex-start",
                border: "1px solid var(--line)",
                borderLeft: `3px solid ${s.color}`,
                borderRadius: 12,
                padding: "12px 14px",
              }}
            >
              <span style={{ color: s.color, flex: "none", marginTop: 1 }}>
                <Icon name={s.icon} width={2.4} />
              </span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13.5, fontWeight: 600, color: "var(--ink)", lineHeight: 1.4 }}>
                  {o.title}
                </div>
                <div className="muted" style={{ fontSize: 12.5, marginTop: 3, lineHeight: 1.5 }}>
                  {o.body}
                </div>
              </div>
              <form action={dismissInsightAction.bind(null, o.id)} style={{ flex: "none" }}>
                <button
                  type="submit"
                  className="btn btn-ghost"
                  style={{ fontSize: 12, padding: "5px 9px" }}
                  aria-label="Descartar observación"
                >
                  <Icon name="x" width={2.2} /> Descartar
                </button>
              </form>
            </div>
          );
        })}
      </div>
    </div>
  );
}
