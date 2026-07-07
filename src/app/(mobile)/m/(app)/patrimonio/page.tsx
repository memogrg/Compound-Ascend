import { getRichLifeSummary } from "@/modules/rich-life";
import { MobileMenu } from "../../components/mobile-menu";
import { computeWealthBreakdown } from "@/lib/ai/wealth-breakdown";
import { formatMoney, formatCompact } from "@/lib/format";
import { MDonut, type MSlice } from "../../components/m-donut";

/**
 * /m/patrimonio — "Patrimonio" (nombre canónico de nav.ts). Reutiliza el barrel rich-life (getRichLifeSummary:
 * patrimonio neto, indicadores, distribución por clase, pasivos) + el helper puro
 * computeWealthBreakdown (invertido/líquido/otros). Sin reimplementar cálculos.
 * Piel del diseño (data-screen="patrimonio"), es-MX tono "tú", tema claro.
 */
export const dynamic = "force-dynamic"; // datos por sesión

const RING_COLORS = ["var(--s1)", "var(--s2)", "var(--s3)", "var(--s4)", "var(--s5)"];

export default async function MobilePatrimonio() {
  const summary = await getRichLifeSummary();
  const { snapshot, allAssets, liabilities, currency } = summary;
  const ind = snapshot.indicators;
  const bd = computeWealthBreakdown(allAssets); // invertido / líquido / otros (o undefined)

  // Distribución por clase (ya agrupada por el engine); mapeamos a los colores del móvil.
  const slices: MSlice[] = snapshot.assetsByClass
    .filter((c) => c.value > 0)
    .slice(0, 5)
    .map((c, i) => ({ label: c.label, value: c.value, color: RING_COLORS[i % RING_COLORS.length]! }));

  const hasDetail = slices.length > 0 || liabilities.length > 0;

  return (
    <div className="m-scroll">
      <div className="m-pad">
        <div className="between" style={{ marginBottom: 16 }}>
          <div>
            <div className="ov">Crecimiento</div>
            <div className="h-title" style={{ marginTop: 6 }}>
              Patrimonio
            </div>
          </div>
          <MobileMenu />
        </div>

        {/* Hero: patrimonio neto + cambio del mes */}
        <div className="hero-nw" style={{ marginBottom: 16 }}>
          <div className="ov">Patrimonio neto total</div>
          <div className="hero-amt" style={{ marginTop: 6 }}>
            {formatMoney(ind.netWorth, currency)}
          </div>
          {ind.wealthVelocity != null && (
            <div className={`delta ${ind.wealthVelocity >= 0 ? "pos" : "neg"}`} style={{ marginTop: 8 }}>
              <Arrow up={ind.wealthVelocity >= 0} />
              {formatMoney(ind.wealthVelocity, currency)} este mes
            </div>
          )}
        </div>

        {/* Desglose invertido / líquido / deuda */}
        <div className="mini-kpi" style={{ gridTemplateColumns: "1fr 1fr 1fr", marginBottom: 16 }}>
          <div className="kpi" style={{ padding: 12 }}>
            <div className="k">Invertido</div>
            <div className="kv pos" style={{ fontSize: 17 }}>
              {formatMoney(bd?.invested ?? 0, currency)}
            </div>
          </div>
          <div className="kpi" style={{ padding: 12 }}>
            <div className="k">Líquido</div>
            <div className="kv" style={{ fontSize: 17 }}>
              {formatMoney(bd?.liquid ?? 0, currency)}
            </div>
          </div>
          <div className="kpi" style={{ padding: 12 }}>
            <div className="k">Deuda</div>
            <div className="kv neg" style={{ fontSize: 17 }}>
              {formatMoney(ind.totalLiabilities, currency)}
            </div>
          </div>
        </div>

        {/* Distribución (donut + leyenda) */}
        {slices.length > 0 && (
          <div style={{ marginBottom: 16 }}>
            <div className="sec-title" style={{ marginBottom: 12 }}>
              Composición
            </div>
            <MDonut slices={slices} centerValue={formatCompact(ind.totalAssets, currency)} centerLabel="activos" />
          </div>
        )}

        {/* Activos y pasivos */}
        <div>
          <div className="sec-title" style={{ marginBottom: 6 }}>
            Activos y pasivos
          </div>
          <div className="card card-p">
            {!hasDetail ? (
              <div className="muted" style={{ padding: "12px 0", fontSize: 13.5, lineHeight: 1.5 }}>
                Aún no registras activos ni pasivos. Agrégalos para ver tu composición y tu patrimonio real.
              </div>
            ) : (
              <>
                {slices.map((s) => (
                  <div className="lrow" key={`a-${s.label}`}>
                    <span
                      className="lic"
                      style={{ background: "var(--accent-soft)", color: "var(--accent)" }}
                      aria-hidden
                    >
                      <Dot color={s.color} />
                    </span>
                    <div>
                      <div className="lname">{s.label}</div>
                      <div className="lsub">Activo</div>
                    </div>
                    <div className="lamt pos">{formatMoney(s.value, currency)}</div>
                  </div>
                ))}
                {liabilities.map((l) => (
                  <div className="lrow" key={`l-${l.id}`}>
                    <span
                      className="lic"
                      style={{ background: "var(--danger-soft)", color: "var(--danger)" }}
                      aria-hidden
                    >
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                        <rect x="3" y="6" width="18" height="13" rx="2" />
                        <path d="M3 10h18" strokeLinecap="round" />
                      </svg>
                    </span>
                    <div>
                      <div className="lname">{l.name}</div>
                      <div className="lsub">Pasivo</div>
                    </div>
                    <div className="lamt neg">−{formatMoney(l.balance, l.currency)}</div>
                  </div>
                ))}
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function Arrow({ up }: { up: boolean }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3} style={{ width: 13, height: 13 }}>
      <path d={up ? "M6 15l6-6 6 6" : "M6 9l6 6 6-6"} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function Dot({ color }: { color: string }) {
  return <span style={{ display: "inline-block", width: 12, height: 12, borderRadius: 4, background: color }} />;
}
