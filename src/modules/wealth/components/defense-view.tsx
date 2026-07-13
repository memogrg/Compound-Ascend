import { Icon } from "@/components/ui/icon";
import { DeleteButton } from "./delete-button";
import { EditWealthButton, WealthActions } from "./wealth-actions";
import { formatMoney } from "@/lib/format";
import type { WealthSummary } from "@/modules/wealth/services/wealth-service";
import type { PolicyType } from "@/modules/wealth/types";

const POLICY_LABEL: Record<PolicyType, string> = {
  medico: "Protección médica",
  gastos_mayores: "Gastos médicos mayores",
  gastos_menores: "Gastos médicos menores",
  vida: "Protección de vida",
  incapacidad: "Protección de ingresos",
  hogar: "Protección del hogar",
  vehiculo: "Protección del vehículo",
  patrimonial: "Protección patrimonial",
  empresarial: "Protección empresarial",
  familiar: "Protección familiar",
  otro: "Otra cobertura",
};

const SEV: Record<string, { label: string; cls: string }> = {
  alto: { label: "Alto", cls: "var(--neg)" },
  medio: { label: "Medio", cls: "var(--warn)" },
  bajo: { label: "Bajo", cls: "var(--pos)" },
};

export function DefenseView({ summary }: { summary: WealthSummary }) {
  const { protection: p, policies, currency } = summary;
  const score = p.score;
  const monthly = Math.round(p.annualPremium / 12);

  return (
    <div className="grid">
      {/* Hero: score + resumen */}
      <section className="def-hero">
        <div
          className="card card-pad"
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            textAlign: "center",
          }}
        >
          <div className="label" style={{ alignSelf: "flex-start" }}>
            Puntuación de protección
          </div>
          <div className="ring-wrap" style={{ margin: "14px 0 6px" }}>
            <svg width="150" height="150" viewBox="0 0 42 42">
              <circle
                cx="21"
                cy="21"
                r="15.915"
                fill="none"
                stroke="var(--surface-2)"
                strokeWidth="4"
              />
              <circle
                cx="21"
                cy="21"
                r="15.915"
                fill="none"
                stroke="var(--c-protect)"
                strokeWidth="4"
                strokeLinecap={score >= 100 ? "butt" : "round"}
                pathLength={100}
                strokeDasharray={`${score} 100`}
                strokeDashoffset="25"
                transform="rotate(-90 21 21)"
              />
            </svg>
            <div className="ring-center">
              <div>
                <div className="num-xl" style={{ fontSize: 44 }}>
                  {score}
                </div>
                <div
                  style={{
                    fontFamily: "var(--font-mono)",
                    fontSize: 10.5,
                    fontWeight: 700,
                    letterSpacing: "0.04em",
                    color: "var(--c-protect)",
                  }}
                >
                  {score >= 80 ? "PROTEGIDO" : score >= 50 ? "PARCIAL" : "EXPUESTO"}
                </div>
              </div>
            </div>
          </div>
          <div className="muted" style={{ fontSize: 12.5, lineHeight: 1.5, maxWidth: 260 }}>
            {p.gaps.length === 0
              ? "Tus protecciones esenciales están cubiertas."
              : `Cerrar tus ${p.gaps.length} brecha(s) de protección elevaría tu puntuación.`}
          </div>
        </div>

        <div className="card card-pad">
          <div className="row" style={{ justifyContent: "space-between" }}>
            <div className="card-title">Resumen de cobertura</div>
            <span
              className="chip"
              style={{
                fontWeight: 700,
                background: "color-mix(in srgb,var(--c-protect) 14%, transparent)",
                color: "var(--c-protect)",
              }}
            >
              {formatMoney(p.totalCoverage, currency)} protegido
            </span>
          </div>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: 12,
              marginTop: 14,
            }}
          >
            <Stat label="Cobertura total" value={formatMoney(p.totalCoverage, currency)} />
            <Stat label="Primas anuales" value={formatMoney(p.annualPremium, currency)} />
            <Stat label="Pólizas activas" value={String(p.activePolicies)} />
            <Stat
              label="Brechas abiertas"
              value={String(p.gaps.length)}
              accent={p.gaps.length > 0 ? "var(--neg)" : undefined}
            />
          </div>
        </div>
      </section>

      {/* Cobertura por dominio */}
      {p.coverageByType.length > 0 ? (
        <section className="cols-4">
          {p.coverageByType.map((c) => (
            <div key={c.type} className="card card-pad">
              <div className="cov-ic">
                <Icon name="defense" />
              </div>
              <div style={{ fontSize: 13.5, fontWeight: 600, marginTop: 13 }}>
                {POLICY_LABEL[c.type]}
              </div>
              <div
                className="chip"
                style={{
                  marginTop: 4,
                  fontWeight: 700,
                  background: "var(--pos-soft)",
                  color: "var(--pos)",
                }}
              >
                Activa
              </div>
              <div className="num-xl" style={{ fontSize: 18, marginTop: 11 }}>
                {formatMoney(c.coverage, currency)}
              </div>
            </div>
          ))}
        </section>
      ) : null}

      {/* Pólizas + exposición al riesgo */}
      <section className="def-hero">
        <div className="card">
          <div className="card-head">
            <div>
              <div className="card-title">Pólizas activas</div>
              <div className="card-sub">{policies.length} póliza(s)</div>
            </div>
          </div>
          {policies.length === 0 ? (
            <div
              className="muted"
              style={{
                padding: "20px 24px",
                fontSize: 13,
                display: "grid",
                gap: 12,
                justifyItems: "start",
              }}
            >
              <span>Aún no registras pólizas.</span>
              <WealthActions mode="policy" currency={currency} />
            </div>
          ) : (
            <div style={{ padding: "0 24px 12px" }}>
              {policies.map((pol) => (
                <div key={pol.id} className="pol-row">
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 13.5, fontWeight: 600 }}>
                      {POLICY_LABEL[pol.policyType]}
                    </div>
                    <div className="muted" style={{ fontSize: 11.5, marginTop: 2 }}>
                      {pol.provider ?? "—"}
                      {pol.coverage ? ` · cobertura ${formatMoney(pol.coverage, pol.currency)}` : ""}
                    </div>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <div style={{ textAlign: "right" }}>
                      <div
                        className="tnum"
                        style={{ fontFamily: "var(--font-mono)", fontSize: 13, fontWeight: 700 }}
                      >
                        {pol.premium ? formatMoney(pol.premium, pol.currency) : "—"}
                      </div>
                      {pol.premium ? (
                        <div className="muted" style={{ fontSize: 10.5 }}>
                          /{(pol.premiumFrequency ?? "año").slice(0, 3)}
                        </div>
                      ) : null}
                    </div>
                    <EditWealthButton mode="policy" item={pol} currency={currency} />
                    <DeleteButton id={pol.id} kind="policy" />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="card card-pad">
          <div className="card-title">Exposición al riesgo</div>
          <div className="card-sub" style={{ marginBottom: 8 }}>
            Dónde es vulnerable tu patrimonio
          </div>
          {p.gaps.length === 0 ? (
            <div className="muted" style={{ fontSize: 13, padding: "12px 0" }}>
              No detectamos brechas críticas. ¡Bien protegido!
            </div>
          ) : (
            p.gaps.map((g, i) => {
              const sev = SEV[g.severity] ?? SEV.medio!;
              const sevCls = ["alto", "medio", "bajo"].includes(g.severity)
                ? g.severity
                : "medio";
              return (
                <div key={i} className="gap-row">
                  <div
                    style={{
                      display: "flex",
                      alignItems: "flex-start",
                      justifyContent: "space-between",
                      gap: 10,
                    }}
                  >
                    <div style={{ fontSize: 13.5, fontWeight: 600 }}>{g.type}</div>
                    <span className={`sev ${sevCls}`}>{sev.label}</span>
                  </div>
                  <div className="muted" style={{ fontSize: 12.5, marginTop: 5, lineHeight: 1.5 }}>
                    {g.description}
                  </div>
                  <div
                    style={{ fontSize: 12, marginTop: 6, color: "var(--accent)", fontWeight: 600 }}
                  >
                    → {g.recommendation}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </section>

      {/* Costos */}
      <section className="cols-2">
        <div className="card card-pad">
          <div className="label">Costo de seguro recurrente</div>
          <div className="cost-num">
            {formatMoney(monthly, currency)}{" "}
            <span style={{ fontSize: 15, color: "var(--muted)", fontWeight: 500 }}>/mes</span>
          </div>
          <div className="muted" style={{ fontSize: 11.5, marginTop: 8 }}>
            Seguido en tu Base Financiera como gasto de protección.
          </div>
        </div>
        <div className="card card-pad">
          <div className="label">Gasto anual en protección</div>
          <div className="cost-num">
            {formatMoney(p.annualPremium, currency)}{" "}
            <span style={{ fontSize: 15, color: "var(--muted)", fontWeight: 500 }}>/año</span>
          </div>
          <div className="muted" style={{ fontSize: 11.5, marginTop: 8 }}>
            Protegerte evita que un evento destruya años de avance.
          </div>
        </div>
      </section>
    </div>
  );
}

function Stat({ label, value, accent }: { label: string; value: string; accent?: string }) {
  return (
    <div className="cstat">
      <div className="k">{label}</div>
      <div className="v" style={accent ? { color: accent } : undefined}>
        {value}
      </div>
    </div>
  );
}
