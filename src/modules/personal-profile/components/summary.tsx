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

  // Cierre v3: el CTA principal nombra la próxima jugada; fallback al label clásico.
  const primaryLabel = r?.nextMove.cta ?? "Construir mi Base Financiera";

  const buttons = (
    <>
      <button
        className="btn btn-primary"
        style={{ marginTop: 18, width: "100%", justifyContent: "center" }}
        onClick={onContinue}
      >
        {primaryLabel}
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
            {/* 1 · HERO emocional */}
            {r.name ? (
              <div className="step-eyebrow" style={{ marginBottom: 2 }}>
                {r.name},
              </div>
            ) : null}
            <h1 className="step-title">{r.heroLine}</h1>
            <p className="muted" style={{ fontSize: 14, marginTop: 8, lineHeight: 1.6 }}>
              Tu perfil combina <span className="it">{diagnosis.archetypeLabel}</span>
              {diagnosis.archetypeLabel2 ? (
                <>
                  {" "}
                  + <span className="it">{diagnosis.archetypeLabel2}</span>
                </>
              ) : null}
              . Compound Ascend usará esto para darte una ruta más estratégica y menos genérica.
            </p>

            {/* 2 · Identidad financiera */}
            <div className="card card-pad" style={{ marginTop: 14 }}>
              <div className="card-title">
                Eres {diagnosis.archetypeLabel}
                {diagnosis.archetypeLabel2 ? ` con rasgos de ${diagnosis.archetypeLabel2}` : ""}
              </div>
              {r.moneyScriptReading ? (
                <p style={{ fontSize: 14, lineHeight: 1.6, color: "var(--ink-2)", marginTop: 10 }}>
                  {r.moneyScriptReading}
                </p>
              ) : null}
              <p style={{ fontSize: 14, lineHeight: 1.6, color: "var(--ink-2)", marginTop: 8 }}>
                {r.interpretation}
              </p>
            </div>

            {/* 3 · Tu lectura en números */}
            <div className="card card-pad" style={{ marginTop: 14 }}>
              <div className="card-title">Tu lectura en números</div>
              <div className="row" style={{ gap: 18, flexWrap: "wrap", alignItems: "center", marginTop: 12 }}>
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

            {/* 4 · Lo que esto dice de ti (matices IA con fallback determinista) */}
            <div className="card card-pad" style={{ marginTop: 14 }}>
              <div className="card-title">Lo que esto dice de ti</div>
              {loadingMatices ? (
                <p className="muted" style={{ fontSize: 13.5, marginTop: 10, lineHeight: 1.6 }}>
                  Afinando tu lectura personalizada…
                </p>
              ) : (
                <p style={{ fontSize: 14, lineHeight: 1.6, color: "var(--ink-2)", marginTop: 10 }}>
                  {matices ?? r.whatThisSays}
                </p>
              )}
            </div>

            {/* 5 · Tu superpoder */}
            <div className="card card-pad" style={{ marginTop: 14 }}>
              <div className="card-title">{r.superpower.title}</div>
              <p style={{ fontSize: 14, lineHeight: 1.6, color: "var(--ink-2)", marginTop: 10 }}>
                {r.superpower.body}
              </p>
            </div>

            {/* 6 · Lo que debes cuidar (riesgo oculto en positivo) */}
            <div className="card card-pad" style={{ marginTop: 14 }}>
              <div className="card-title">{r.hiddenRisk.title}</div>
              <p style={{ fontSize: 14, lineHeight: 1.6, color: "var(--ink-2)", marginTop: 10 }}>
                {r.hiddenRisk.body}
              </p>
            </div>

            {/* 7 · Tu próxima jugada (destacada) */}
            <div
              className="card card-pad"
              style={{ marginTop: 14, borderColor: "var(--pos)", borderWidth: 1, borderStyle: "solid" }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                <div className="card-title" style={{ flex: 1 }}>
                  {r.nextMove.title}
                </div>
                {r.nextMove.timeEstimate ? (
                  <span
                    style={{
                      fontSize: 12,
                      padding: "5px 10px",
                      borderRadius: 999,
                      background: "var(--chip)",
                      color: "var(--ink-2)",
                    }}
                  >
                    {r.nextMove.timeEstimate}
                  </span>
                ) : null}
              </div>
              <p style={{ fontSize: 14, lineHeight: 1.6, color: "var(--ink-2)", marginTop: 10 }}>
                {r.nextMove.body}
              </p>
            </div>

            {/* 8 · Cómo te acompañará Ascend AI */}
            <div className="card card-pad" style={{ marginTop: 14 }}>
              <div className="card-title">Cómo te acompañará Ascend AI</div>
              <p style={{ fontSize: 13.5, color: "var(--ink-2)", marginTop: 8, lineHeight: 1.5 }}>
                Tono <strong>{r.companionship.tone}</strong>.
              </p>
              <div className="label" style={{ fontSize: 11.5, marginTop: 12 }}>
                Priorizará
              </div>
              <div style={{ marginTop: 6, display: "flex", flexWrap: "wrap", gap: 8 }}>
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
                Evitará: {r.companionship.avoids.join(", ")}.
              </p>
            </div>

            {/* 9 · Tu ruta sugerida */}
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
                      <div style={{ fontSize: 13.5, color: "var(--ink)", lineHeight: 1.4, fontWeight: 600 }}>
                        {s.step}
                      </div>
                      <div className="muted" style={{ fontSize: 12, marginTop: 2, lineHeight: 1.4 }}>
                        {s.why}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* 10 · Botones */}
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
