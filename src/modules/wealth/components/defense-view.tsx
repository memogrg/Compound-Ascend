import { Icon } from "@/components/ui/icon";
import { DeleteButton } from "./delete-button";
import { EditWealthButton } from "./wealth-actions";
import { formatMoney } from "@/lib/format";
import type { WealthSummary } from "@/modules/wealth/services/wealth-service";
import type { PolicyType } from "@/modules/wealth/types";

const POLICY_LABEL: Record<PolicyType, string> = {
  medico: "Protección médica",
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
        <div className="card card-pad" style={{ display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center" }}>
          <div className="label" style={{ alignSelf: "flex-start" }}>
            Puntuación de protección
          </div>
          <div className="ring-wrap" style={{ margin: "14px 0 6px" }}>
            <svg width="150" height="150" viewBox="0 0 42 42">
              <circle cx="21" cy="21" r="15.915" fill="none" stroke="var(--chip)" strokeWidth="4" />
              <circle cx="21" cy="21" r="15.915" fill="none" stroke="var(--c-protect)" strokeWidth="4" strokeLinecap="round" strokeDasharray={`${score} 100`} strokeDashoffset="25" transform="rotate(-90 21 21)" />
            </svg>
            <div className="ring-center">
              <div>
                <div className="num-xl" style={{ fontSize: 44 }}>
                  {score}
                </div>
                <div style={{ fontSize: 12, fontWeight: 600, color: "var(--c-protect)" }}>
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
            <span className="chip" style={{ background: "color-mix(in srgb,var(--c-protect) 14%, transparent)", color: "var(--c-protect)" }}>
              {formatMoney(p.totalCoverage, currency)} protegido
            </span>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px 24px", marginTop: 18 }}>
            <Stat label="Cobertura total" value={formatMoney(p.totalCoverage, currency)} />
            <Stat label="Primas anuales" value={formatMoney(p.annualPremium, currency)} />
            <Stat label="Pólizas activas" value={String(p.activePolicies)} />
            <Stat label="Brechas abiertas" value={String(p.gaps.length)} accent={p.gaps.length > 0 ? "var(--neg)" : undefined} />
          </div>
        </div>
      </section>

      {/* Cobertura por dominio */}
      {p.coverageByType.length > 0 ? (
        <section className="cols-4">
          {p.coverageByType.map((c) => (
            <div key={c.type} className="card card-pad">
              <div className="ic" style={{ width: 38, height: 38, borderRadius: 11, display: "grid", placeItems: "center", background: "color-mix(in srgb,var(--c-protect) 14%,transparent)", color: "var(--c-protect)" }}>
                <Icon name="defense" />
              </div>
              <div style={{ fontSize: 13.5, fontWeight: 600, marginTop: 13 }}>
                {POLICY_LABEL[c.type]}
              </div>
              <div className="chip" style={{ marginTop: 4, background: "var(--pos-soft)", color: "var(--pos)" }}>
                Activa
              </div>
              <div className="num-xl" style={{ fontSize: 22, marginTop: 12 }}>
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
            <div className="muted" style={{ padding: "20px 24px", fontSize: 13 }}>
              Aún no registras pólizas.
            </div>
          ) : (
            policies.map((pol) => (
              <div key={pol.id} className="list-row" style={{ gridTemplateColumns: "1fr auto auto" }}>
                <div>
                  <div style={{ fontSize: 13.5, fontWeight: 500 }}>{POLICY_LABEL[pol.policyType]}</div>
                  <div className="muted" style={{ fontSize: 11.5, marginTop: 2 }}>
                    {pol.provider ?? "—"}
                    {pol.coverage ? ` · ${formatMoney(pol.coverage, currency)}` : ""}
                  </div>
                </div>
                <span className="tnum" style={{ fontSize: 12.5, color: "var(--muted)" }}>
                  {pol.premium ? `${formatMoney(pol.premium, currency)}/${(pol.premiumFrequency ?? "año").slice(0, 3)}` : "—"}
                </span>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <EditWealthButton mode="policy" item={pol} currency={currency} />
                  <DeleteButton id={pol.id} kind="policy" />
                </div>
              </div>
            ))
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
              return (
                <div key={i} style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 12, alignItems: "flex-start", padding: "13px 0", borderTop: i === 0 ? "none" : "1px solid var(--line)" }}>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 500 }}>{g.type}</div>
                    <div className="muted" style={{ fontSize: 11.5, marginTop: 2, lineHeight: 1.45 }}>
                      {g.description}
                    </div>
                    <div style={{ fontSize: 11.5, marginTop: 4, color: "var(--ink-2)" }}>{g.recommendation}</div>
                  </div>
                  <span className="chip" style={{ background: "color-mix(in srgb," + sev.cls + " 16%, transparent)", color: sev.cls }}>
                    {sev.label}
                  </span>
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
          <div className="num-xl" style={{ fontSize: 28, marginTop: 8 }}>
            {formatMoney(monthly, currency)} <span style={{ fontSize: 14, color: "var(--muted)" }}>/mes</span>
          </div>
          <div className="muted" style={{ fontSize: 11.5, marginTop: 8 }}>
            Seguido en tu Base Financiera como gasto de protección.
          </div>
        </div>
        <div className="card card-pad">
          <div className="label">Gasto anual en protección</div>
          <div className="num-xl" style={{ fontSize: 28, marginTop: 8 }}>
            {formatMoney(p.annualPremium, currency)} <span style={{ fontSize: 14, color: "var(--muted)" }}>/año</span>
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
    <div>
      <div style={{ fontSize: 12, color: "var(--muted)" }}>{label}</div>
      <div className="num-xl" style={{ fontSize: 24, marginTop: 6, color: accent }}>
        {value}
      </div>
    </div>
  );
}
