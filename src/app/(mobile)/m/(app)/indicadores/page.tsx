import Link from "next/link";
import {
  getIndicatorsViewModel,
  type IndicatorCard,
} from "@/modules/wealth/services/indicators-service";
import { getMacroInsights } from "@/modules/wealth";

/**
 * /m/indicadores — "Indicadores": contexto macro GLOBAL (no por usuario). Reutiliza
 * getIndicatorsViewModel (mismo service que el web /patrimonio/indicadores) +
 * getMacroInsights (barrel wealth). Sin reimplementar cálculos. Piel del diseño
 * (data-screen="indicadores"), es-MX "tú", tema claro.
 */
export const dynamic = "force-dynamic";

/** Valor formateado según la unidad del indicador. */
function fmtValue(card: IndicatorCard): string {
  if (card.value == null) return "—";
  if (card.unit === "percent") return `${card.value.toFixed(2)}%`;
  if (card.unit === "currency") return `₡${Math.round(card.value).toLocaleString("es-CR")}`;
  return card.value.toLocaleString("es-CR", { maximumFractionDigits: 0 });
}

/** Cambio vs 6 meses: puntos porcentuales para tasas, % relativo para el resto. */
function fmtChange(card: IndicatorCard): { text: string; up: boolean } | null {
  if (card.unit === "percent") {
    if (card.change6mAbs == null) return null;
    const v = card.change6mAbs;
    return { text: `${v >= 0 ? "+" : ""}${v.toFixed(2)} pp vs 6m`, up: v >= 0 };
  }
  if (card.change6mPct == null) return null;
  const v = card.change6mPct * 100;
  return { text: `${v >= 0 ? "+" : ""}${v.toFixed(1)}% vs 6m`, up: v >= 0 };
}

/** Alturas (30–88%) de la mini-tendencia a partir de los últimos puntos reales. */
function bars(card: IndicatorCard): number[] {
  const pts = card.history.slice(-6).map((p) => p.value);
  if (pts.length < 2) return [];
  const min = Math.min(...pts);
  const max = Math.max(...pts);
  const range = max - min || 1;
  return pts.map((v) => 30 + Math.round(((v - min) / range) * 58));
}

export default async function MobileIndicadores() {
  const [model, insights] = await Promise.all([
    getIndicatorsViewModel(),
    getMacroInsights().catch(() => []),
  ]);
  const insight = insights[0];

  return (
    <div className="m-scroll">
      <div className="m-pad">
        <div className="hdr" style={{ marginBottom: 16 }}>
          <Link href="/m/inversiones" className="bk" aria-label="Volver a Inversiones">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
              <path d="M15 6l-6 6 6 6" />
            </svg>
          </Link>
          <div style={{ flex: 1 }}>
            <div className="ov">Contexto macro</div>
            <div className="h-title" style={{ marginTop: 2 }}>
              Indicadores
            </div>
          </div>
        </div>

        {/* Lectura de contexto (best-effort) */}
        {insight && (
          <div className="card card-p" style={{ marginBottom: 16, background: "var(--accent-soft)", borderColor: "transparent" }}>
            <div style={{ fontSize: 13, lineHeight: 1.5 }}>
              <strong>{insight.title}</strong> {insight.body}{" "}
              <span className="muted">Información de contexto, no es recomendación.</span>
            </div>
          </div>
        )}

        {!model.hasData ? (
          <div className="card card-p">
            <div className="muted" style={{ fontSize: 13.5, lineHeight: 1.5 }}>
              Aún no hay datos de indicadores. Se actualizan a diario desde las fuentes oficiales.
            </div>
          </div>
        ) : (
          model.groups.map((grp) => (
            <div key={grp.group} style={{ marginBottom: 16 }}>
              <div className="ov" style={{ marginBottom: 10 }}>
                {grp.group}
              </div>
              <div className="wgrid">
                {grp.cards.map((card) => {
                  const change = fmtChange(card);
                  const heights = bars(card);
                  return (
                    <div className="wgt tall" key={card.code}>
                      <div className="wtop">
                        <span className="wlabel">{card.label}</span>
                        <span className="schip">{card.source}</span>
                      </div>
                      <div className="wbig" style={{ fontSize: 26 }}>
                        {fmtValue(card)}
                      </div>
                      {change && (
                        <div className={`wsub ${change.up ? "pos" : "neg"}`} style={{ fontFamily: "var(--font-mono)", fontWeight: 700 }}>
                          {change.text}
                        </div>
                      )}
                      {heights.length > 0 && (
                        <div className="wminibars" style={{ marginTop: "auto" }} aria-hidden>
                          {heights.map((h, i) => (
                            <i key={i} className={i === heights.length - 1 ? "hi" : ""} style={{ height: `${h}%` }} />
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
