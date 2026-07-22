"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { saveDraftAction, completeOnboardingAction } from "@/modules/personal-profile/api/actions";
import type { ProfileDraft } from "@/modules/personal-profile/types";
import * as O from "@/modules/personal-profile/constants";

import {
  Chips,
  EmailList,
  NumberField,
  OptionCards,
  OptionGrid,
  RankedChips,
  Scale,
  SelectField,
  Stepper,
  TextField,
  TextareaField,
  YesNo,
  type Opt,
} from "./wizard-fields";
import { MProgress } from "../components/content-kit";

/**
 * Wizard móvil del ADN financiero (/m/perfil-financiero), con la piel de mobile.css.
 * REUTILIZA la lógica del módulo personal-profile sin reimplementarla:
 *  - opciones: constants.ts (O.*)
 *  - guardado por paso: saveDraftAction(draft)  (best-effort, no bloquea)
 *  - cierre: completeOnboardingAction(draft)     (materializa el perfil + diagnóstico)
 * Espeja el ProfileDraft y el flujo del wizard web (11 pasos); solo la UI es nueva.
 * es-MX "tú", tema claro, safe areas. Al completar → redirige a /m.
 */

// Enums que el wizard web define inline (no viven en constants.ts).
const URGENCY_OPTS: Opt[] = [
  { value: "baja", label: "Baja" },
  { value: "media", label: "Media" },
  { value: "alta", label: "Alta" },
  { value: "critica", label: "Crítica" },
];
const EMERGENCY_OPTS: Opt[] = [
  { value: "si", label: "Sí, ya lo tengo" },
  { value: "construyendo", label: "Lo estoy construyendo" },
  { value: "no", label: "No" },
  { value: "no_se", label: "No lo sé" },
];

type StepField = (
  | { kind: "text"; key: keyof ProfileDraft; label: string; placeholder?: string; maxLength?: number }
  | { kind: "number"; key: keyof ProfileDraft; label: string; placeholder?: string; min?: number; max?: number }
  | { kind: "select"; key: keyof ProfileDraft; label: string; options: Opt[] }
  | { kind: "cards"; key: keyof ProfileDraft; label: string; options: Opt[] }
  | { kind: "grid"; key: keyof ProfileDraft; label: string; options: Opt[] }
  | { kind: "chips"; key: keyof ProfileDraft; label: string; options: Opt[]; max?: number }
  | { kind: "ranked"; key: keyof ProfileDraft; label: string; options: Opt[]; max?: number }
  | { kind: "scale"; key: keyof ProfileDraft; label: string; low: string; high: string; help?: string }
  | { kind: "stepper"; key: keyof ProfileDraft; label: string; min?: number; max?: number }
  | { kind: "yesno"; key: keyof ProfileDraft; label: string }
  | { kind: "textarea"; key: keyof ProfileDraft; label: string; placeholder?: string; maxLength?: number }
  | { kind: "emails"; key: keyof ProfileDraft; label: string; max?: number }
) & { showIf?: (d: ProfileDraft) => boolean };

type Step = { id: string; eyebrow: string; title: React.ReactNode; sub?: string; fields: StepField[] };

const STEPS: Step[] = [
  {
    id: "identidad",
    eyebrow: "Paso 1 · Tú",
    title: (
      <>
        Cuéntanos un poco <span className="g">de ti</span>
      </>
    ),
    sub: "Para personalizar tu experiencia desde el inicio.",
    fields: [
      { kind: "text", key: "displayName", label: "¿Cómo quieres que te llamemos?", placeholder: "Memo, Caro…", maxLength: 80 },
      { kind: "number", key: "age", label: "Tu edad", placeholder: "Ej. 32", min: 0, max: 120 },
      { kind: "select", key: "country", label: "País de residencia", options: O.COUNTRIES },
      { kind: "select", key: "primaryCurrency", label: "Moneda principal", options: O.CURRENCIES },
      { kind: "cards", key: "financialNucleus", label: "¿Cómo gestionas tus finanzas?", options: O.NUCLEUS },
      {
        kind: "emails",
        key: "householdMemberEmails",
        label: "Invita a tu familia (hasta 4 correos)",
        max: 4,
        showIf: (d) => d.financialNucleus === "familia",
      },
      { kind: "stepper", key: "dependentsCount", label: "¿Cuántas personas dependen de ti?", min: 0, max: 30 },
    ],
  },
  {
    id: "etapa",
    eyebrow: "Paso 2 · Etapa financiera",
    title: (
      <>
        ¿Cuál describe mejor <span className="g">tu situación?</span>
      </>
    ),
    fields: [
      { kind: "ranked", key: "lifeStage", label: "Tu momento financiero", options: O.LIFE_STAGES },
      { kind: "scale", key: "perceivedControl", label: "¿Cuánto control sientes sobre tu dinero?", low: "Sin control", high: "Total control" },
      { kind: "grid", key: "urgency", label: "¿Qué tan urgente sientes ordenar tus finanzas?", options: URGENCY_OPTS },
    ],
  },
  {
    id: "preocupacion",
    eyebrow: "Paso 3 · Lo que más pesa",
    title: (
      <>
        ¿Qué te <span className="g">preocupa más?</span>
      </>
    ),
    fields: [
      { kind: "ranked", key: "mainConcerns", label: "Elige lo que más te preocupa", options: O.CONCERNS },
      { kind: "ranked", key: "dominantEmotionAnswer", label: "¿Qué emoción domina cuando piensas en tu dinero?", options: O.DOMINANT_EMOTIONS },
      { kind: "ranked", key: "singleProblem", label: "Si pudieras resolver una sola cosa hoy…", options: O.SINGLE_PROBLEMS },
    ],
  },
  {
    id: "objetivos",
    eyebrow: "Paso 4 · Hacia dónde vas",
    title: (
      <>
        ¿Qué quieres <span className="g">lograr?</span>
      </>
    ),
    sub: "Elige todas las que apliquen.",
    fields: [{ kind: "ranked", key: "goals", label: "Tus objetivos", options: O.GOALS }],
  },
  {
    id: "prioridades",
    eyebrow: "Paso 5 · Lo que más valoras",
    title: (
      <>
        Tus <span className="g">prioridades</span>
      </>
    ),
    fields: [
      { kind: "ranked", key: "priorities", label: "¿Qué es lo que más valoras?", options: O.PRIORITIES },
      { kind: "ranked", key: "dineroPrimero", label: "¿Qué quieres que tu dinero te dé primero?", options: O.DINERO_PRIMERO },
      { kind: "ranked", key: "conectaFrase", label: "¿Con qué frase conectas más?", options: O.CONECTA_FRASES },
    ],
  },
  {
    id: "comportamiento",
    eyebrow: "Paso 6 · Tu relación con el dinero",
    title: (
      <>
        Cómo te <span className="g">comportas</span>
      </>
    ),
    fields: [
      { kind: "scale", key: "discipline", label: "¿Qué tan disciplinado eres con tu dinero?", low: "Poco", high: "Mucho" },
      { kind: "scale", key: "impulsivity", label: "¿Qué tan impulsivo eres al gastar?", low: "Nada", high: "Mucho" },
      { kind: "grid", key: "reviewHabit", label: "¿Cada cuánto revisas tus finanzas?", options: O.REVIEW_HABITS },
      { kind: "ranked", key: "hardest", label: "¿Qué es lo que más te cuesta?", options: O.HARDEST },
      { kind: "ranked", key: "incomeReaction", label: "Cuando te entra dinero, normalmente…", options: O.INCOME_REACTIONS },
      { kind: "ranked", key: "stressSpending", label: "Cuando estás estresado…", options: O.STRESS_SPENDING },
      { kind: "ranked", key: "unplannedPurchase", label: "Ante una compra no planeada…", options: O.UNPLANNED_PURCHASE },
      { kind: "ranked", key: "socialComparison", label: "Comparar tu situación con la de otros…", options: O.SOCIAL_COMPARISON },
      { kind: "ranked", key: "moneyScriptPhrase", label: "¿Con qué frase te identificas más?", options: O.MONEY_SCRIPT_PHRASES },
    ],
  },
  {
    id: "conocimiento",
    eyebrow: "Paso 7 · Tu nivel",
    title: (
      <>
        ¿Cuánto sabes <span className="g">de finanzas?</span>
      </>
    ),
    fields: [
      { kind: "cards", key: "knowledgeLevel", label: "Tu nivel de conocimiento financiero", options: O.KNOWLEDGE_LEVELS },
      { kind: "chips", key: "topicsToLearn", label: "¿Qué te gustaría aprender?", options: O.TOPICS },
      { kind: "cards", key: "explainStyle", label: "¿Cómo prefieres que te expliquemos?", options: O.EXPLAIN_STYLES },
      { kind: "grid", key: "decisionComfort", label: "¿Qué tan cómodo te sientes tomando decisiones de dinero?", options: O.DECISION_COMFORT },
    ],
  },
  {
    id: "riesgo",
    eyebrow: "Paso 8 · Tolerancia al riesgo",
    title: (
      <>
        Tu perfil de <span className="g">riesgo</span>
      </>
    ),
    fields: [
      { kind: "ranked", key: "lossReaction", label: "Si una inversión baja de valor…", options: O.LOSS_REACTIONS },
      { kind: "grid", key: "riskPreference", label: "¿Qué prefieres?", options: O.RISK_PREFERENCES },
      { kind: "grid", key: "investHorizon", label: "¿En cuánto tiempo necesitarías ese dinero?", options: O.INVEST_HORIZONS },
      { kind: "yesno", key: "hasInvested", label: "¿Has invertido antes?" },
      { kind: "scale", key: "volatilityComfort", label: "¿Qué tan cómodo estás con que tu dinero suba y baje?", low: "Nada", high: "Mucho", help: "La volatilidad es cuánto sube y baja el valor de una inversión en el tiempo. Ejemplo: si pones $1,000 en una inversión volátil, en un mes podría valer $1,200 o $800. Más volatilidad = más oscilación (y normalmente más rendimiento posible a largo plazo, pero más nervios en el camino)." },
    ],
  },
  {
    id: "proteccion",
    eyebrow: "Paso 9 · Tu blindaje",
    title: (
      <>
        Tu protección <span className="g">actual</span>
      </>
    ),
    fields: [
      { kind: "cards", key: "hasEmergencyFund", label: "¿Tienes fondo de emergencia?", options: EMERGENCY_OPTS },
      { kind: "chips", key: "insurances", label: "¿Qué seguros tienes?", options: O.INSURANCES },
      { kind: "cards", key: "incomeStopCoverage", label: "Si tu ingreso se detuviera, ¿cuánto aguantarías?", options: O.INCOME_STOP_COVERAGE },
      { kind: "grid", key: "protectionPerceived", label: "¿Qué tan protegido te sientes?", options: O.PROTECTION_PERCEIVED },
    ],
  },
  {
    id: "acompanamiento",
    eyebrow: "Paso 10 · Cómo te acompañamos",
    title: (
      <>
        ¿Cómo quieres que <span className="g">te acompañemos?</span>
      </>
    ),
    fields: [
      { kind: "grid", key: "coachingTone", label: "Tono de tu asesor", options: O.COACHING_TONES },
      { kind: "grid", key: "coachingFrequency", label: "¿Cada cuánto quieres que te contactemos?", options: O.COACHING_FREQUENCIES },
      { kind: "grid", key: "alertIntensity", label: "Intensidad de las alertas", options: O.ALERT_INTENSITIES },
      { kind: "ranked", key: "alertStyle", label: "Cuando algo se salga del plan, prefiero…", options: O.ALERT_STYLES },
      { kind: "ranked", key: "interventionStyle", label: "¿Qué te ayudaría más a corregir el rumbo?", options: O.INTERVENTION_STYLES },
    ],
  },
  {
    id: "richlife",
    eyebrow: "Paso 11 · Tu Rich Life",
    title: (
      <>
        Tu <span className="g">Rich Life</span>
      </>
    ),
    sub: "El último paso: hacia dónde quieres que todo esto te lleve.",
    fields: [
      { kind: "ranked", key: "richLifePhrase", label: "¿Qué es lo que más quieres?", options: O.RICH_LIFE_PHRASES },
      { kind: "textarea", key: "richLifeVision", label: "Describe tu vida ideal (opcional)", placeholder: "Cómo se ve tu vida cuando tu dinero está en orden…", maxLength: 2000 },
      { kind: "ranked", key: "futureImage", label: "¿Qué imagen representa mejor tu futuro?", options: O.FUTURE_IMAGES },
      { kind: "chips", key: "desiredFeeling", label: "¿Qué quieres sentir? (hasta 3)", options: O.DESIRED_FEELINGS, max: 3 },
    ],
  },
];

const TOTAL = STEPS.length;

export function MobileProfileWizard({ initialDraft }: { initialDraft: ProfileDraft }) {
  const router = useRouter();
  const [draft, setDraft] = useState<ProfileDraft>(initialDraft);
  const [index, setIndex] = useState(0);
  const [finishing, setFinishing] = useState(false);

  const set = (key: keyof ProfileDraft, value: unknown) =>
    setDraft((d) => ({ ...d, [key]: value }) as ProfileDraft);

  const step = STEPS[index];
  const isLast = index === TOTAL - 1;

  const scrollTop = () => {
    if (typeof window !== "undefined") window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const goNext = async () => {
    void saveDraftAction(draft); // best-effort, no bloquea (espeja la web)
    if (!isLast) {
      setIndex((i) => i + 1);
      scrollTop();
    } else {
      await finish();
    }
  };

  const goBack = () => {
    if (index > 0) {
      setIndex((i) => i - 1);
      scrollTop();
    }
  };

  const finish = async () => {
    setFinishing(true);
    const goalDetails = (draft.goals ?? []).map((g) => ({
      name: O.GOALS.find((o) => o.value === g)?.label ?? g,
    }));
    try {
      await completeOnboardingAction({ ...draft, goalDetails });
    } catch {
      // best-effort: aunque falle la persistencia, no dejamos al usuario atrapado
    }
    router.replace("/m");
    router.refresh();
  };

  if (finishing) {
    return (
      <div className="m-wz m-wz-center">
        <div className="m-wz-spinner" aria-hidden />
        <div className="m-wz-title" style={{ marginTop: 18 }}>
          Generando tu <span className="g">ADN financiero</span>
        </div>
        <p className="muted" style={{ marginTop: 8 }}>
          Un momento, estamos preparando tu diagnóstico…
        </p>
      </div>
    );
  }

  if (!step) return null; // index siempre acotado; guarda para noUncheckedIndexedAccess

  return (
    <div className="m-wz">
      {/* Progreso — MProgress pinta el mismo .bar/.bar>i en var(--accent) (idéntico a lo que
          había) y de paso recorta el valor a 0..1. El encabezado del paso NO se toca: su
          .m-wz-eyebrow es acento 11px, deliberadamente más presente que el .ov del kit. */}
      <div className="m-wz-head">
        <MProgress value={(index + 1) / TOTAL} height={6} />
        <div className="m-wz-progtxt mono">
          Paso {index + 1} de {TOTAL}
        </div>
      </div>

      {/* Encabezado del paso */}
      <div className="m-wz-eyebrow">{step.eyebrow}</div>
      <h1 className="m-wz-title">{step.title}</h1>
      {step.sub ? (
        <p className="muted" style={{ marginTop: 8, fontSize: 14 }}>
          {step.sub}
        </p>
      ) : null}

      {/* Campos del paso */}
      <div className="m-wz-body">
        {step.fields.map((f) => {
          if (f.showIf && !f.showIf(draft)) return null;
          const k = f.key;
          switch (f.kind) {
            case "text":
              return (
                <TextField
                  key={k}
                  label={f.label}
                  value={draft[k] as string | undefined}
                  onChange={(v) => set(k, v)}
                  placeholder={f.placeholder}
                  maxLength={f.maxLength}
                />
              );
            case "number":
              return (
                <NumberField
                  key={k}
                  label={f.label}
                  value={draft[k] as number | undefined}
                  onChange={(v) => set(k, v)}
                  placeholder={f.placeholder}
                  min={f.min}
                  max={f.max}
                />
              );
            case "select":
              return (
                <SelectField
                  key={k}
                  label={f.label}
                  value={draft[k] as string | undefined}
                  onChange={(v) => set(k, v)}
                  options={f.options}
                />
              );
            case "cards":
              return (
                <OptionCards
                  key={k}
                  label={f.label}
                  value={draft[k] as string | undefined}
                  onChange={(v) => set(k, v)}
                  options={f.options}
                />
              );
            case "grid":
              return (
                <OptionGrid
                  key={k}
                  label={f.label}
                  value={draft[k] as string | undefined}
                  onChange={(v) => set(k, v)}
                  options={f.options}
                />
              );
            case "chips":
              return (
                <Chips
                  key={k}
                  label={f.label}
                  values={draft[k] as string[] | undefined}
                  onChange={(v) => set(k, v)}
                  options={f.options}
                  max={f.max}
                />
              );
            case "ranked":
              return (
                <RankedChips
                  key={k}
                  label={f.label}
                  values={draft[k] as string[] | undefined}
                  onChange={(v) => set(k, v)}
                  options={f.options}
                  max={f.max}
                />
              );
            case "scale":
              return (
                <Scale
                  key={k}
                  label={f.label}
                  value={draft[k] as number | undefined}
                  onChange={(v) => set(k, v)}
                  lowLabel={f.low}
                  highLabel={f.high}
                  help={f.help}
                />
              );
            case "stepper":
              return (
                <Stepper
                  key={k}
                  label={f.label}
                  value={draft[k] as number | undefined}
                  onChange={(v) => set(k, v)}
                  min={f.min}
                  max={f.max}
                />
              );
            case "yesno":
              return (
                <YesNo key={k} label={f.label} value={draft[k] as boolean | undefined} onChange={(v) => set(k, v)} />
              );
            case "textarea":
              return (
                <TextareaField
                  key={k}
                  label={f.label}
                  value={draft[k] as string | undefined}
                  onChange={(v) => set(k, v)}
                  placeholder={f.placeholder}
                  maxLength={f.maxLength}
                />
              );
            case "emails":
              return (
                <EmailList
                  key={k}
                  label={f.label}
                  values={draft[k] as string[] | undefined}
                  onChange={(v) => set(k, v)}
                  max={f.max}
                />
              );
            default:
              return null;
          }
        })}
      </div>

      {/* Navegación */}
      <div className="m-wznav">
        {index > 0 ? (
          <button type="button" className="m-btn m-btn-secondary" onClick={goBack}>
            Atrás
          </button>
        ) : null}
        <button type="button" className="m-btn m-btn-primary" onClick={goNext}>
          {isLast ? "Finalizar" : "Siguiente"}
        </button>
      </div>
    </div>
  );
}
