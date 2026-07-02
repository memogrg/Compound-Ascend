import { Icon } from "@/components/ui/icon";
import { PREMIUM_BENEFITS } from "@/lib/plan";

/**
 * Upsell ético a Premium. Se muestra DESPUÉS de dar valor (diagnóstico/uso),
 * nunca bloqueando lo esencial. Mensaje claro, sin presión.
 */
export function UpgradePrompt({ compact = false }: { compact?: boolean }) {
  return (
    <div
      className="card card-pad"
      style={{
        background:
          "linear-gradient(140deg, color-mix(in srgb,var(--gold) 12%, var(--surface)), var(--surface))",
        border: "1px solid color-mix(in srgb,var(--gold) 30%, var(--line))",
      }}
    >
      <div className="row" style={{ gap: 10 }}>
        <span
          style={{
            width: 28,
            height: 28,
            borderRadius: 8,
            display: "grid",
            placeItems: "center",
            background: "var(--gold)",
            color: "white",
          }}
        >
          <Icon name="spark" filled width={0} />
        </span>
        <div className="card-title">CARTERA+ Premium</div>
      </div>
      {!compact ? (
        <ul
          style={{
            margin: "14px 0 0",
            padding: 0,
            listStyle: "none",
            display: "flex",
            flexDirection: "column",
            gap: 8,
          }}
        >
          {PREMIUM_BENEFITS.map((b) => (
            <li
              key={b}
              style={{
                display: "flex",
                gap: 10,
                alignItems: "flex-start",
                fontSize: 13,
                color: "var(--ink-2)",
              }}
            >
              <span style={{ color: "var(--pos)", flex: "none", marginTop: 1 }}>
                <Icon name="check" width={2.4} />
              </span>
              {b}
            </li>
          ))}
        </ul>
      ) : null}
      <p className="muted" style={{ fontSize: 12, marginTop: 12, lineHeight: 1.5 }}>
        Tu diagnóstico y tus módulos siempre son gratuitos. Premium suma acompañamiento avanzado
        cuando lo necesites.
      </p>
      <button
        className="btn btn-primary"
        style={{ marginTop: 8 }}
        disabled
        title="Pagos próximamente"
      >
        Mejorar a Premium
      </button>
    </div>
  );
}
