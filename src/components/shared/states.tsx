/**
 * Estados compartidos: vacío, error y carga (skeleton).
 * Mantienen el lenguaje humano y el estilo premium del design system.
 */
import type { IconName } from "@/components/ui/icon";
import { Icon } from "@/components/ui/icon";

export function EmptyState({
  icon = "spark",
  title,
  description,
  action,
}: {
  icon?: IconName;
  title: string;
  description: string;
  action?: React.ReactNode;
}) {
  return (
    <div
      className="card card-pad"
      style={{ textAlign: "center", display: "grid", placeItems: "center", gap: 12, padding: "48px 24px" }}
    >
      <div
        style={{
          width: 48,
          height: 48,
          borderRadius: 14,
          display: "grid",
          placeItems: "center",
          background: "linear-gradient(140deg, var(--pos), var(--teal))",
          color: "white",
        }}
      >
        <Icon name={icon} filled={icon === "spark"} />
      </div>
      <div className="card-title" style={{ fontSize: 17 }}>
        {title}
      </div>
      <div className="muted" style={{ fontSize: 13, maxWidth: 420, lineHeight: 1.55 }}>
        {description}
      </div>
      {action ? <div style={{ marginTop: 6 }}>{action}</div> : null}
    </div>
  );
}

export function ErrorState({
  title = "Algo salió mal",
  description = "No pudimos cargar esta sección. Inténtalo de nuevo.",
  onRetry,
}: {
  title?: string;
  description?: string;
  onRetry?: () => void;
}) {
  return (
    <div className="card card-pad" style={{ textAlign: "center", padding: "40px 24px" }}>
      <div className="card-title" style={{ fontSize: 16 }}>
        {title}
      </div>
      <div className="muted" style={{ fontSize: 13, marginTop: 8 }}>
        {description}
      </div>
      {onRetry ? (
        <button className="btn btn-secondary" style={{ marginTop: 16 }} onClick={onRetry}>
          Reintentar
        </button>
      ) : null}
    </div>
  );
}

export function LoadingSkeleton({ height = 120 }: { height?: number }) {
  return (
    <div
      className="card"
      style={{ height, position: "relative", overflow: "hidden" }}
      aria-busy="true"
      aria-label="Cargando"
    />
  );
}
