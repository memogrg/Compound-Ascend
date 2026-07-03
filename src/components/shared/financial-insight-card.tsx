import { Icon } from "@/components/ui/icon";
import { AgentMark } from "@/components/ui/agent-mark";

export type FinancialReading = {
  title: string;
  diagnosis: string;
  insights: string[];
  actions: string[];
  nextStep: string;
};

/** Card de "Lectura" financiera: diagnóstico + insights + acciones + próximo paso. */
export function FinancialInsightCard({ reading }: { reading: FinancialReading }) {
  return (
    <div className="card card-pad">
      <div className="row" style={{ justifyContent: "space-between", marginBottom: 6 }}>
        <div className="card-title">{reading.title}</div>
        <span className="chip-ai" style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
          <AgentMark /> My Agent C+
        </span>
      </div>
      <p style={{ fontSize: 14, lineHeight: 1.6, color: "var(--ink)", margin: "4px 0 14px" }}>
        {reading.diagnosis}
      </p>

      <div className="cols-2" style={{ gap: 16 }}>
        <Block title="Insights" items={reading.insights} icon="info" tone="var(--info)" />
        <Block title="Acciones" items={reading.actions} icon="check" tone="var(--pos)" />
      </div>

      {reading.nextStep ? (
        <div
          style={{
            marginTop: 14,
            padding: "12px 14px",
            borderRadius: 12,
            background: "color-mix(in srgb, var(--gold) 12%, transparent)",
            display: "flex",
            gap: 10,
            alignItems: "flex-start",
          }}
        >
          <span style={{ color: "var(--gold)", flex: "none", marginTop: 1 }}>
            <AgentMark />
          </span>
          <div>
            <div className="label" style={{ fontSize: 11 }}>
              Próximo mejor paso
            </div>
            <div style={{ fontSize: 13.5, color: "var(--ink)", marginTop: 3, lineHeight: 1.5 }}>
              {reading.nextStep}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function Block({
  title,
  items,
  icon,
  tone,
}: {
  title: string;
  items: string[];
  icon: "info" | "check";
  tone: string;
}) {
  if (items.length === 0) return null;
  return (
    <div>
      <div className="label" style={{ fontSize: 11, marginBottom: 8 }}>
        {title}
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {items.map((t, i) => (
          <div
            key={i}
            style={{
              display: "flex",
              gap: 9,
              alignItems: "flex-start",
              fontSize: 13,
              lineHeight: 1.5,
            }}
          >
            <span style={{ color: tone, flex: "none", marginTop: 1 }}>
              <Icon name={icon} width={2} />
            </span>
            <span style={{ color: "var(--ink-2)" }}>{t}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
