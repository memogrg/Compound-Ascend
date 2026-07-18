import { MobileHeader } from "../../components/mobile-header";
import {
  getIndicatorsViewModel,
  type IndicatorCard,
} from "@/modules/wealth/services/indicators-service";
import { getMacroInsights } from "@/modules/wealth";
import {
  MSummaryCard,
  MSectionHeader,
  MContentCard,
  MDataRow,
  MChip,
  MEmptyState,
} from "../../components/content-kit";

/**
 * /m/indicadores — "Mercado e indicadores": contexto macro GLOBAL (no por usuario, solo
 * lectura). Reutiliza getIndicatorsViewModel (mismo service que el web
 * /patrimonio/indicadores) + getMacroInsights (barrel wealth). Sin reimplementar cálculos.
 * es-MX "tú", tema claro.
 *
 * Formato: estos NO son montos del usuario. Cada unidad tiene su formato propio (tasas en
 * %, tipo de cambio en ₡ con decimales) — no se usa mAmount de moneda aquí. Los valores ya
 * llegan calculados por el service; nada se convierte ni se agrega en esta pantalla.
 */
export const dynamic = "force-dynamic";

/** Valor formateado según la unidad. El tipo de cambio (currency) lleva 2 decimales: es
 *  un precio ₡/$, no un monto redondeable —antes salía "₡512" perdiendo los céntimos. */
function fmtValue(card: IndicatorCard): string {
  if (card.value == null) return "—";
  if (card.unit === "percent") return `${card.value.toFixed(2)}%`;
  if (card.unit === "currency")
    return `₡${card.value.toLocaleString("es-CR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  return card.value.toLocaleString("es-CR", { maximumFractionDigits: 0 });
}

/** Cambio vs ~6 meses: puntos porcentuales para tasas, % relativo para el resto. */
function fmtChange(card: IndicatorCard): { text: string; dir: -1 | 0 | 1 } | null {
  if (card.unit === "percent") {
    if (card.change6mAbs == null) return null;
    const v = card.change6mAbs;
    const dir = v > 0 ? 1 : v < 0 ? -1 : 0;
    return { text: `${dir > 0 ? "+" : dir < 0 ? "−" : ""}${Math.abs(v).toFixed(2)} pp vs 6m`, dir };
  }
  if (card.change6mPct == null) return null;
  const v = card.change6mPct * 100;
  const dir = v > 0 ? 1 : v < 0 ? -1 : 0;
  return { text: `${dir > 0 ? "+" : dir < 0 ? "−" : ""}${Math.abs(v).toFixed(1)}% vs 6m`, dir };
}

/** Fecha de observación en corto ("12 jul"); vacío si no hay. */
function fmtObserved(iso: string | null): string {
  if (!iso) return "";
  return new Date(`${iso}T00:00:00`).toLocaleDateString("es-MX", { day: "numeric", month: "short" });
}

/** Alturas (30–88%) de la mini-tendencia a partir de los últimos puntos reales. Lógica
 *  original preservada: alimenta el sparkline decorativo del hero (.wminibars). */
function bars(card: IndicatorCard): number[] {
  const pts = card.history.slice(-6).map((p) => p.value);
  if (pts.length < 2) return [];
  const min = Math.min(...pts);
  const max = Math.max(...pts);
  const range = max - min || 1;
  return pts.map((v) => 30 + Math.round(((v - min) / range) * 58));
}

/**
 * Subtítulo de una fila de indicador: la tendencia coloreada (sube verde / baja rojo, la
 * misma convención que el resto del barrido) + la fuente y la fecha. Si no hay tendencia,
 * solo fuente + fecha.
 */
function rowSubtitle(card: IndicatorCard): React.ReactNode {
  const ch = fmtChange(card);
  const d = fmtObserved(card.observedDate);
  const tail = `${card.source}${d ? ` · al ${d}` : ""}`;
  if (!ch) return tail;
  return (
    <>
      <span className={ch.dir > 0 ? "pos" : ch.dir < 0 ? "neg" : ""} style={{ fontWeight: 600 }}>
        {ch.text}
      </span>
      {` · ${card.source}`}
    </>
  );
}

export default async function MobileIndicadores() {
  const [model, insights] = await Promise.all([
    getIndicatorsViewModel(),
    getMacroInsights().catch(() => []),
  ]);
  const insight = insights[0];

  // Indicador destacado: el tipo de cambio del dólar (unidad currency). Se prefiere la
  // "venta" (lo que pagas por un dólar); si no, el primero con valor. Se saca de su grupo
  // para no repetirlo en la grilla de abajo.
  const currencyCards = model.groups
    .flatMap((g) => g.cards)
    .filter((c) => c.unit === "currency" && c.value != null);
  const hero =
    currencyCards.find((c) => /venta/i.test(c.label)) ?? currencyCards[0] ?? null;
  const heroChange = hero ? fmtChange(hero) : null;
  const heroBars = hero ? bars(hero) : [];

  return (
    <div className="m-scroll">
      <div className="m-pad">
        <MobileHeader
          variant="inner"
          eyebrow="Contexto macro"
          title="Mercado e indicadores"
          backHref="/m/inversiones"
          backLabel="Volver a Inversiones"
        />

        {/* Lectura de contexto (best-effort). Conserva su tinte de acento. */}
        {insight && (
          <MContentCard style={{ marginBottom: 16, background: "var(--accent-soft)" }}>
            <div style={{ fontSize: 13, lineHeight: 1.5 }}>
              <strong>{insight.title}</strong> {insight.body}{" "}
              <span className="muted">Información de contexto, no es recomendación.</span>
            </div>
          </MContentCard>
        )}

        {!model.hasData ? (
          <MEmptyState
            icon="portfolio"
            title="Sin datos por ahora"
            description="Los indicadores se actualizan a diario desde las fuentes oficiales (BCCR, FRED). Vuelve en un momento."
          />
        ) : (
          <>
            {/* Destacado: tipo de cambio del dólar, con su mini-tendencia como slot.
                Tendencia con la MISMA convención que las filas (sube verde / baja rojo): un
                chip invertido aquí y filas normales abajo pintaban el mismo evento de dos
                colores. Sin editorializar si es "bueno o malo" — es solo el dato. */}
            {hero && (
              <MSummaryCard
                eyebrow={hero.label}
                value={fmtValue(hero)}
                chip={
                  heroChange && heroChange.dir !== 0 ? (
                    <MChip tone={heroChange.dir > 0 ? "success" : "danger"}>{heroChange.text}</MChip>
                  ) : undefined
                }
                sub={`Fuente ${hero.source}${hero.observedDate ? ` · al ${fmtObserved(hero.observedDate)}` : ""}. El precio del dólar en colones.`}
                slot={
                  heroBars.length > 0 ? (
                    <div className="wminibars" aria-hidden>
                      {heroBars.map((h, i) => (
                        <i key={i} className={i === heroBars.length - 1 ? "hi" : ""} style={{ height: `${h}%` }} />
                      ))}
                    </div>
                  ) : undefined
                }
                style={{ marginBottom: 16 }}
              />
            )}

            {/* Cada grupo (Costa Rica / Estados Unidos) como filas: los labels son largos
                ("Tasa de Política Monetaria", "Tasa Interbancaria (1 día, ₡)") y en una
                grilla de 2 columnas envolvían a 2 líneas y desalineaban los valores; a lo
                ancho caben de una. El valor va a la derecha en Space Mono. El destacado se
                excluye para no duplicarlo. */}
            {model.groups.map((grp) => {
              const cards = grp.cards.filter((c) => c.code !== hero?.code);
              if (cards.length === 0) return null;
              return (
                <div key={grp.group} style={{ marginBottom: 16 }}>
                  <MSectionHeader title={grp.group} />
                  <MContentCard style={{ padding: 0, overflow: "hidden" }}>
                    {cards.map((card) => (
                      <MDataRow key={card.code} title={card.label} subtitle={rowSubtitle(card)} value={fmtValue(card)} />
                    ))}
                  </MContentCard>
                </div>
              );
            })}
          </>
        )}
      </div>
    </div>
  );
}
