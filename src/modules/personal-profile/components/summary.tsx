"use client";

import { Icon } from "@/components/ui/icon";
import { BrandMark } from "@/components/layout/brand-mark";
import type { ProfileDiagnosis } from "@/modules/personal-profile/types";

const RISK_LABEL: Record<string, string> = {
  conservador: "Conservador",
  moderado: "Moderado",
  balanceado: "Balanceado",
  crecimiento: "Crecimiento",
  agresivo: "Agresivo",
};

/** Diagnóstico final del onboarding ("Tu perfil financiero inicial"). */
export function ProfileSummary({
  diagnosis,
  onContinue,
}: {
  diagnosis: ProfileDiagnosis;
  onContinue: () => void;
}) {
  return (
    <div className="wiz-canvas" style={{ minHeight: "100vh", justifyContent: "center" }}>
      <section className="step-frame">
        <div className="brand" style={{ border: 0, padding: 0, marginBottom: 18 }}>
          <BrandMark />
          <div>
            <div className="brand-name">
              Compound <span className="ascend">Ascend</span>
            </div>
            <div className="brand-sub">Tu perfil financiero</div>
          </div>
        </div>

        <div className="step-eyebrow">Diagnóstico inicial</div>
        <h1 className="step-title">
          Tu perfil financiero <span className="it">inicial</span>
        </h1>

        <div className="card card-pad" style={{ marginTop: 8 }}>
          <div className="row" style={{ gap: 18, flexWrap: "wrap" }}>
            <div className="ring-wrap">
              <svg width="92" height="92" viewBox="0 0 42 42">
                <circle cx="21" cy="21" r="15.915" fill="none" stroke="var(--chip)" strokeWidth="4" />
                <circle
                  cx="21"
                  cy="21"
                  r="15.915"
                  fill="none"
                  stroke="var(--pos)"
                  strokeWidth="4"
                  strokeLinecap="round"
                  strokeDasharray={`${diagnosis.completion} 100`}
                  strokeDashoffset="25"
                  transform="rotate(-90 21 21)"
                />
              </svg>
              <div className="ring-center">
                <div className="num-xl" style={{ fontSize: 22 }}>
                  {diagnosis.completion}%
                </div>
              </div>
            </div>
            <div style={{ flex: 1, minWidth: 220 }}>
              <div className="label">Perfil de riesgo</div>
              <div className="num-xl" style={{ fontSize: 26, marginTop: 4 }}>
                {RISK_LABEL[diagnosis.riskClass] ?? diagnosis.riskClass}
              </div>
              <div className="muted" style={{ fontSize: 12.5, marginTop: 6 }}>
                Perfil completado al {diagnosis.completion}%. Puedes afinarlo cuando quieras.
              </div>
            </div>
          </div>

          <p style={{ fontSize: 14, lineHeight: 1.6, color: "var(--ink-2)", marginTop: 18 }}>
            {diagnosis.narrative}
          </p>
        </div>

        <div className="card card-pad" style={{ marginTop: 14 }}>
          <div className="card-title">Tu ruta sugerida</div>
          <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 10 }}>
            {diagnosis.suggestedPath.map((s, i) => (
              <div key={i} style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
                <span
                  style={{
                    width: 22,
                    height: 22,
                    borderRadius: 999,
                    background: "var(--chip)",
                    color: "var(--ink-2)",
                    display: "grid",
                    placeItems: "center",
                    fontSize: 11,
                    fontWeight: 600,
                    flex: "none",
                  }}
                >
                  {i + 1}
                </span>
                <span style={{ fontSize: 13.5, color: "var(--ink-2)", lineHeight: 1.5 }}>{s}</span>
              </div>
            ))}
          </div>
        </div>

        <button
          className="btn btn-primary"
          style={{ marginTop: 18, width: "100%", justifyContent: "center" }}
          onClick={onContinue}
        >
          Construir mi Base Financiera
          <Icon name="chev" width={2.2} />
        </button>
      </section>
    </div>
  );
}
