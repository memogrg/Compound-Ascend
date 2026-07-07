import Link from "next/link";

import type { ProfileDraft, ProfileDiagnosis } from "@/modules/personal-profile/types";
import { RISK_DISPLAY } from "@/modules/personal-profile/constants";
import * as O from "@/modules/personal-profile/constants";

/**
 * Resultados del ADN financiero en móvil — la vista que la web muestra en
 * /mi-perfil-financiero cuando el perfil está completo (ProfileDashboard). Se construye
 * con el MISMO buildDiagnosis(draft) del módulo; solo la UI es nueva. es-MX "tú".
 */

/** Etiqueta de una opción por su valor (reutiliza las listas del módulo). */
function label(list: O.Option[], value: string | undefined): string | null {
  if (!value) return null;
  return list.find((o) => o.value === value)?.label ?? value;
}
function labels(list: O.Option[], values: string[] | undefined): string[] {
  return (values ?? []).map((v) => list.find((o) => o.value === v)?.label ?? v);
}

export function MobileProfileResults({
  draft,
  diagnosis,
}: {
  draft: ProfileDraft;
  diagnosis: ProfileDiagnosis;
}) {
  const reading = diagnosis.reading;
  const goals = labels(O.GOALS, draft.goals);
  const priorities = labels(O.PRIORITIES, draft.priorities);
  const identity: { k: string; v: string }[] = [
    draft.age ? { k: "Edad", v: String(draft.age) } : null,
    draft.country ? { k: "País", v: draft.country } : null,
    draft.primaryCurrency ? { k: "Moneda", v: draft.primaryCurrency } : null,
    label(O.NUCLEUS, draft.financialNucleus) ? { k: "Núcleo", v: label(O.NUCLEUS, draft.financialNucleus)! } : null,
    draft.dependentsCount != null ? { k: "Dependientes", v: String(draft.dependentsCount) } : null,
    label(O.KNOWLEDGE_LEVELS, draft.knowledgeLevel)
      ? { k: "Conocimiento", v: label(O.KNOWLEDGE_LEVELS, draft.knowledgeLevel)! }
      : null,
  ].filter((x): x is { k: string; v: string } => x !== null);

  return (
    <div className="m-scroll m-scroll-flush">
      <div className="m-pad">
        {/* Header con volver + editar */}
        <div className="between" style={{ marginBottom: 16 }}>
          <Link href="/m" className="icon-btn" aria-label="Volver">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
              <path d="M15 18l-6-6 6-6" />
            </svg>
          </Link>
          <Link href="/m/perfil-financiero" className="m-authlink" style={{ fontSize: 13.5 }}>
            Editar
          </Link>
        </div>

        {/* Hero */}
        <div style={{ marginBottom: 18 }}>
          <div className="m-wz-eyebrow">Tu ADN financiero</div>
          {diagnosis.archetypeLabel ? (
            <h1 className="m-wz-title" style={{ marginTop: 6 }}>
              Eres <span className="g">{diagnosis.archetypeLabel}</span>
            </h1>
          ) : (
            <h1 className="m-wz-title" style={{ marginTop: 6 }}>
              Tu perfil <span className="g">financiero</span>
            </h1>
          )}
          {reading?.heroLine ? (
            <p className="muted" style={{ fontSize: 14, marginTop: 8, lineHeight: 1.5 }}>
              {reading.heroLine}
            </p>
          ) : null}
        </div>

        {/* Completitud + riesgo */}
        <div className="card card-p" style={{ marginBottom: 14 }}>
          <div className="between" style={{ marginBottom: 8 }}>
            <span className="ov">Perfil completado</span>
            <span className="mono" style={{ fontSize: 12, fontWeight: 700 }}>
              {diagnosis.completion}%
            </span>
          </div>
          <div className="bar" style={{ height: 8 }}>
            <i style={{ width: `${diagnosis.completion}%` }} />
          </div>
          <div className="between" style={{ marginTop: 12 }}>
            <span className="muted" style={{ fontSize: 13 }}>
              Perfil de riesgo
            </span>
            <span className="m-confirm-chip">{RISK_DISPLAY[diagnosis.riskClass]}</span>
          </div>
        </div>

        {/* Narrativa */}
        {diagnosis.narrative ? (
          <div className="card card-p" style={{ marginBottom: 14 }}>
            <div className="ov" style={{ marginBottom: 6 }}>
              Tu momento
            </div>
            <div style={{ fontSize: 14, lineHeight: 1.55 }}>{diagnosis.narrative}</div>
          </div>
        ) : null}

        {/* Lo que esto dice de ti */}
        {reading?.whatThisSays ? (
          <div className="card card-p" style={{ marginBottom: 14 }}>
            <div className="ov" style={{ marginBottom: 6 }}>
              Lo que esto dice de ti
            </div>
            <div style={{ fontSize: 14, lineHeight: 1.55 }}>{reading.whatThisSays}</div>
          </div>
        ) : null}

        {/* Superpoder + riesgo oculto */}
        {reading ? (
          <div style={{ display: "grid", gap: 12, marginBottom: 14 }}>
            <ReadCard eyebrow="Tu superpoder" title={reading.superpower.title} body={reading.superpower.body} accent />
            <ReadCard eyebrow="Tu riesgo oculto" title={reading.hiddenRisk.title} body={reading.hiddenRisk.body} />
          </div>
        ) : null}

        {/* Scorecard */}
        {reading && reading.scorecard.length > 0 ? (
          <div className="card card-p" style={{ marginBottom: 14 }}>
            <div className="ov" style={{ marginBottom: 10 }}>
              Tu tablero
            </div>
            <div style={{ display: "grid", gap: 12 }}>
              {reading.scorecard.map((s, i) => (
                <div key={i}>
                  <div className="between">
                    <span style={{ fontSize: 13.5, fontWeight: 600 }}>{s.label}</span>
                    <span className="mono" style={{ fontSize: 13, color: "var(--accent)" }}>
                      {s.value}
                    </span>
                  </div>
                  <div className="muted" style={{ fontSize: 12, marginTop: 2, lineHeight: 1.4 }}>
                    {s.reading}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : null}

        {/* Identidad */}
        {identity.length > 0 ? (
          <div className="card card-p" style={{ marginBottom: 14 }}>
            <div className="ov" style={{ marginBottom: 10 }}>
              {draft.displayName ? draft.displayName : "Tu identidad"}
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              {identity.map((it) => (
                <div key={it.k}>
                  <div className="muted" style={{ fontSize: 11.5 }}>
                    {it.k}
                  </div>
                  <div style={{ fontSize: 14, fontWeight: 600, marginTop: 2 }}>{it.v}</div>
                </div>
              ))}
            </div>
          </div>
        ) : null}

        {/* Objetivos + prioridades */}
        {goals.length > 0 || priorities.length > 0 ? (
          <div className="card card-p" style={{ marginBottom: 14 }}>
            {goals.length > 0 ? (
              <div style={{ marginBottom: priorities.length > 0 ? 14 : 0 }}>
                <div className="ov" style={{ marginBottom: 8 }}>
                  Tus objetivos
                </div>
                <ChipRow items={goals} />
              </div>
            ) : null}
            {priorities.length > 0 ? (
              <div>
                <div className="ov" style={{ marginBottom: 8 }}>
                  Tus prioridades
                </div>
                <ChipRow items={priorities} />
              </div>
            ) : null}
          </div>
        ) : null}

        {/* Ruta sugerida */}
        {diagnosis.suggestedPath.length > 0 ? (
          <div className="card card-p">
            <div className="ov" style={{ marginBottom: 10 }}>
              Tu ruta sugerida
            </div>
            <ol style={{ margin: 0, paddingLeft: 0, listStyle: "none", display: "grid", gap: 10 }}>
              {diagnosis.suggestedPath.map((step, i) => (
                <li key={i} className="row" style={{ alignItems: "flex-start", gap: 10 }}>
                  <span
                    className="mono"
                    style={{
                      width: 22,
                      height: 22,
                      borderRadius: "50%",
                      background: "var(--accent-soft)",
                      color: "var(--accent)",
                      display: "grid",
                      placeItems: "center",
                      fontSize: 11,
                      flex: "none",
                    }}
                  >
                    {i + 1}
                  </span>
                  <span style={{ fontSize: 13.5, lineHeight: 1.45 }}>{step}</span>
                </li>
              ))}
            </ol>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function ReadCard({
  eyebrow,
  title,
  body,
  accent,
}: {
  eyebrow: string;
  title: string;
  body: string;
  accent?: boolean;
}) {
  return (
    <div
      className="card card-p"
      style={accent ? { borderColor: "color-mix(in srgb, var(--accent) 30%, var(--border))" } : undefined}
    >
      <div className="ov" style={{ color: accent ? "var(--accent)" : "var(--text-muted)" }}>
        {eyebrow}
      </div>
      <div style={{ fontSize: 15, fontWeight: 700, marginTop: 6 }}>{title}</div>
      <div className="muted" style={{ fontSize: 13, marginTop: 4, lineHeight: 1.5 }}>
        {body}
      </div>
    </div>
  );
}

function ChipRow({ items }: { items: string[] }) {
  return (
    <div className="m-chips">
      {items.map((it, i) => (
        <span key={i} className="m-confirm-chip">
          {it}
        </span>
      ))}
    </div>
  );
}
