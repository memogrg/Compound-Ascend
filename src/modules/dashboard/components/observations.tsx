import { Icon, type IconName } from "@/components/ui/icon";
import { dismissInsightAction } from "@/modules/dashboard/api/actions";

export type Observation = { id: string; severity: string; title: string; body: string };

/** Clase de severidad + icono (los colores viven en CSS: .obs-card.sev-*). */
const STYLE: Record<string, { sev: string; icon: IconName }> = {
  celebrar: { sev: "sev-celebrar", icon: "check" },
  accionar: { sev: "sev-accionar", icon: "bell" },
  observar: { sev: "sev-observar", icon: "info" },
  info: { sev: "sev-info", icon: "info" },
};

/**
 * Observaciones conductuales recientes (memoria conductual, Fase 4) como
 * cards sueltas v2 con borde de severidad. Componente de servidor; el
 * descarte va por server action en un <form>.
 */
export function Observations({ observations }: { observations: Observation[] }) {
  if (observations.length === 0) {
    return (
      <div className="obs">
        <div className="obs-empty">
          <Icon name="check" width={2.4} />
          Estás al día — sin acciones pendientes.
        </div>
      </div>
    );
  }

  return (
    <div className="obs">
      {observations.map((o) => {
        const s = STYLE[o.severity] ?? STYLE.info!;
        return (
          <div key={o.id} className={`obs-card ${s.sev}`}>
            <span className="oi">
              <Icon name={s.icon} width={2.2} />
            </span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <h4>{o.title}</h4>
              <p>{o.body}</p>
            </div>
            <form action={dismissInsightAction.bind(null, o.id)} style={{ flex: "none" }}>
              <button type="submit" className="dis" aria-label="Descartar observación">
                Descartar
              </button>
            </form>
          </div>
        );
      })}
    </div>
  );
}
