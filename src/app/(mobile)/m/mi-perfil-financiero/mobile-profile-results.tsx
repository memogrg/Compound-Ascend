import Link from "next/link";

import type { ProfileDraft, ProfileDiagnosis } from "@/modules/personal-profile/types";
import { RISK_DISPLAY } from "@/modules/personal-profile/constants";
import * as O from "@/modules/personal-profile/constants";
import { asRanked } from "@/modules/personal-profile/engine/ranking";

import { MobileHeader } from "../components/mobile-header";
import {
  MSummaryCard,
  MSectionHeader,
  MContentCard,
  MProgress,
  MChip,
} from "../components/content-kit";

/**
 * Resultados del ADN financiero en móvil — la vista que la web muestra en
 * /mi-perfil-financiero cuando el perfil está completo (ProfileDashboard). Se construye
 * con el MISMO buildDiagnosis(draft) del módulo; solo la UI es nueva. es-MX "tú".
 *
 * El kit entra PARCIAL a propósito: este perfil es narrativo, no un tablero de cifras. La
 * ÚNICA métrica numérica real es la completitud → esa sí va como MSummaryCard + MProgress.
 * El resto (tablero, identidad, objetivos, ruta) tiene valores que son PALABRAS ("Con
 * familia", "Intermedio", "Salir de deudas") y lecturas que son frases: no caben en
 * .m-met-v ni en .m-ds (ambos de una línea con elipsis, y en Space Mono aún más anchos),
 * así que conservan su maquetación y solo adoptan la superficie y los encabezados del kit.
 */

/** Etiqueta de una opción por su valor (reutiliza las listas del módulo). */
function label(list: O.Option[], value: string | undefined): string | null {
  if (!value) return null;
  return list.find((o) => o.value === value)?.label ?? value;
}
/** Coerce con asRanked: tolera datos pre-migración (campo single como string) sin romper. */
function labels(list: O.Option[], values: unknown): string[] {
  return asRanked(values).map((v) => list.find((o) => o.value === v)?.label ?? v);
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
        {/* Header sticky con el nombre CORTO y estable de la sección (no se trunca), con
            "Editar" como acción y Atrás a Inicio. */}
        <MobileHeader
          variant="inner"
          eyebrow="Tu ADN financiero"
          title="Mi Perfil Financiero"
          backHref="/m"
          backLabel="Volver a Inicio"
          badge={
            <Link href="/m/perfil-financiero" className="m-authlink" style={{ fontSize: 13.5 }}>
              Editar
            </Link>
          }
        />

        {/* Titular dinámico COMPLETO en el contenido (envuelve, se lee entero; no se trunca). */}
        <div style={{ marginBottom: 18 }}>
          {diagnosis.archetypeLabel ? (
            <h1 className="m-wz-title" style={{ marginTop: 2 }}>
              Eres <span className="g">{diagnosis.archetypeLabel}</span>
            </h1>
          ) : (
            <h1 className="m-wz-title" style={{ marginTop: 2 }}>
              Tu perfil <span className="g">financiero</span>
            </h1>
          )}
          {reading?.heroLine ? (
            <p className="muted" style={{ fontSize: 14, marginTop: 8, lineHeight: 1.5 }}>
              {reading.heroLine}
            </p>
          ) : null}
        </div>

        {/* Completitud: el ÚNICO número real de la pantalla ("78%" cabe de sobra en .m-sum-v)
            → resumen del kit, con el perfil de riesgo como chip y su lectura como subtexto. */}
        <MSummaryCard
          eyebrow="Perfil completado"
          value={`${diagnosis.completion}%`}
          chip={<MChip>{RISK_DISPLAY[diagnosis.riskClass]}</MChip>}
          sub={
            reading?.riskReading
              ? `Perfil de riesgo: ${reading.riskReading}`
              : `Tu perfil de riesgo es ${RISK_DISPLAY[diagnosis.riskClass].toLowerCase()}.`
          }
          slot={<MProgress value={diagnosis.completion / 100} height={8} />}
          style={{ marginBottom: 16 }}
        />

        {/* Narrativa — prosa que envuelve: encabezado del kit + tarjeta, nunca MDataRow. */}
        {diagnosis.narrative ? (
          <div style={{ marginBottom: 16 }}>
            <MSectionHeader title="Tu momento" />
            <MContentCard>
              <div style={{ fontSize: 14, lineHeight: 1.55 }}>{diagnosis.narrative}</div>
            </MContentCard>
          </div>
        ) : null}

        {/* Lo que esto dice de ti */}
        {reading?.whatThisSays ? (
          <div style={{ marginBottom: 16 }}>
            <MSectionHeader title="Lo que esto dice de ti" />
            <MContentCard>
              <div style={{ fontSize: 14, lineHeight: 1.55 }}>{reading.whatThisSays}</div>
            </MContentCard>
          </div>
        ) : null}

        {/* Superpoder + riesgo oculto. El superpoder conserva su énfasis con el tinte de
            acento (el .m-cc no lleva marco, así que el borde de antes se vuelve fondo). */}
        {reading ? (
          <>
            <div style={{ marginBottom: 16 }}>
              <MSectionHeader title="Tu superpoder" />
              <MContentCard style={{ background: "var(--accent-soft)" }}>
                <ReadBody title={reading.superpower.title} body={reading.superpower.body} />
              </MContentCard>
            </div>
            <div style={{ marginBottom: 16 }}>
              <MSectionHeader title="Tu riesgo oculto" />
              <MContentCard>
                <ReadBody title={reading.hiddenRisk.title} body={reading.hiddenRisk.body} />
              </MContentCard>
            </div>
          </>
        ) : null}

        {/* Tu tablero — NO es MMetricGrid ni MDataRow: sus valores son palabras ("Intermedio",
            "Salir de deudas") que en .m-met-v (Space Mono 19px, una línea) se truncarían, y
            cada `reading` es una frase que debe envolver. Conserva su fila + lectura debajo. */}
        {reading && reading.scorecard.length > 0 ? (
          <div style={{ marginBottom: 16 }}>
            <MSectionHeader title="Tu tablero" />
            <MContentCard>
              <div style={{ display: "grid", gap: 12 }}>
                {reading.scorecard.map((s, i) => (
                  <div key={i}>
                    <div className="between" style={{ gap: 10, alignItems: "baseline" }}>
                      <span style={{ fontSize: 13.5, fontWeight: 600 }}>{s.label}</span>
                      <span
                        className="mono"
                        style={{ fontSize: 13, color: "var(--accent)", textAlign: "right" }}
                      >
                        {s.value}
                      </span>
                    </div>
                    <div className="muted" style={{ fontSize: 12, marginTop: 2, lineHeight: 1.4 }}>
                      {s.reading}
                    </div>
                  </div>
                ))}
              </div>
            </MContentCard>
          </div>
        ) : null}

        {/* Identidad — misma razón que el tablero: "Con familia" o "Intermedio" no caben en
            una celda de métrica (~110px útiles a 320px). Rejilla propia, superficie del kit. */}
        {identity.length > 0 ? (
          <div style={{ marginBottom: 16 }}>
            <MSectionHeader title={draft.displayName ? draft.displayName : "Tu identidad"} />
            <MContentCard>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                {identity.map((it) => (
                  <div key={it.k} style={{ minWidth: 0 }}>
                    <div className="muted" style={{ fontSize: 11.5 }}>
                      {it.k}
                    </div>
                    <div style={{ fontSize: 14, fontWeight: 600, marginTop: 2 }}>{it.v}</div>
                  </div>
                ))}
              </div>
            </MContentCard>
          </div>
        ) : null}

        {/* Objetivos y prioridades — cada uno su sección; las etiquetas siguen siendo las
            píldoras de acento (.m-confirm-chip): MChip es mono y gris, pensado para estados,
            no para etiquetas de prosa como "Crear fondo de emergencia". */}
        {goals.length > 0 ? (
          <div style={{ marginBottom: 16 }}>
            <MSectionHeader title="Tus objetivos" />
            <MContentCard>
              <ChipRow items={goals} />
            </MContentCard>
          </div>
        ) : null}
        {priorities.length > 0 ? (
          <div style={{ marginBottom: 16 }}>
            <MSectionHeader title="Tus prioridades" />
            <MContentCard>
              <ChipRow items={priorities} />
            </MContentCard>
          </div>
        ) : null}

        {/* Ruta sugerida — pasos que envuelven: lista numerada propia dentro de la tarjeta. */}
        {diagnosis.suggestedPath.length > 0 ? (
          <div>
            <MSectionHeader title="Tu ruta sugerida" />
            <MContentCard>
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
            </MContentCard>
          </div>
        ) : null}
      </div>
    </div>
  );
}

/** Titular + cuerpo de una lectura (superpoder / riesgo oculto). El eyebrow y la tarjeta
 *  los aporta ahora la sección del kit; aquí solo queda el texto, que envuelve libre. */
function ReadBody({ title, body }: { title: string; body: string }) {
  return (
    <>
      <div style={{ fontSize: 15, fontWeight: 700 }}>{title}</div>
      <div className="muted" style={{ fontSize: 13, marginTop: 4, lineHeight: 1.5 }}>
        {body}
      </div>
    </>
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
