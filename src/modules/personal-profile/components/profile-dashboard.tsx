import Link from "next/link";
import { Icon } from "@/components/ui/icon";
import * as O from "@/modules/personal-profile/constants";
import type { Option } from "@/modules/personal-profile/constants";
import type { ProfileDraft, ProfileDiagnosis, RiskClass } from "@/modules/personal-profile/types";

const RISK_LABEL: Record<RiskClass, string> = {
  conservador: "Conservador",
  moderado: "Moderado",
  balanceado: "Balanceado",
  crecimiento: "Crecimiento",
  agresivo: "Agresivo",
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

/**
 * Dashboard de resultados del perfil financiero: muestra todo lo capturado en
 * el wizard de forma visual, con la opción de editar (retomar el wizard).
 */
export function ProfileDashboard({
  draft,
  diagnosis,
  readOnly = false,
}: {
  draft: ProfileDraft;
  diagnosis: ProfileDiagnosis;
  /** Vista del invitado: hereda el perfil del hogar, sin acciones de edición. */
  readOnly?: boolean;
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

  return (
    <div className="grid">
      {/* Hero: completitud + riesgo + editar */}
      <section className="dash-hero">
        <div
          className="card card-pad"
          style={{ display: "flex", alignItems: "center", gap: 22, flexWrap: "wrap" }}
        >
          <Ring value={completion} />
          <div style={{ flex: 1, minWidth: 200 }}>
            <div className="label">Perfil de riesgo</div>
            <div className="num-xl" style={{ fontSize: 30, marginTop: 4 }}>
              {RISK_LABEL[diagnosis.riskClass] ?? diagnosis.riskClass}
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
          <Info label="Etapa" value={pick(O.LIFE_STAGES, draft.lifeStage) ?? undefined} />
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
      </Card>

      {/* Riesgo y protección */}
      <section className="cols-2">
        <Card title="Perfil de riesgo">
          <div className="num-xl" style={{ fontSize: 24, marginBottom: 10 }}>
            {RISK_LABEL[diagnosis.riskClass] ?? diagnosis.riskClass}
          </div>
          <Info
            label="Ante una caída del 15%"
            value={pick(O.LOSS_REACTIONS, draft.lossReaction) ?? undefined}
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
          <Info
            label="Fondo de emergencia"
            value={draft.hasEmergencyFund ? EMERGENCY[draft.hasEmergencyFund] : undefined}
          />
          {insurances.length > 0 ? (
            <div style={{ marginTop: 12 }}>
              <div className="label" style={{ marginBottom: 6 }}>
                Seguros actuales
              </div>
              <ChipList items={insurances} />
            </div>
          ) : (
            <p className="muted" style={{ fontSize: 12.5, marginTop: 10 }}>
              Sin seguros registrados.
            </p>
          )}
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
            value={pick(O.RICH_LIFE_PHRASES, draft.richLifePhrase) ?? undefined}
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
        <circle cx="21" cy="21" r="15.915" fill="none" stroke="var(--chip)" strokeWidth="4" />
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
  const pct = Math.round((value / 10) * 100);
  const color = tone === "warn" ? "var(--warn)" : "var(--pos)";
  return (
    <div style={{ marginTop: 14 }}>
      <div className="row" style={{ justifyContent: "space-between", marginBottom: 6 }}>
        <span className="label" style={{ fontSize: 11.5 }}>
          {label}
        </span>
        <span className="tnum" style={{ fontSize: 12.5, color: "var(--ink-2)" }}>
          {value}/10
        </span>
      </div>
      <div className="bar-track" style={{ height: 10 }}>
        <div className="bar-fill" style={{ width: `${pct}%`, background: color }} />
      </div>
    </div>
  );
}
