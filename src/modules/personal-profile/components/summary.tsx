"use client";

import { useEffect, useState } from "react";
import { Icon } from "@/components/ui/icon";
import { BrandMark } from "@/components/layout/brand-mark";
import { RISK_DISPLAY } from "@/modules/personal-profile/constants";
import { generateProfileMaticesAction } from "@/modules/personal-profile/api/actions";
import type { ProfileDiagnosis } from "@/modules/personal-profile/types";
import type { NextMove } from "@/modules/personal-profile/engine/next-move";

/** Cierre del onboarding (v4): resumen corto + próxima jugada dinámica. */
export function ProfileSummary({
  diagnosis,
  onContinue,
  onEdit,
  onViewProfile,
  nextMove,
}: {
  diagnosis: ProfileDiagnosis;
  onContinue: () => void;
  /** Si se pasa, muestra "Editar mis respuestas" (vuelve al wizard). */
  onEdit?: () => void;
  /** Si se pasa, muestra "Ver mi perfil completo". */
  onViewProfile?: () => void;
  /** Próxima jugada dinámica (Palanca 1); si falta, cae a la del reading. */
  nextMove?: NextMove | null;
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

  // CTA principal: próxima jugada dinámica → fallback a la del reading → clásico.
  const primaryLabel = nextMove?.cta ?? r?.nextMove.cta ?? "Construir mi Base Financiera";

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
            {/* a · HERO */}
            {r.name ? (
              <div className="step-eyebrow" style={{ marginBottom: 2 }}>
                {r.name},
              </div>
            ) : null}
            <h1 className="step-title">{r.heroLine}</h1>
            <p className="muted" style={{ fontSize: 14, marginTop: 8, lineHeight: 1.6 }}>
              <span className="it">{diagnosis.archetypeLabel}</span>. Aquí tienes lo esencial; el
              detalle completo está en tu perfil.
            </p>

            {/* b · Lo que esto dice de ti (voz humana: matices IA con fallback determinista) */}
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

            {/* c · 3 highlights compactos */}
            <div
              style={{
                marginTop: 14,
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
                gap: 10,
              }}
            >
              {[
                { label: "Tu superpoder", value: r.superpower.title.replace(/^Tu superpoder:\s*/i, "") },
                { label: "Tu siguiente nivel", value: r.opportunities[0] ?? "" },
                {
                  label: "Tu perfil",
                  value: `${diagnosis.archetypeLabel ?? "—"} · ${RISK_DISPLAY[diagnosis.riskClass] ?? diagnosis.riskClass}`,
                },
              ].map((h, i) => (
                <div
                  key={i}
                  style={{
                    border: "1px solid var(--line)",
                    borderRadius: 12,
                    padding: "10px 12px",
                    background: "var(--surface-2, var(--chip))",
                  }}
                >
                  <div className="label" style={{ fontSize: 11 }}>
                    {h.label}
                  </div>
                  <div style={{ fontSize: 13, color: "var(--ink)", marginTop: 4, lineHeight: 1.4 }}>
                    {h.value}
                  </div>
                </div>
              ))}
            </div>

            {/* d · Próxima jugada (dinámica; fallback al nextMove estático del reading) */}
            <div
              className="card card-pad"
              style={{ marginTop: 14, borderLeft: "3px solid var(--pos)" }}
            >
              <div className="card-title">{(nextMove ?? r.nextMove).title}</div>
              <p style={{ fontSize: 14, lineHeight: 1.6, color: "var(--ink-2)", marginTop: 8 }}>
                {(nextMove ?? r.nextMove).body}
              </p>
            </div>

            {/* e · Botones */}
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
