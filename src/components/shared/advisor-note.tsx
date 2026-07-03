import { AgentMark } from "@/components/ui/agent-mark";

type Accent = "pos" | "warn" | "neg" | "muted";

const ACCENT: Record<Accent, string> = {
  pos: "var(--pos)",
  warn: "var(--warn)",
  neg: "var(--neg)",
  muted: "var(--muted)",
};

/**
 * Nota del asesor (My Agent C+) embebida en una pantalla: recomendación corta en
 * su tono, con marca de color por intención. Componente de servidor reutilizable.
 */
export function AdvisorNote({
  title,
  body,
  accent = "pos",
}: {
  title: string;
  body: string;
  accent?: Accent;
}) {
  const color = ACCENT[accent];
  return (
    <div
      className="card card-pad"
      style={{ borderLeft: `3px solid ${color}`, display: "flex", gap: 12, alignItems: "flex-start" }}
    >
      <span style={{ color, flex: "none", marginTop: 2 }}>
        <AgentMark />
      </span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div className="label" style={{ fontSize: 11, color, letterSpacing: 0.3 }}>
          My Agent C+
        </div>
        <div style={{ fontSize: 14, fontWeight: 600, color: "var(--ink)", marginTop: 4, lineHeight: 1.4 }}>
          {title}
        </div>
        <p className="muted" style={{ fontSize: 13, marginTop: 4, lineHeight: 1.6 }}>
          {body}
        </p>
      </div>
    </div>
  );
}
