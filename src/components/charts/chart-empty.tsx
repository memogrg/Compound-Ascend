import { AgentMark } from "@/components/ui/agent-mark";

/**
 * Estado vacío compartido de las gráficas: conserva el mensaje y añade el
 * isotipo C+ de fondo como marca de agua muy sutil (hereda color del tema vía
 * currentColor). Centraliza el "sin datos" de área/línea/dona.
 */
export function ChartEmpty({ message, height = 120 }: { message: string; height?: number }) {
  return (
    <div
      style={{
        position: "relative",
        height,
        display: "grid",
        placeItems: "center",
        overflow: "hidden",
      }}
    >
      <span
        aria-hidden="true"
        style={{
          position: "absolute",
          inset: 0,
          display: "grid",
          placeItems: "center",
          color: "var(--ink)",
          opacity: 0.05,
          pointerEvents: "none",
          fontSize: Math.min(height * 1.1, 168),
          lineHeight: 0,
        }}
      >
        <AgentMark />
      </span>
      <span
        className="muted"
        style={{ position: "relative", fontSize: 12.5, textAlign: "center", padding: "0 18px" }}
      >
        {message}
      </span>
    </div>
  );
}
