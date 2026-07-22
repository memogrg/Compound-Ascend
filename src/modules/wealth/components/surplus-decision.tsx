/**
 * Decisión del EXCEDENTE (F3): abonar deuda vs invertir, honestamente. Server component (solo
 * display) → sirve web y móvil con la misma lectura. La app INFORMA, no ordena: muestra la
 * certeza del abono y el RANGO de la inversión con el peor caso y la caída máxima visibles.
 * No es asesoría financiera.
 */
import { formatMoney, formatPercent } from "@/lib/format";
import type { SurplusDecisionReport } from "@/modules/wealth/services/surplus-decision-service";

const BAND_LABEL: Record<string, string> = { peor: "Peor caso", tipico: "Típico", mejor: "Mejor caso" };

function Card({ children, accent }: { children: React.ReactNode; accent?: string }) {
  return (
    <div className="card" style={{ padding: 16, borderLeft: accent ? `3px solid ${accent}` : undefined }}>
      {children}
    </div>
  );
}

const DISCLAIMER =
  "Información para orientarte, no asesoría financiera. Los rendimientos pasados no garantizan resultados futuros; las cifras de inversión son escenarios históricos aproximados, no una predicción.";

export function SurplusDecision({ report }: { report: SurplusDecisionReport }) {
  const { currency, monthlySurplus, horizonYears, apr, gated, pay, invest, debtName } = report;
  const c = (n: number) => formatMoney(n, currency);
  const years = Math.round(horizonYears);

  return (
    <section style={{ display: "grid", gap: 12, marginTop: 8 }}>
      <div>
        <div className="card-title" style={{ fontSize: 16 }}>
          Ya estás protegido — ¿qué hacés con tu excedente?
        </div>
        <div className="muted" style={{ fontSize: 12.5, marginTop: 2, lineHeight: 1.5 }}>
          Con tus fondos cubiertos, te sobran ~<strong>{c(monthlySurplus)}/mes</strong>. Acá está la
          matemática de dirigirlos a tu deuda vs invertirlos. Vos decidís.
        </div>
      </div>

      {gated ? (
        // Deuda cara: abonar es un retorno garantizado que ningún activo supera con certeza.
        <Card accent="var(--neg)">
          <div style={{ fontWeight: 600, fontSize: 14.5, marginBottom: 4 }}>
            Priorizá abonar {debtName ? `"${debtName}"` : "esta deuda"}
          </div>
          <div className="muted" style={{ fontSize: 13, lineHeight: 1.55 }}>
            A {apr != null ? formatPercent(apr) : "esta tasa"}, pagar esta deuda es un{" "}
            <strong>retorno garantizado</strong> que ningún activo supera con certeza. Dirigí el
            excedente a abonarla antes de pensar en invertir.
          </div>
          {pay ? (
            <div style={{ fontSize: 13, marginTop: 8 }}>
              Abonando {c(monthlySurplus)}/mes te ahorrás <strong>{c(pay.interestSaved)}</strong> de
              interés y la liquidás <strong>{pay.monthsSaved} meses</strong> antes.
            </div>
          ) : null}
        </Card>
      ) : (
        <>
          {/* Lado ABONAR (certeza). */}
          {pay ? (
            <Card accent="var(--pos)">
              <div style={{ fontWeight: 600, fontSize: 14.5 }}>
                Abonar a tu deuda{debtName ? ` — ${debtName}` : ""}{" "}
                <span style={{ color: "var(--pos)", fontSize: 12, fontWeight: 600 }}>garantizado</span>
              </div>
              <div className="muted" style={{ fontSize: 13, marginTop: 6, lineHeight: 1.55 }}>
                Dirigiendo {c(monthlySurplus)}/mes: te ahorrás{" "}
                <strong>{c(pay.interestSaved)}</strong> de interés (seguro, a la tasa de tu deuda) y
                la liquidás <strong>{pay.monthsSaved} meses</strong> antes.
              </div>
            </Card>
          ) : null}

          {/* Lado INVERTIR (rango, nunca una línea). */}
          <Card accent="var(--accent)">
            <div style={{ fontWeight: 600, fontSize: 14.5 }}>Invertir el excedente</div>
            <div className="muted" style={{ fontSize: 12.5, marginTop: 4, lineHeight: 1.5 }}>
              Aportando {c(monthlySurplus)}/mes por ~{years} años. Escenarios históricos (peor/típico/
              mejor), <strong>no una predicción</strong>. La caída máxima es lo que podrías ver en el
              camino.
            </div>

            <div style={{ display: "grid", gap: 10, marginTop: 12 }}>
              {invest.map((p) => (
                <div key={p.asset} style={{ borderTop: "1px solid var(--line)", paddingTop: 10 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                    <div style={{ fontWeight: 600, fontSize: 13.5 }}>
                      {p.label}
                      {p.sliver ? (
                        <span style={{ color: "var(--gold)", fontSize: 11, fontWeight: 600 }}> · astilla de alto riesgo</span>
                      ) : null}
                    </div>
                    <div className="muted" style={{ fontSize: 11.5 }}>
                      caída máx. histórica {formatPercent(p.maxDrawdown)}
                    </div>
                  </div>
                  <div style={{ display: "flex", gap: 8, marginTop: 6, flexWrap: "wrap" }}>
                    {p.scenarios.map((s) => (
                      <div
                        key={s.band}
                        style={{
                          flex: "1 1 90px",
                          background: "var(--surface-2)",
                          borderRadius: 8,
                          padding: "6px 8px",
                        }}
                      >
                        <div className="muted" style={{ fontSize: 10.5 }}>
                          {BAND_LABEL[s.band]} ({formatPercent(s.annualReturn)}/año)
                        </div>
                        <div style={{ fontSize: 14, fontWeight: 600 }}>{c(s.endValue)}</div>
                      </div>
                    ))}
                  </div>
                  {p.caveat ? (
                    <div style={{ fontSize: 12, marginTop: 6, color: "var(--gold)", lineHeight: 1.5 }}>
                      ⚠ {p.caveat}
                    </div>
                  ) : null}
                </div>
              ))}
            </div>
            <div className="muted" style={{ fontSize: 11.5, marginTop: 10, lineHeight: 1.5 }}>
              Aportado en el período: {c(invest[0]?.contributed ?? 0)}. Ojo con el <strong>riesgo de
              secuencia</strong>: un mal comienzo de mercado cambia mucho el resultado, aunque el
              promedio de largo plazo sea bueno.
            </div>
          </Card>

          {/* Cierre: el trade-off explícito, sin recomendar un lado. */}
          <Card>
            <div className="muted" style={{ fontSize: 13, lineHeight: 1.6 }}>
              <strong>El trade-off:</strong> abonar te da{" "}
              {pay ? <strong>{c(pay.interestSaved)}</strong> : "un ahorro"} garantizados y la paz de
              deber menos. Invertir <strong>históricamente</strong> rindió más, pero con caídas de
              hasta {formatPercent(Math.min(...invest.map((p) => p.maxDrawdown)))} y sin garantía. Vos
              decidís según tu tolerancia al riesgo.
            </div>
          </Card>
        </>
      )}

      <div className="muted" style={{ fontSize: 11, lineHeight: 1.5 }}>
        {DISCLAIMER}
      </div>
    </section>
  );
}
