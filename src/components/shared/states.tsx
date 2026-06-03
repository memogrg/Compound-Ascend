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

/** Bloque base con shimmer. `aria-hidden` porque el contenedor ya anuncia "Cargando". */
export function Skel({
  h = 16,
  w = "100%",
  r = 8,
  style,
}: {
  h?: number | string;
  w?: number | string;
  r?: number;
  style?: React.CSSProperties;
}) {
  return <div className="skel" aria-hidden style={{ height: h, width: w, borderRadius: r, ...style }} />;
}

export function LoadingSkeleton({ height = 120 }: { height?: number }) {
  return <Skel h={height} r={16} />;
}

function SkelCard({ children, minHeight }: { children: React.ReactNode; minHeight?: number }) {
  return (
    <div className="card card-pad" style={{ minHeight, display: "grid", gap: 14, alignContent: "start" }}>
      {children}
    </div>
  );
}

/**
 * Skeleton de página de módulo: cabecera + fila de KPIs + dos tarjetas de
 * contenido. Refleja el layout real para evitar un salto brusco al cargar.
 * Se usa como fallback de Suspense (loading.tsx) mientras el servidor agrega
 * los datos (incluida la consulta de tasas de cambio).
 */
export function ModuleSkeleton({ kpis = 4 }: { kpis?: number }) {
  return (
    <div className="grid" aria-busy="true">
      <span className="sr-only" role="status">
        Cargando…
      </span>

      <div
        className="card card-pad"
        style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 16, flexWrap: "wrap" }}
      >
        <div style={{ display: "grid", gap: 9 }}>
          <Skel h={16} w={190} />
          <Skel h={12} w={280} />
        </div>
        <Skel h={38} w={150} r={11} />
      </div>

      <section className="cols-4">
        {Array.from({ length: kpis }).map((_, i) => (
          <div key={i} className="card kpi" style={{ padding: "16px 18px", display: "grid", gap: 12 }}>
            <Skel h={11} w={90} />
            <Skel h={26} w={130} />
            <Skel h={10} w={70} />
          </div>
        ))}
      </section>

      <section className="cols-2">
        <SkelCard minHeight={260}>
          <Skel h={14} w={170} />
          <Skel h={170} r={14} />
        </SkelCard>
        <SkelCard minHeight={260}>
          <Skel h={14} w={170} />
          <Skel h={170} r={14} />
        </SkelCard>
      </section>
    </div>
  );
}
