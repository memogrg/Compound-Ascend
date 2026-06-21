"use client";

import { useEffect, useState } from "react";
import { Icon } from "@/components/ui/icon";
import { BrandMark } from "@/components/layout/brand-mark";
import { RISK_DISPLAY } from "@/modules/personal-profile/constants";
import { generateProfileMaticesAction } from "@/modules/personal-profile/api/actions";
import type { ProfileDiagnosis } from "@/modules/personal-profile/types";

/** Diagnóstico final del onboarding — mensaje de salida v2 (lectura conductual). */
export function ProfileSummary({
  diagnosis,
  onContinue,
  onEdit,
  onViewProfile,
}: {
  diagnosis: ProfileDiagnosis;
  onContinue: () => void;
  /** Si se pasa, muestra "Editar mis respuestas" (vuelve al wizard). */
  onEdit?: () => void;
  /** Si se pasa, muestra "Ver mi perfil completo". */
  onViewProfile?: () => void;
}) {
  const r = diagnosis.reading;

  // Matices de la IA (Fase A2): se piden tras montar, sin bloquear el cierre.
  const [matices, setMatices] = useState<string | null>(null);
  const [loadingMatices, setLoadingMatices] = useState(true);

  useEffect(() => {
    let alive = true;
    generateProfileMaticesAction()
      .then((res) => {
        if (alive) setMatices(res.matices);
      })
      .catch(() => {
        if (alive) setMatices(null);
      })
      .finally(() => {
        if (alive) setLoadingMatices(false);
      });
    return () => {
      alive = false;
    };
  }, []);

  const buttons = (
    <>
      <button
        className="btn btn-primary"
        style={{ marginTop: 18, width: "100%", justifyContent: "center" }}
        onClick={onContinue}
      >
        Construir mi Base Financiera
        <Icon name="chev" width={2.2} />
      </button>
      {onViewProfile ? (
        <button
          className="btn btn-ghost"
          style={{ marginTop: 10, width: "100%", justifyContent: "center" }}
          onClick={onViewProfile}
        >
          Ver mi perfil completo
        </button>
      ) : null}
      {onEdit ? (
        <button
          className="btn btn-ghost"
          style={{ marginTop: 10, width: "100%", justifyContent: "center" }}
          onClick={onEdit}
        >
          Editar mis respuestas
        </button>
      ) : null}
    </>
  );

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

        {r ? (
          <>
            <div className="step-eyebrow">Tu perfil financiero</div>
            <h1 className="step-title">
              Tu perfil financiero está <span className="it">listo</span>.
            </h1>
            <p className="muted" style={{ fontSize: 14, marginTop: 6 }}>
              Esta es tu lectura inicial. Puedes afinarla cuando quieras.
            </p>

            {/* Tu lectura */}
            <div className="card card-pad" style={{ marginTop: 14 }}>
              <div className="card-title">Tu lectura</div>
              <p style={{ fontSize: 14, lineHeight: 1.6, color: "var(--ink-2)", marginTop: 10 }}>
                {r.interpretation}
              </p>
            </div>

            {/* Una nota para ti (matices IA) — no se renderiza si la IA no responde */}
            {loadingMatices ? (
              <div className="card card-pad" style={{ marginTop: 14 }}>
                <div className="card-title">Una nota para ti</div>
                <p className="muted" style={{ fontSize: 13.5, marginTop: 10, lineHeight: 1.6 }}>
                  Afinando tu lectura personalizada…
                </p>
              </div>
            ) : matices ? (
              <div className="card card-pad" style={{ marginTop: 14 }}>
                <div className="card-title">Una nota para ti</div>
                <p style={{ fontSize: 14, lineHeight: 1.6, color: "var(--ink-2)", marginTop: 10 }}>
                  {matices}
                </p>
              </div>
            ) : null}

            {/* Scorecard */}
            <div className="card card-pad" style={{ marginTop: 14 }}>
              <div className="row" style={{ gap: 18, flexWrap: "wrap", alignItems: "center" }}>
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
                      strokeLinecap={diagnosis.completion >= 100 ? "butt" : "round"}
                      pathLength={100}
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
                    {r.riskDisplay}
                  </div>
                  <div className="muted" style={{ fontSize: 12.5, marginTop: 6, lineHeight: 1.5 }}>
                    {r.riskReading}
                  </div>
                </div>
              </div>

              <div
                style={{
                  marginTop: 16,
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))",
                  gap: 10,
                }}
              >
                {r.scorecard.map((s, i) => (
                  <div
                    key={i}
                    style={{
                      border: "1px solid var(--line)",
                      borderRadius: 12,
                      padding: "10px 12px",
                      background: "var(--surface-2, var(--chip))",
                    }}
                  >
                    <div className="label" style={{ fontSize: 11.5 }}>
                      {s.label}
                    </div>
                    <div className="num-xl" style={{ fontSize: 18, marginTop: 2 }}>
                      {s.value}
                    </div>
                    <div className="muted" style={{ fontSize: 11.5, marginTop: 3, lineHeight: 1.4 }}>
                      {s.reading}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Fortalezas */}
            <div className="card card-pad" style={{ marginTop: 14 }}>
              <div className="card-title">Lo que ya juega a tu favor</div>
              <ul style={{ marginTop: 10, paddingLeft: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 8 }}>
                {r.strengths.map((s, i) => (
                  <li key={i} style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
                    <Icon name="check" width={2.2} />
                    <span style={{ fontSize: 13.5, color: "var(--ink-2)", lineHeight: 1.5 }}>{s}</span>
                  </li>
                ))}
              </ul>
            </div>

            {/* Oportunidades */}
            <div className="card card-pad" style={{ marginTop: 14 }}>
              <div className="card-title">Tu siguiente nivel</div>
              <ul style={{ marginTop: 10, paddingLeft: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 8 }}>
                {r.opportunities.map((s, i) => (
                  <li key={i} style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
                    <Icon name="chev" width={2.2} />
                    <span style={{ fontSize: 13.5, color: "var(--ink-2)", lineHeight: 1.5 }}>{s}</span>
                  </li>
                ))}
              </ul>
            </div>

            {/* Acompañamiento */}
            <div className="card card-pad" style={{ marginTop: 14 }}>
              <div className="card-title">Cómo te acompañará Ascend AI</div>
              <p style={{ fontSize: 13.5, color: "var(--ink-2)", marginTop: 8, lineHeight: 1.5 }}>
                Tono <strong>{r.companionship.tone}</strong>. Empezaremos por:
              </p>
              <div style={{ marginTop: 10, display: "flex", flexWrap: "wrap", gap: 8 }}>
                {r.companionship.priorities.map((p, i) => (
                  <span
                    key={i}
                    style={{
                      fontSize: 12,
                      padding: "5px 10px",
                      borderRadius: 999,
                      background: "var(--chip)",
                      color: "var(--ink-2)",
                    }}
                  >
                    {p}
                  </span>
                ))}
              </div>
              <p className="muted" style={{ fontSize: 12, marginTop: 12, lineHeight: 1.5 }}>
                Sin {r.companionship.avoids.join(", ")}.
              </p>
            </div>

            {/* Ruta con porqué */}
            <div className="card card-pad" style={{ marginTop: 14 }}>
              <div className="card-title">Tu ruta sugerida</div>
              <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 12 }}>
                {r.route.map((s, i) => (
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
                    <div>
                      <div style={{ fontSize: 13.5, color: "var(--ink)", lineHeight: 1.4 }}>{s.step}</div>
                      <div className="muted" style={{ fontSize: 12, marginTop: 2, lineHeight: 1.4 }}>
                        {s.why}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {buttons}
          </>
        ) : (
          // Fallback: render anterior si por alguna razón no hay reading.
          <>
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
                      strokeLinecap={diagnosis.completion >= 100 ? "butt" : "round"}
                      pathLength={100}
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
                    {RISK_DISPLAY[diagnosis.riskClass] ?? diagnosis.riskClass}
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

            {buttons}
          </>
        )}
      </section>
    </div>
  );
}
