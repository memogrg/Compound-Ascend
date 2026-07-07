import Link from "next/link";
import { MobileMenu } from "../../components/mobile-menu";
import { getWealthSummary } from "@/modules/wealth";
import { formatMoney, formatCompact } from "@/lib/format";

/**
 * /m/proteccion — "Protección": score de defensa patrimonial, pólizas activas y
 * brechas de cobertura. Reutiliza el barrel wealth (getWealthSummary: protection
 * + policies). Sin reimplementar cálculos. Piel del diseño (data-screen="proteccion"),
 * es-MX "tú", tema claro.
 */
export const dynamic = "force-dynamic"; // datos por sesión

const POLICY_LABEL: Record<string, string> = {
  medico: "Protección médica",
  vida: "Protección de vida",
  incapacidad: "Protección por incapacidad",
  hogar: "Protección del hogar",
  vehiculo: "Vehículo",
  patrimonial: "Patrimonial",
  empresarial: "Empresarial",
  familiar: "Familiar",
  otro: "Otra cobertura",
};
const FREQ_SUFFIX: Record<string, string> = {
  mensual: "mes",
  trimestral: "trim",
  semestral: "sem",
  anual: "año",
};

function statusOf(score: number): { label: string; color: string } {
  if (score >= 80) return { label: "Protegido", color: "var(--accent)" };
  if (score >= 50) return { label: "Parcial", color: "var(--warning)" };
  return { label: "Expuesto", color: "var(--danger)" };
}

export default async function MobileProteccion() {
  const summary = await getWealthSummary();
  const { protection: p, policies, currency } = summary;
  const st = statusOf(p.score);
  const dash = Math.max(0, Math.min(100, p.score));

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
            <div className="ov">Crecimiento</div>
            <div className="h-title" style={{ marginTop: 2 }}>
              Defensa Patrimonial
            </div>
          </div>
          <MobileMenu />
        </div>

        {/* Score de protección */}
        <div className="card card-p" style={{ marginBottom: 16 }}>
          <div className="row" style={{ gap: 20, alignItems: "center" }}>
            <div className="ring-wrap">
              <svg width="104" height="104" viewBox="0 0 42 42" aria-hidden>
                <circle cx="21" cy="21" r="15.915" fill="none" stroke="var(--surface-2)" strokeWidth={4.5} />
                <circle
                  cx="21"
                  cy="21"
                  r="15.915"
                  fill="none"
                  stroke={st.color}
                  strokeWidth={4.5}
                  strokeLinecap="round"
                  strokeDasharray={`${dash} ${100 - dash}`}
                  strokeDashoffset={25}
                  transform="rotate(-90 21 21)"
                />
              </svg>
              <div className="ring-center">
                <div>
                  <div className="display" style={{ fontSize: 22 }}>
                    {p.score}
                  </div>
                  <div className="muted" style={{ fontSize: 9 }}>
                    / 100
                  </div>
                </div>
              </div>
            </div>
            <div style={{ flex: 1 }}>
              <span className="badge" style={{ background: "color-mix(in srgb, " + st.color + " 14%, transparent)", color: st.color }}>
                {st.label}
              </span>
              <div style={{ fontSize: 13, color: "var(--text-muted)", marginTop: 10, lineHeight: 1.5 }}>
                {p.gaps.length === 0
                  ? "No detectamos brechas de protección. Buen trabajo."
                  : `Tienes ${p.gaps.length} ${p.gaps.length === 1 ? "brecha" : "brechas"} que dejan tu patrimonio expuesto.`}
              </div>
            </div>
          </div>
        </div>

        {/* KPIs */}
        <div className="mini-kpi" style={{ marginBottom: 16 }}>
          <div className="kpi">
            <div className="k">Cobertura total</div>
            <div className="kv" style={{ fontSize: 20 }}>
              {formatCompact(p.totalCoverage, currency)}
            </div>
          </div>
          <div className="kpi">
            <div className="k">Primas / año</div>
            <div className="kv" style={{ fontSize: 20 }}>
              {formatMoney(p.annualPremium, currency)}
            </div>
          </div>
          <div className="kpi">
            <div className="k">Pólizas activas</div>
            <div className="kv" style={{ fontSize: 20 }}>
              {p.activePolicies}
            </div>
          </div>
          <div className="kpi">
            <div className="k">Brechas</div>
            <div className={`kv ${p.gaps.length > 0 ? "neg" : ""}`} style={{ fontSize: 20 }}>
              {p.gaps.length}
            </div>
          </div>
        </div>

        {/* Pólizas */}
        <div style={{ marginBottom: 16 }}>
          <div className="sec-title" style={{ marginBottom: 6 }}>
            Tus pólizas
          </div>
          <div className="card card-p">
            {policies.length === 0 ? (
              <div className="muted" style={{ padding: "12px 0", fontSize: 13.5, lineHeight: 1.5 }}>
                Aún no registras pólizas. Agrégalas para medir tu protección real.
              </div>
            ) : (
              policies.map((pol) => {
                const label = POLICY_LABEL[pol.policyType] ?? "Cobertura";
                const suffix = FREQ_SUFFIX[pol.premiumFrequency ?? "anual"] ?? "año";
                return (
                  <div className="lrow" key={pol.id}>
                    <span className="lic" style={{ background: "var(--accent-soft)", color: "var(--accent)" }} aria-hidden>
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round">
                        <path d="M12 3l7 3v6c0 4-3 7-7 9-4-2-7-5-7-9V6Z" />
                      </svg>
                    </span>
                    <div>
                      <div className="lname">{label}</div>
                      <div className="lsub">
                        {pol.provider ?? "—"}
                        {pol.coverage ? ` · ${formatCompact(pol.coverage, pol.currency)} cobertura` : ""}
                      </div>
                    </div>
                    {pol.premium ? (
                      <div className="lamt">
                        {formatMoney(pol.premium, pol.currency)}/{suffix}
                      </div>
                    ) : null}
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Brechas */}
        {p.gaps.length > 0 && (
          <div>
            <div className="sec-title" style={{ marginBottom: 6 }}>
              Brechas de protección
            </div>
            <div className="card card-p">
              {p.gaps.map((g, i) => (
                <div className="gap-row" key={`${g.type}-${i}`}>
                  <span className={`sev ${g.severity}`}>{g.severity.toUpperCase()}</span>
                  <div style={{ fontSize: 13, lineHeight: 1.5 }}>
                    <strong>{g.type}</strong> — {g.description}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
