"use client";

// Componente de presentación cliente: pasa un `formatValue` (función) a
// PerformanceChart (client). Debe ser client component — pasar funciones a un
// client component desde un server component lanza en RSC y tumbaba la sección.
import { PerformanceChart } from "@/components/charts/lazy";
import type {
  IndicatorCard,
  IndicatorsViewModel,
} from "@/modules/wealth/services/indicators-service";
import type { MacroInsight, InsightTone } from "@/modules/wealth/services/macro-insights";
import type { IndicatorUnit } from "@/lib/economic-indicators";

const TONE_COLOR: Record<InsightTone, string> = {
  pos: "var(--pos)",
  neg: "var(--neg)",
  warn: "var(--warn)",
  info: "var(--info, var(--muted-2))",
};

/** Número con 2 decimales en formato es-CR. */
function num2(value: number): string {
  return new Intl.NumberFormat("es-CR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

/** Valor actual según unidad (% , ₡ o índice). */
function formatValue(value: number, unit: IndicatorUnit): string {
  if (unit === "percent") return `${num2(value)}%`;
  if (unit === "currency") return `₡${num2(value)}`;
  return num2(value);
}

/** Variación absoluta vs hace 6m, con su unidad (puntos porcentuales para %). */
function formatChange(abs: number, unit: IndicatorUnit): string {
  const sign = abs >= 0 ? "+" : "−";
  const mag = Math.abs(abs);
  if (unit === "percent") return `${sign}${num2(mag)} pp`;
  if (unit === "currency") return `${sign}₡${num2(mag)}`;
  return `${sign}${num2(mag)}`;
}

function Card({ card }: { card: IndicatorCard }) {
  const hasValue = card.value !== null;
  const change = card.change6mAbs;
  const positive = (change ?? 0) >= 0;
  const fmtTooltip = (v: number) => formatValue(v, card.unit);

  return (
    <div className="card card-pad" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          gap: 10,
        }}
      >
        <div>
          <div className="card-title" style={{ fontSize: 14.5 }}>
            {card.label}
          </div>
          <div className="card-sub" style={{ marginTop: 2 }}>
            {card.description}
          </div>
        </div>
        <span className={`ind-src ${card.source.toLowerCase() === "bccr" ? "bccr" : "fred"}`}>
          {card.source}
        </span>
      </div>

      {hasValue ? (
        <>
          <div style={{ display: "flex", alignItems: "baseline", gap: 10, flexWrap: "wrap" }}>
            <span className="num-xl" style={{ fontSize: 30 }}>
              {formatValue(card.value!, card.unit)}
            </span>
            {change !== null && (
              <span style={{ display: "inline-flex", alignItems: "baseline", gap: 6 }}>
                <span className={`delta ${positive ? "up" : "down"}`}>
                  {formatChange(change, card.unit)}
                </span>
                <span className="muted" style={{ fontSize: 10.5 }}>
                  vs hace 6m
                </span>
              </span>
            )}
          </div>

          <PerformanceChart data={card.history} currency="CRC" formatValue={fmtTooltip} />

          {card.observedDate && (
            <div className="ind-date">Último dato: {card.observedDate}</div>
          )}
        </>
      ) : (
        <div className="muted" style={{ fontSize: 12.5, padding: "8px 0" }}>
          Aún sin datos. Se actualiza automáticamente a diario.
        </div>
      )}
    </div>
  );
}

function MacroInsightsPanel({ insights }: { insights: MacroInsight[] }) {
  if (insights.length === 0) return null;
  return (
    <div className="card card-pad">
      <div className="card-title">Qué significa para ti</div>
      <div style={{ marginTop: 12, display: "grid", gap: 10 }}>
        {insights.map((i) => {
          const color = TONE_COLOR[i.tone];
          return (
            <div
              key={i.id}
              style={{
                borderLeft: `3px solid ${color}`,
                paddingLeft: 12,
                display: "flex",
                flexDirection: "column",
                gap: 3,
              }}
            >
              <div style={{ fontSize: 13, fontWeight: 600, color: "var(--ink-2)" }}>{i.title}</div>
              <div className="muted" style={{ fontSize: 12.5, lineHeight: 1.5 }}>
                {i.body}
              </div>
            </div>
          );
        })}
      </div>
      <div className="muted" style={{ fontSize: 11, marginTop: 12 }}>
        Información de contexto. No constituye recomendación financiera.
      </div>
    </div>
  );
}

export function IndicatorsView({
  model,
  insights = [],
}: {
  model: IndicatorsViewModel;
  insights?: MacroInsight[];
}) {
  if (model.groups.length === 0 && insights.length === 0) {
    return (
      <div className="muted" style={{ fontSize: 13, padding: "8px 0" }}>
        No hay indicadores configurados todavía.
      </div>
    );
  }

  return (
    <div className="grid">
      <MacroInsightsPanel insights={insights} />
      {model.groups.map((g) => (
        <section key={g.group} className="grid" style={{ gap: 12 }}>
          <div className="label">{g.group}</div>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit,minmax(280px,1fr))",
              gap: 12,
            }}
          >
            {g.cards.map((c) => (
              <Card key={c.code} card={c} />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
