import Link from "next/link";
import { Icon } from "@/components/ui/icon";
import { DonutCenter } from "@/components/charts/donut-center";
import * as O from "@/modules/personal-profile/constants";
import type { Option } from "@/modules/personal-profile/constants";
import type { Archetype, ProfileDraft, ProfileDiagnosis } from "@/modules/personal-profile/types";
import { computeArchetype } from "@/modules/personal-profile/engine/archetype-engine";
import type { NextMove } from "@/modules/personal-profile/engine/next-move";
import type { Evolution } from "@/modules/personal-profile/engine/evolution";
import { ARCHETYPE_PLAYBOOKS } from "@/lib/ai/advisor-knowledge";

/** Etiquetas en español de la emoción dominante (para el motor financiero). */
const EMOTION_LABEL: Record<string, string> = {
  tranquilidad: "Tranquilidad",
  motivacion: "Motivación",
  confusion: "Confusión",
  presion: "Presión",
  culpa: "Culpa",
  miedo: "Miedo",
  frustracion: "Frustración",
  evasion: "Evitar el tema",
};

const URGENCY: Record<string, string> = {
  baja: "Baja",
  media: "Media",
  alta: "Alta",
  critica: "Crítica",
};
const EMERGENCY: Record<string, string> = {
  si: "Sí, lo tengo",
  construyendo: "Lo estoy construyendo",
  no: "No",
  no_se: "No sé cuánto debería tener",
};

function pick(options: Option[], value?: string): string | null {
  if (!value) return null;
  return options.find((o) => o.value === value)?.label ?? value;
}
function pickMany(options: Option[], values?: string[]): string[] {
  return (values ?? []).map((v) => options.find((o) => o.value === v)?.label ?? v);
}
/** Paleta de 3 tonos de verde para el donut de arquetipos (top 3). */
const ARCH_COLORS = [
  "var(--pos)",
  "color-mix(in srgb, var(--pos) 55%, var(--bg))",
  "color-mix(in srgb, var(--pos) 30%, var(--bg))",
];

/** Minúscula inicial para hilar etiquetas dentro de una frase ("Buscas comprar casa."). */
function lc(s: string): string {
  return s.charAt(0).toLowerCase() + s.slice(1);
}
/** "YYYY-MM-DD" → fecha legible en español (cae al ISO si no parsea). */
function formatSince(iso: string): string {
  const d = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("es", { day: "numeric", month: "long", year: "numeric" });
}

/**
 * Dashboard de resultados del perfil financiero: muestra todo lo capturado en
 * el wizard de forma visual, con la opción de editar (retomar el wizard).
 */
export function ProfileDashboard({
  draft,
  diagnosis,
  readOnly = false,
  nextMove,
  aiReading,
  evolution,
}: {
  draft: ProfileDraft;
  diagnosis: ProfileDiagnosis;
  /** Vista del invitado: hereda el perfil del hogar, sin acciones de edición. */
  readOnly?: boolean;
  /** Próxima jugada dinámica (Palanca 2); solo se muestra al dueño. */
  nextMove?: NextMove;
  /** Nota personal escrita por la IA, cacheada (Palanca 3); fallback al determinista. */
  aiReading?: string | null;
  /** Evolución del perfil en el tiempo (Palanca 4-2); solo se muestra al dueño. */
  evolution?: Evolution | null;
}) {
  const completion = diagnosis.completion;
  const concerns = pickMany(
    O.CONCERNS,
    draft.mainConcerns ?? (draft.mainConcern ? [draft.mainConcern] : []),
  );
  const goals = pickMany(O.GOALS, draft.goals);
  const priorities = pickMany(O.PRIORITIES, draft.priorities);
  const insurances = pickMany(O.INSURANCES, draft.insurances);
  const topics = pickMany(O.TOPICS, draft.topicsToLearn);

  // Lectura espejo (B1): si el perfil ya trae la lectura, el tab la lidera.
  const r = diagnosis.reading;
  const riskDisplay = O.RISK_DISPLAY[diagnosis.riskClass] ?? diagnosis.riskClass;

  // "Lo que My Agent C+ sabe de ti": líneas en 2ª persona derivadas del perfil.
  const goalLabel = goals[0] ?? pick(O.DINERO_PRIMERO, draft.dineroPrimero?.[0]) ?? undefined;
  const knowledgeLabel = pick(O.KNOWLEDGE_LEVELS, draft.knowledgeLevel) ?? undefined;
  const knows: string[] = [];
  if (goalLabel) knows.push(`Buscas ${lc(goalLabel)}.`);
  knows.push(`Tu tolerancia al riesgo es ${riskDisplay}.`);
  if (knowledgeLabel) knows.push(`Tu conocimiento financiero es ${lc(knowledgeLabel)}.`);
  if (concerns[0]) knows.push(`Te preocupa ${lc(concerns[0])}.`);
  if (typeof draft.discipline === "number") knows.push(`Tu disciplina es ${draft.discipline}/5.`);
  if (typeof draft.impulsivity === "number")
    knows.push(`Tu impulsividad es ${draft.impulsivity}/5.`);

  // Mapa de arquetipos (B2a): top 3 normalizado para sumar exactamente 100%.
  const arche = computeArchetype(draft);
  const top3 = Object.entries(arche.scores)
    .filter(([, s]) => s > 0)
    .sort((x, y) => y[1] - x[1])
    .slice(0, 3);
  const subtotal = top3.reduce((acc, [, s]) => acc + s, 0);
  const bars = top3.map(([a, s]) => ({
    label: ARCHETYPE_PLAYBOOKS[a as Archetype].label,
    pct: Math.round((s / subtotal) * 100),
  }));
  // Ajuste de redondeo: la barra mayor absorbe la diferencia para totalizar 100%.
  if (bars[0]) bars[0].pct += 100 - bars.reduce((acc, b) => acc + b.pct, 0);

  // Motor financiero (B2a): manifiesto en 2ª persona + mini-stats (solo lo que exista).
  const dominantValue = pick(O.DINERO_PRIMERO, draft.dineroPrimero?.[0]);
  const topPriority = pick(O.PRIORITIES, draft.priorities?.[0]);
  const topConcern = pick(O.CONCERNS, draft.mainConcerns?.[0] ?? draft.mainConcern);
  const emotion = EMOTION_LABEL[arche.dominantEmotion];

  // Relación con el dinero (B2b): lectura interpretativa en 2ª persona (solo lo que aplique).
  const relation: { label: string; text: string }[] = [];
  const decide =
    typeof draft.discipline === "number" && draft.discipline >= 4
      ? "con estructura y visión de largo plazo"
      : draft.reviewHabit === "semanal" || draft.reviewHabit === "diario"
        ? "revisando seguido"
        : null;
  if (decide) relation.push({ label: "Cómo decides", text: decide });
  const spend =
    typeof draft.impulsivity === "number" && draft.impulsivity <= 2
      ? "con autocontrol, sin depender de fuerza de voluntad"
      : typeof draft.impulsivity === "number" && draft.impulsivity >= 4
        ? "según tu ánimo: conviene una regla simple antes de comprar"
        : null;
  if (spend) relation.push({ label: "Cómo gastas", text: spend });
  const motiva = r?.moneyScriptReading ?? (dominantValue ? lc(dominantValue) : null);
  if (motiva) relation.push({ label: "Qué te motiva", text: motiva });
  const careOf = r?.hiddenRisk.body ?? r?.moneyScriptReading ?? null;
  if (careOf) relation.push({ label: "Qué cuidar", text: careOf });

  // Protección (Palanca 5): lectura de la base + brechas a fortalecer.
  const protectionReading =
    draft.hasEmergencyFund === "si"
      ? "Tu base está cubierta: tienes fondo de emergencia, el cimiento que te deja crecer tranquilo."
      : draft.hasEmergencyFund === "construyendo"
        ? "Estás construyendo tu fondo de emergencia — vas en camino a una base sólida."
        : "Tu base aún está expuesta: construir tu fondo de emergencia es tu próxima prioridad.";
  const protectionGaps: string[] = [];
  if (insurances.length === 0)
    protectionGaps.push("Sin seguros registrados: vale revisar tu cobertura ante imprevistos.");
  if ((draft.dependentsCount ?? 0) > 0)
    protectionGaps.push("Con dependientes, prioriza seguro de vida y un fondo más amplio.");

  return (
    <div className="grid">
      {/* Hero v2: lidera con el arquetipo (lectura espejo); fallback al hero clásico */}
      {r ? (
        <section className="dash-hero">
          <div className="card card-pad prof-hero">
            <div className="label">Tu perfil</div>
            <h2 className="big">
              Tu perfil es <em>{diagnosis.archetypeLabel}</em>
            </h2>
            {diagnosis.archetypeLabel2 ? (
              <div className="trait">
                con rasgos de <b>{diagnosis.archetypeLabel2}</b>
              </div>
            ) : null}
            <p className="phrase">{r.heroLine}</p>
            <p className="interp">{r.interpretation}</p>
            {readOnly ? null : (
              <Link className="btn btn-secondary" href="/bienvenida" style={{ marginTop: 16 }}>
                <Icon name="edit" width={2} /> Editar mi perfil
              </Link>
            )}
          </div>

          <div
            className="card card-pad"
            style={{ display: "flex", alignItems: "center", gap: 18, flexWrap: "wrap" }}
          >
            <Ring value={completion} />
            <div style={{ flex: 1, minWidth: 160 }}>
              <div className="label">Perfil de riesgo</div>
              <div className="num-xl" style={{ fontSize: 24, marginTop: 4 }}>
                {riskDisplay}
              </div>
              <div className="muted" style={{ fontSize: 12.5, marginTop: 6, lineHeight: 1.5 }}>
                {r.riskReading}
              </div>
            </div>
          </div>
        </section>
      ) : (
        <section className="dash-hero">
          <div
            className="card card-pad"
            style={{ display: "flex", alignItems: "center", gap: 22, flexWrap: "wrap" }}
          >
            <Ring value={completion} />
            <div style={{ flex: 1, minWidth: 200 }}>
              <div className="label">Perfil de riesgo</div>
              <div className="num-xl" style={{ fontSize: 30, marginTop: 4 }}>
                {riskDisplay}
              </div>
              <div className="muted" style={{ fontSize: 12.5, marginTop: 6, lineHeight: 1.5 }}>
                {readOnly
                  ? "Perfil del hogar (solo lectura). Lo configuró quien creó el hogar."
                  : `Perfil completado al ${completion}%. Cuanto más completo, mejores tus recomendaciones.`}
              </div>
              {readOnly ? null : (
                <Link className="btn btn-primary" href="/bienvenida" style={{ marginTop: 14 }}>
                  <Icon name="edit" width={2} /> Editar mi perfil
                </Link>
              )}
            </div>
          </div>

          <div className="card card-pad">
            <div className="card-title">Tu lectura</div>
            <p style={{ fontSize: 13.5, lineHeight: 1.6, color: "var(--ink-2)", marginTop: 10 }}>
              {diagnosis.narrative}
            </p>
          </div>
        </section>
      )}

      {/* Próxima jugada dinámica (Palanca 2): la única siguiente acción de impacto. */}
      {nextMove && !readOnly ? (
        <div className="card card-pad" style={{ borderLeft: "3px solid var(--pos)" }}>
          <div className="card-title">{nextMove.title}</div>
          <p style={{ fontSize: 13.5, lineHeight: 1.6, color: "var(--ink-2)", marginTop: 8 }}>
            {nextMove.body}
          </p>
          <Link className="btn btn-primary" href={nextMove.route} style={{ marginTop: 14 }}>
            {nextMove.cta}
            <Icon name="chev" width={2} />
          </Link>
        </div>
      ) : null}

      {/* Cómo has evolucionado (Palanca 4-2): solo avances, framing positivo. */}
      {evolution && !readOnly ? (
        <Card title="Cómo has evolucionado">
          <div className="label" style={{ fontSize: 11.5 }}>
            Desde {formatSince(evolution.since)}
          </div>
          <div style={{ marginTop: 4 }}>
            {evolution.changes.map((c, i) => (
              <div key={i} className="li-ic plan">
                <span className="ic">
                  <Icon name="spark" width={2.2} />
                </span>
                <div className="tx">{c}</div>
              </div>
            ))}
          </div>
        </Card>
      ) : null}

      {/* Lectura espejo (B1): identidad-frase, números, significado, superpoder, riesgo, IA */}
      {r ? (
        <>
          {r.moneyScriptReading ? (
            <Card title="Tu relación con el dinero, en una frase">
              <p style={{ fontSize: 14, lineHeight: 1.6, color: "var(--ink-2)" }}>
                {r.moneyScriptReading}
              </p>
            </Card>
          ) : null}

          <Card title="Tu lectura en números">
            <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
              {r.scorecard.map((s, i) => (
                <div key={i} className="cstat" style={{ flex: "1 1 160px" }}>
                  <div className="k">{s.label}</div>
                  <div className="v" style={{ fontSize: 18 }}>
                    {s.value}
                  </div>
                  <div className="muted" style={{ fontSize: 11.5, marginTop: 4, lineHeight: 1.4 }}>
                    {s.reading}
                  </div>
                </div>
              ))}
            </div>
          </Card>

          <Card title="Lo que esto dice de ti">
            <p style={{ fontSize: 14, lineHeight: 1.6, color: "var(--ink-2)" }}>
              {aiReading ?? r.whatThisSays}
            </p>
          </Card>

          <section className="cols-2">
            <Card title={r.superpower.title}>
              <p style={{ fontSize: 14, lineHeight: 1.6, color: "var(--ink-2)" }}>
                {r.superpower.body}
              </p>
            </Card>
            <Card title={r.hiddenRisk.title}>
              <p style={{ fontSize: 14, lineHeight: 1.6, color: "var(--ink-2)" }}>
                {r.hiddenRisk.body}
              </p>
            </Card>
          </section>

          <Card title="Cómo te acompaña My Agent C+">
            <p style={{ fontSize: 13.5, color: "var(--ink-2)", lineHeight: 1.5 }}>
              Tono <strong>{r.companionship.tone}</strong>.
            </p>
            <div className="label" style={{ fontSize: 11.5, marginTop: 12, marginBottom: 6 }}>
              Priorizará
            </div>
            <ChipList items={r.companionship.priorities} />
            <p className="muted" style={{ fontSize: 12, marginTop: 12, lineHeight: 1.5 }}>
              Evitará: {r.companionship.avoids.join(", ")}.
            </p>
            {knows.length > 0 ? (
              <div style={{ marginTop: 16 }}>
                <div className="label" style={{ fontSize: 11.5, marginBottom: 6 }}>
                  Lo que My Agent C+ sabe de ti
                </div>
                <div>
                  {knows.map((k, i) => (
                    <div key={i} className="know-row">
                      <span className="kd" />
                      <div>{k}</div>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
          </Card>
        </>
      ) : null}

      {/* Mapa de arquetipos (B2a) */}
      {bars.length > 0 ? (
        <Card title="Tu mapa de arquetipos">
          <div className="arc-wrap">
            <div className="arc-donut">
              <svg width="150" height="150" viewBox="0 0 42 42">
                <circle
                  cx="21"
                  cy="21"
                  r="15.915"
                  fill="none"
                  stroke="var(--surface-2)"
                  strokeWidth="5"
                />
                {bars.map((b, i) => {
                  const start = bars.slice(0, i).reduce((s, x) => s + x.pct, 0);
                  return (
                    <circle
                      key={i}
                      cx="21"
                      cy="21"
                      r="15.915"
                      fill="none"
                      stroke={ARCH_COLORS[i] ?? "var(--pos)"}
                      strokeWidth="5"
                      pathLength={100}
                      strokeDasharray={`${b.pct} ${100 - b.pct}`}
                      strokeDashoffset={`${25 - start}`}
                      strokeLinecap="butt"
                    />
                  );
                })}
              </svg>
              <div className="cc">
                <DonutCenter
                  value={bars[0]?.label ?? ""}
                  sub="Dominante"
                  inner={96}
                  mode="label"
                  valueClassName="n"
                  subClassName="t"
                />
              </div>
            </div>
            <div className="arc-bars">
              {bars.map((b, i) => (
                <div key={i} className="arc-b">
                  <span className="abn">{b.label}</span>
                  <span className="abr">
                    <span
                      className="abf"
                      style={{
                        width: `${b.pct}%`,
                        background: ARCH_COLORS[i] ?? "var(--pos)",
                      }}
                    />
                  </span>
                  <span className="abp">{b.pct}%</span>
                </div>
              ))}
            </div>
          </div>
          <p className="muted" style={{ fontSize: 12.5, marginTop: 14, lineHeight: 1.5 }}>
            Tu perfil no es una etiqueta fija: es una lectura que evoluciona con tus hábitos, metas
            y datos.
          </p>
        </Card>
      ) : null}

      {/* Tu motor financiero (B2a) */}
      {dominantValue || topPriority || topConcern || emotion ? (
        <Card title="Tu motor financiero">
          {dominantValue || topPriority || topConcern ? (
            <p style={{ fontSize: 14, lineHeight: 1.6, color: "var(--ink-2)" }}>
              {dominantValue ? `Para ti, el dinero busca ${lc(dominantValue)}. ` : ""}
              {topPriority ? `Tu prioridad dominante es ${lc(topPriority)}. ` : ""}
              {topConcern ? `Hoy te ocupa ${lc(topConcern)}.` : ""}
            </p>
          ) : null}
          <div className="eng-grid" style={{ marginTop: 14 }}>
            {dominantValue ? (
              <div className="eng-card">
                <div className="eng-lb">Lo que más quieres</div>
                <div className="eng-v">{dominantValue}</div>
              </div>
            ) : null}
            {topPriority ? (
              <div className="eng-card">
                <div className="eng-lb">Prioridad dominante</div>
                <div className="eng-v">{topPriority}</div>
              </div>
            ) : null}
            {topConcern ? (
              <div className="eng-card">
                <div className="eng-lb">Preocupación activa</div>
                <div className="eng-v">{topConcern}</div>
              </div>
            ) : null}
            {emotion ? (
              <div className="eng-card">
                <div className="eng-lb">Motivador emocional</div>
                <div className="eng-v">{emotion}</div>
              </div>
            ) : null}
          </div>
        </Card>
      ) : null}

      {/* Identidad */}
      <Card title="Identidad" editHint={!readOnly}>
        <div className="cols-2" style={{ gap: "14px 28px" }}>
          <Info label="Nombre" value={draft.displayName} />
          <Info label="Edad" value={draft.age ? `${draft.age} años` : undefined} />
          <Info label="País" value={draft.country} />
          <Info
            label="Moneda principal"
            value={pick(O.CURRENCIES, draft.primaryCurrency) ?? undefined}
          />
          <Info
            label="Gestión de finanzas"
            value={pick(O.NUCLEUS, draft.financialNucleus) ?? undefined}
          />
          <Info
            label="Dependientes"
            value={
              typeof draft.dependentsCount === "number" ? String(draft.dependentsCount) : undefined
            }
          />
        </div>
        {draft.financialNucleus === "familia" && (draft.householdMemberEmails?.length ?? 0) > 0 ? (
          <div style={{ marginTop: 12 }}>
            <div className="label" style={{ marginBottom: 6 }}>
              Miembros invitados
            </div>
            <ChipList items={draft.householdMemberEmails ?? []} />
          </div>
        ) : null}
      </Card>

      {/* Etapa y enfoque */}
      <Card title="Tu momento financiero">
        <div className="cols-2" style={{ gap: "14px 28px" }}>
          <Info label="Etapa" value={pick(O.LIFE_STAGES, draft.lifeStage?.[0]) ?? undefined} />
          <Info
            label="Urgencia de mejorar"
            value={draft.urgency ? URGENCY[draft.urgency] : undefined}
          />
        </div>
        {typeof draft.perceivedControl === "number" ? (
          <ScaleBar label="Control percibido de tus finanzas" value={draft.perceivedControl} />
        ) : null}
        {concerns.length > 0 ? (
          <div style={{ marginTop: 14 }}>
            <div className="label" style={{ marginBottom: 6 }}>
              Lo que más te preocupa
            </div>
            <ChipList items={concerns} />
          </div>
        ) : null}
      </Card>

      {/* Objetivos y prioridades */}
      {(goals.length > 0 || priorities.length > 0) && (
        <Card title="Objetivos y prioridades">
          {goals.length > 0 ? (
            <div>
              <div className="label" style={{ marginBottom: 6 }}>
                Quiero lograr
              </div>
              <ChipList items={goals} />
            </div>
          ) : null}
          {priorities.length > 0 ? (
            <div style={{ marginTop: 14 }}>
              <div className="label" style={{ marginBottom: 6 }}>
                Mis prioridades
              </div>
              <ChipList items={priorities} accent />
            </div>
          ) : null}
        </Card>
      )}

      {/* Comportamiento */}
      <Card title="Tu relación con el dinero">
        {typeof draft.discipline === "number" ? (
          <ScaleBar label="Disciplina con un plan" value={draft.discipline} />
        ) : null}
        {typeof draft.impulsivity === "number" ? (
          <ScaleBar label="Impulsividad al comprar" value={draft.impulsivity} tone="warn" />
        ) : null}
        <div className="cols-2" style={{ gap: "14px 28px", marginTop: 14 }}>
          <Info
            label="Revisa sus finanzas"
            value={pick(O.REVIEW_HABITS, draft.reviewHabit) ?? undefined}
          />
          <Info
            label="Nivel de conocimiento"
            value={pick(O.KNOWLEDGE_LEVELS, draft.knowledgeLevel) ?? undefined}
          />
        </div>
        {(draft.hardest?.length ?? 0) > 0 ? (
          <div style={{ marginTop: 14 }}>
            <div className="label" style={{ marginBottom: 6 }}>
              Lo que más le cuesta
            </div>
            <ChipList items={pickMany(O.HARDEST, draft.hardest)} />
          </div>
        ) : null}
        {topics.length > 0 ? (
          <div style={{ marginTop: 14 }}>
            <div className="label" style={{ marginBottom: 6 }}>
              Quiere aprender sobre
            </div>
            <ChipList items={topics} />
          </div>
        ) : null}
        {relation.length > 0 ? (
          <div style={{ marginTop: 16, borderTop: "1px solid var(--line)", paddingTop: 14 }}>
            <div className="label" style={{ fontSize: 11.5, marginBottom: 8 }}>
              Tu lectura, en corto
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {relation.map((it, i) => (
                <div key={i} style={{ fontSize: 13.5, color: "var(--ink-2)", lineHeight: 1.5 }}>
                  <strong style={{ color: "var(--ink)" }}>{it.label}:</strong> {it.text}
                </div>
              ))}
            </div>
          </div>
        ) : null}
      </Card>

      {/* Riesgo y protección */}
      <section className="cols-2">
        <Card title="Perfil de riesgo">
          <div className="num-xl" style={{ fontSize: 24, marginBottom: 6 }}>
            {O.RISK_DISPLAY[diagnosis.riskClass] ?? diagnosis.riskClass}
          </div>
          <p style={{ fontSize: 13.5, lineHeight: 1.6, color: "var(--ink-2)" }}>
            {O.RISK_READING[diagnosis.riskClass]}
          </p>
          <p style={{ fontSize: 13.5, lineHeight: 1.6, color: "var(--ink-2)", marginTop: 10 }}>
            <strong>Esto te permite:</strong> {O.RISK_ALLOWS[diagnosis.riskClass]}
          </p>
          <div className="label" style={{ fontSize: 11.5, marginTop: 12, marginBottom: 6 }}>
            Debes cuidar
          </div>
          <ul
            style={{
              margin: 0,
              paddingLeft: 0,
              listStyle: "none",
              display: "flex",
              flexDirection: "column",
              gap: 6,
            }}
          >
            {O.RISK_GUARD[diagnosis.riskClass].map((g, i) => (
              <li key={i} style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
                <Icon name="chev" width={2} />
                <span style={{ fontSize: 13, color: "var(--ink-2)", lineHeight: 1.5 }}>{g}</span>
              </li>
            ))}
          </ul>
          <div style={{ marginTop: 14 }} />
          <Info
            label="Ante una caída del 15%"
            value={pick(O.LOSS_REACTIONS, draft.lossReaction?.[0]) ?? undefined}
          />
          <Info
            label="Prefiere"
            value={pick(O.RISK_PREFERENCES, draft.riskPreference) ?? undefined}
          />
          <Info
            label="Horizonte"
            value={pick(O.INVEST_HORIZONS, draft.investHorizon) ?? undefined}
          />
          <Info
            label="Ha invertido antes"
            value={draft.hasInvested === undefined ? undefined : draft.hasInvested ? "Sí" : "No"}
          />
        </Card>
        <Card title="Tu protección">
          <p style={{ fontSize: 13.5, color: "var(--ink-2)", lineHeight: 1.5 }}>
            {protectionReading}
          </p>
          <div style={{ marginTop: 8 }}>
            <Info
              label="Fondo de emergencia"
              value={draft.hasEmergencyFund ? EMERGENCY[draft.hasEmergencyFund] : undefined}
            />
          </div>
          {insurances.length > 0 ? (
            <div style={{ marginTop: 12 }}>
              <div className="label" style={{ marginBottom: 6 }}>
                Seguros actuales
              </div>
              <ChipList items={insurances} />
            </div>
          ) : null}
          {protectionGaps.length > 0 ? (
            <div style={{ marginTop: 14 }}>
              <div className="label" style={{ marginBottom: 6 }}>
                A fortalecer
              </div>
              <ul
                style={{
                  margin: 0,
                  paddingLeft: 0,
                  listStyle: "none",
                  display: "flex",
                  flexDirection: "column",
                  gap: 6,
                }}
              >
                {protectionGaps.map((g, i) => (
                  <li key={i} style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
                    <Icon name="chev" width={2} />
                    <span style={{ fontSize: 13, color: "var(--ink-2)", lineHeight: 1.5 }}>{g}</span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </Card>
      </section>

      {/* Acompañamiento + Rich Life */}
      <section className="cols-2">
        <Card title="Cómo te acompañamos">
          <Info label="Tono" value={pick(O.COACHING_TONES, draft.coachingTone) ?? undefined} />
          <Info
            label="Frecuencia"
            value={pick(O.COACHING_FREQUENCIES, draft.coachingFrequency) ?? undefined}
          />
          <Info
            label="Intensidad de alertas"
            value={pick(O.ALERT_INTENSITIES, draft.alertIntensity) ?? undefined}
          />
        </Card>
        <Card title="Tu Rich Life">
          <Info
            label="Tu frase"
            value={pick(O.RICH_LIFE_PHRASES, draft.richLifePhrase?.[0]) ?? undefined}
          />
          {draft.richLifeVision ? (
            <p
              style={{
                fontSize: 13,
                lineHeight: 1.6,
                color: "var(--ink-2)",
                marginTop: 10,
                fontStyle: "italic",
              }}
            >
              “{draft.richLifeVision}”
            </p>
          ) : null}
        </Card>
      </section>
    </div>
  );
}

function Ring({ value }: { value: number }) {
  return (
    <div className="ring-wrap">
      <svg width="108" height="108" viewBox="0 0 42 42">
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
          stroke="var(--pos)"
          strokeWidth="4"
          strokeLinecap={value >= 100 ? "butt" : "round"}
          pathLength={100}
          strokeDasharray={`${value} 100`}
          strokeDashoffset="25"
          transform="rotate(-90 21 21)"
        />
      </svg>
      <div className="ring-center">
        <div className="num-xl" style={{ fontSize: 24 }}>
          {value}%
        </div>
      </div>
    </div>
  );
}

function Card({
  title,
  children,
  editHint,
}: {
  title: string;
  children: React.ReactNode;
  editHint?: boolean;
}) {
  return (
    <div className="card card-pad">
      <div className="row" style={{ justifyContent: "space-between", alignItems: "center" }}>
        <div className="card-title">{title}</div>
        {editHint ? (
          <Link
            className="btn btn-ghost"
            href="/bienvenida"
            style={{ fontSize: 12.5, padding: "6px 10px" }}
          >
            Editar
          </Link>
        ) : null}
      </div>
      <div style={{ marginTop: 12 }}>{children}</div>
    </div>
  );
}

function Info({ label, value }: { label: string; value?: string }) {
  return (
    <div style={{ padding: "6px 0" }}>
      <div className="label" style={{ fontSize: 11.5 }}>
        {label}
      </div>
      <div
        style={{
          fontSize: 14,
          fontWeight: 500,
          marginTop: 3,
          color: value ? "var(--ink)" : "var(--muted)",
        }}
      >
        {value ?? "—"}
      </div>
    </div>
  );
}

function ChipList({ items, accent }: { items: string[]; accent?: boolean }) {
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
      {items.map((it, i) => (
        <span
          key={i}
          className="chip"
          style={
            accent
              ? {
                  background: "color-mix(in srgb,var(--gold) 16%, transparent)",
                  color: "var(--gold)",
                }
              : undefined
          }
        >
          {it}
        </span>
      ))}
    </div>
  );
}

function ScaleBar({ label, value, tone }: { label: string; value: number; tone?: "warn" }) {
  const pct = Math.round((value / 5) * 100);
  const color = tone === "warn" ? "var(--gold)" : "var(--accent)";
  return (
    <div className="meterline">
      <div>
        <div className="ml-lb">{label}</div>
        <div className="meter">
          <div className="fl" style={{ width: `${pct}%`, background: color }} />
        </div>
      </div>
      <span className="ml-v">{value}/5</span>
    </div>
  );
}
