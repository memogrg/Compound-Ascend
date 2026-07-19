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
  type MTone,
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

/**
 * QUÉ SIGNIFICA QUE UN INDICADOR SUBA, PARA TU BOLSILLO. No lo reinterpretes.
 *
 * El color NO va por dirección, va por IMPACTO. Colorear por dirección —lo que hacía
 * antes— pintaba la INFLACIÓN SUBIENDO de verde, que es exactamente lo contrario de lo
 * que le pasa a tu dinero. Verde y rojo aquí no dicen "sube/baja", dicen "te conviene /
 * te perjudica"; la flecha y el signo ya dicen la dirección.
 *
 *  "malo"   → subir te perjudica: inflación (tu dinero compra menos) y tasas (el crédito
 *             se encarece). Suben ⇒ rojo; bajan ⇒ verde.
 *  "neutro" → el tipo de cambio es AMBIGUO por diseño: un dólar más caro te conviene si
 *             cobras o ahorras en dólares, y te perjudica si importas o debes en dólares.
 *             La app no sabe cuál es tu caso, así que no opina: se muestra sin color.
 *             Pintarlo de verde o rojo sería inventarle una respuesta al usuario.
 */
type Impact = "malo" | "neutro";
const IMPACT_IF_UP: Record<string, Impact> = {
  IPC: "malo", // inflación
  TBP: "malo", // Tasa Básica Pasiva
  TPM: "malo", // Política Monetaria
  TRI: "malo", // Interbancaria
  FED_PRIME: "malo",
  FED_FUNDS: "malo",
  SOFR: "malo",
  US_TREASURY_10Y: "malo",
  US_CPI: "malo", // índice de precios de EE. UU.
  USDCRC_COMPRA: "neutro",
  USDCRC_VENTA: "neutro",
};

/**
 * Clase de color de la tendencia: verde si te favorece, rojo si te perjudica, sin color
 * si es ambiguo o no lo tenemos clasificado (un indicador nuevo sale neutro, que es la
 * opción honesta hasta que alguien decida su impacto).
 */
function trendClass(card: IndicatorCard, dir: -1 | 0 | 1): string {
  if (dir === 0) return "";
  const impact = IMPACT_IF_UP[card.code] ?? "neutro";
  if (impact === "neutro") return "";
  // impact === "malo": subir perjudica, bajar favorece.
  return dir > 0 ? "neg" : "pos";
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
 * Subtítulo de una fila de indicador: la tendencia coloreada POR IMPACTO (ver
 * IMPACT_IF_UP) + la fuente y la fecha. Si no hay tendencia, solo fuente + fecha.
 */
function rowSubtitle(card: IndicatorCard): React.ReactNode {
  const ch = fmtChange(card);
  const d = fmtObserved(card.observedDate);
  const tail = `${card.source}${d ? ` · al ${d}` : ""}`;
  if (!ch) return tail;
  return (
    <>
      <span className={trendClass(card, ch.dir)} style={{ fontWeight: 600 }}>
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
  // Mismo criterio de impacto que las filas, traducido al tono del chip.
  const heroCls = hero && heroChange ? trendClass(hero, heroChange.dir) : "";
  const heroTone: MTone = heroCls === "pos" ? "success" : heroCls === "neg" ? "danger" : "neutral";

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
            {/* Destacado: tipo de cambio del dólar, con su mini-tendencia como slot. El chip
                usa la MISMA regla de impacto que las filas (ver IMPACT_IF_UP), así que al
                ser el tipo de cambio ambiguo sale sin color: la app no puede saber si te
                conviene un dólar más caro sin saber si cobras o debes en dólares. */}
            {hero && (
              <MSummaryCard
                eyebrow={hero.label}
                value={fmtValue(hero)}
                chip={
                  heroChange && heroChange.dir !== 0 ? (
                    <MChip tone={heroTone}>{heroChange.text}</MChip>
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
