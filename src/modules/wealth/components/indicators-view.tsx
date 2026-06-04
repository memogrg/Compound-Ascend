import { PerformanceChart } from "@/components/charts/area-chart";
import type {
  IndicatorCard,
  IndicatorsViewModel,
} from "@/modules/wealth/services/indicators-service";
import type { IndicatorUnit } from "@/lib/economic-indicators";

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
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10 }}>
        <div>
          <div className="card-title" style={{ fontSize: 14.5 }}>{card.label}</div>
          <div className="card-sub" style={{ marginTop: 2 }}>{card.description}</div>
        </div>
        <span className="chip" style={{ fontSize: 10.5 }}>{card.source}</span>
      </div>

      {hasValue ? (
        <>
          <div style={{ display: "flex", alignItems: "baseline", gap: 10, flexWrap: "wrap" }}>
            <span className="num-xl" style={{ fontSize: 30 }}>
              {formatValue(card.value!, card.unit)}
            </span>
            {change !== null && (
              <span
                style={{
                  fontSize: 12.5,
                  fontWeight: 500,
                  color: positive ? "var(--pos)" : "var(--neg)",
                }}
              >
                {formatChange(change, card.unit)}
                <span className="muted" style={{ fontWeight: 400, marginLeft: 4 }}>
                  vs hace 6m
                </span>
              </span>
            )}
          </div>

          <PerformanceChart data={card.history} currency="CRC" formatValue={fmtTooltip} />

          {card.observedDate && (
            <div className="muted" style={{ fontSize: 11.5 }}>
              Último dato: {card.observedDate}
            </div>
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

export function IndicatorsView({ model }: { model: IndicatorsViewModel }) {
  if (model.groups.length === 0) {
    return (
      <div className="muted" style={{ fontSize: 13, padding: "8px 0" }}>
        No hay indicadores configurados todavía.
      </div>
    );
  }

  return (
    <div className="grid">
      {model.groups.map((g) => (
        <section key={g.group} className="grid" style={{ gap: 12 }}>
          <div className="card-title" style={{ fontSize: 13, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.04em" }}>
            {g.group}
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(280px,1fr))", gap: 12 }}>
            {g.cards.map((c) => (
              <Card key={c.code} card={c} />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
