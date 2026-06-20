"use client";

import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/ui/icon";
import { BrandMark } from "@/components/layout/brand-mark";
import { ThemeToggle } from "@/components/layout/theme-toggle";
import { OptionCards, Chips, Scale, YesNo, NumStepper, HelpTip, Dropdown } from "./primitives";
import { HouseholdInvites } from "./household-invites";
import { ProfileSummary } from "./summary";
import { StartChoice } from "./start-choice";
import * as O from "@/modules/personal-profile/constants";
import { saveDraftAction, completeOnboardingAction } from "@/modules/personal-profile/api/actions";
import { computeCompletion } from "@/modules/personal-profile/engine/diagnosis";
import type { ProfileDraft, ProfileDiagnosis } from "@/modules/personal-profile/types";
import { cn } from "@/lib/utils";

type Update = (patch: Partial<ProfileDraft>) => void;

type Step = {
  id: string;
  label: string;
  eyebrow: string;
  titleHTML: string;
  sub: string;
  /** Explicación del paso (para el tooltip de ayuda "?"). */
  help: string;
  render: (d: ProfileDraft, set: Update) => React.ReactNode;
};

function toggle(list: string[] | undefined, v: string): string[] {
  const cur = list ?? [];
  return cur.includes(v) ? cur.filter((x) => x !== v) : [...cur, v];
}

const STEPS: Step[] = [
  {
    id: "identidad",
    label: "Identidad",
    eyebrow: "Paso 1 · Tú",
    titleHTML: 'Cuéntanos un poco de <span class="it">ti</span>',
    sub: "Esto nos ayuda a adaptar cada recomendación a tu realidad. Puedes dejar en blanco lo que no sepas todavía.",
    help: "Estos datos básicos personalizan todo. Tu país y moneda definen el contexto; la moneda principal es la que verás en tus dashboards (puedes registrar datos en cualquier moneda y la app los convierte). Saber con quién gestionas tus finanzas y cuántas personas dependen de ti ajusta tus metas y tu protección.",
    render: (d, set) => (
      <div className="field-row">
        <div className="field-row two">
          <div className="fld">
            <label className="fld-label">¿Cómo quieres que te llamemos?</label>
            <input
              className="inp"
              value={d.displayName ?? ""}
              onChange={(e) => set({ displayName: e.target.value })}
              placeholder="Memo, Caro…"
            />
          </div>
          <div className="fld">
            <label className="fld-label">Edad</label>
            <input
              className="inp"
              type="number"
              value={d.age ?? ""}
              onChange={(e) => set({ age: e.target.value ? Number(e.target.value) : undefined })}
              placeholder="Ej. 32"
            />
          </div>
        </div>
        <div className="field-row two">
          <div className="fld">
            <label className="fld-label">País de residencia</label>
            <Dropdown
              options={O.COUNTRIES}
              value={d.country}
              onChange={(v) => set({ country: v })}
              placeholder="Elige tu país…"
            />
          </div>
          <div className="fld">
            <label className="fld-label">
              Moneda principal{" "}
              <HelpTip text="Es la moneda en la que verás tus dashboards. Puedes registrar ingresos, gastos o inversiones en cualquier moneda: la app revisa el tipo de cambio y los convierte para mostrarte los totales en esta moneda." />
            </label>
            <Dropdown
              options={O.CURRENCIES}
              value={d.primaryCurrency}
              onChange={(v) => set({ primaryCurrency: v })}
              placeholder="Elige tu moneda…"
            />
          </div>
        </div>
        <div className="fld">
          <label className="fld-label">¿Gestionas tus finanzas…?</label>
          <OptionCards
            options={O.NUCLEUS}
            value={d.financialNucleus}
            onChange={(v) => set({ financialNucleus: v as ProfileDraft["financialNucleus"] })}
          />
        </div>
        {d.financialNucleus === "familia" ? (
          <HouseholdInvites
            emails={d.householdMemberEmails ?? []}
            onChange={(emails) => set({ householdMemberEmails: emails })}
          />
        ) : null}
        <div className="yn">
          <div>
            <div className="yn-q">¿Cuántas personas dependen económicamente de ti?</div>
            <div className="yn-d">Hijos, padres, pareja u otros.</div>
          </div>
          <NumStepper
            value={d.dependentsCount ?? 0}
            onChange={(v) => set({ dependentsCount: v })}
          />
        </div>
      </div>
    ),
  },
  {
    id: "etapa",
    label: "Tu momento",
    eyebrow: "Paso 2 · Etapa financiera",
    titleHTML: '¿Cuál describe mejor tu <span class="it">situación</span>?',
    sub: "No hay respuesta correcta. Esto define tu punto de partida para no recomendarte el cohete antes que el oxígeno.",
    help: "Tu etapa financiera define el punto de partida. No te diremos que inviertas si primero necesitas estabilidad: priorizamos las recomendaciones según dónde estás hoy.",
    render: (d, set) => (
      <div className="field-row">
        <OptionCards
          options={O.LIFE_STAGES}
          value={d.lifeStage}
          onChange={(v) => set({ lifeStage: v as ProfileDraft["lifeStage"] })}
        />
        <div className="fld" style={{ marginTop: 8 }}>
          <label className="fld-label">¿Qué tan en control sientes tus finanzas hoy?</label>
          <Scale
            value={d.perceivedControl}
            onChange={(v) => set({ perceivedControl: v })}
            lowLabel="Sin control"
            highLabel="Total control"
          />
        </div>
        <div className="fld">
          <label className="fld-label">¿Qué tan urgente es mejorar tus finanzas?</label>
          <OptionCards
            options={[
              { value: "baja", label: "Baja" },
              { value: "media", label: "Media" },
              { value: "alta", label: "Alta" },
              { value: "critica", label: "Crítica" },
            ]}
            value={d.urgency}
            onChange={(v) => set({ urgency: v as ProfileDraft["urgency"] })}
            cols={3}
          />
        </div>
      </div>
    ),
  },
  {
    id: "preocupacion",
    label: "Tu preocupación",
    eyebrow: "Paso 3 · Lo que más pesa",
    titleHTML: '¿Qué te <span class="it">preocupa</span> más hoy?',
    sub: "Elige lo que más te quita tranquilidad (hasta 5). Lo tendremos presente en cada recomendación.",
    help: "Tus preocupaciones enfocan el plan. Puedes elegir varias (hasta 5): mientras más contexto, mejor entiende la IA qué te quita tranquilidad y qué atacar primero.",
    render: (d, set) => (
      <div className="field-row">
        <div className="fld">
          <Chips
            options={O.CONCERNS}
            values={d.mainConcerns ?? (d.mainConcern ? [d.mainConcern] : [])}
            onToggle={(v) => {
              const next = toggle(d.mainConcerns ?? (d.mainConcern ? [d.mainConcern] : []), v);
              set({ mainConcerns: next, mainConcern: next[0] });
            }}
            max={5}
          />
        </div>
        <div className="fld">
          <label className="fld-label">Cuando piensas en tus finanzas hoy, lo que más sientes es…</label>
          <OptionCards
            options={O.DOMINANT_EMOTIONS}
            value={d.dominantEmotionAnswer}
            onChange={(v) => set({ dominantEmotionAnswer: v })}
          />
        </div>
        <div className="fld">
          <label className="fld-label">Si resolvieras una sola cosa este mes, ¿cuál sería?</label>
          <OptionCards
            options={O.SINGLE_PROBLEMS}
            value={d.singleProblem}
            onChange={(v) => set({ singleProblem: v })}
          />
        </div>
      </div>
    ),
  },
  {
    id: "objetivos",
    label: "Objetivos",
    eyebrow: "Paso 4 · Hacia dónde vas",
    titleHTML: '¿Qué quieres <span class="it">lograr</span> con tu dinero?',
    sub: "Selecciona los que apliquen. El dinero no se gestiona en abstracto: se gestiona para lograr algo.",
    help: "Tus objetivos guían las metas de ahorro e inversión y la ruta que te sugerimos. Puedes elegir varios; luego les pondremos montos y fechas.",
    render: (d, set) => (
      <Chips
        options={O.GOALS}
        values={d.goals ?? []}
        onToggle={(v) => set({ goals: toggle(d.goals, v) })}
      />
    ),
  },
  {
    id: "prioridades",
    label: "Prioridades",
    eyebrow: "Paso 5 · Lo que más valoras",
    titleHTML: 'Tus <span class="it">prioridades</span> en esta etapa',
    sub: "Elige hasta 5. Dos personas con el mismo ingreso pueden querer vidas muy distintas.",
    help: "Tus prioridades equilibran los consejos entre disfrutar hoy y asegurar el futuro. Es lo que hace que el plan se sienta tuyo y no genérico.",
    render: (d, set) => (
      <div className="field-row">
        <div className="fld">
          <Chips
            options={O.PRIORITIES}
            values={d.priorities ?? []}
            onToggle={(v) => set({ priorities: toggle(d.priorities, v) })}
            max={5}
          />
        </div>
        <div className="fld">
          <label className="fld-label">Si tu dinero tuviera que darte una cosa primero, sería…</label>
          <OptionCards
            options={O.DINERO_PRIMERO}
            value={d.dineroPrimero}
            onChange={(v) => set({ dineroPrimero: v })}
          />
        </div>
        <div className="fld">
          <label className="fld-label">¿Con cuál frase conectas más?</label>
          <OptionCards
            options={O.CONECTA_FRASES}
            value={d.conectaFrase}
            onChange={(v) => set({ conectaFrase: v })}
          />
        </div>
      </div>
    ),
  },
  {
    id: "comportamiento",
    label: "Comportamiento",
    eyebrow: "Paso 6 · Tu relación con el dinero",
    titleHTML: 'Cómo te <span class="it">comportas</span> con el dinero',
    sub: "Esto ajusta el tono: hay quien necesita estructura, quien necesita motivación y quien necesita alertas.",
    help: "Tu relación con el dinero ajusta cómo te acompañamos: quién necesita estructura, quién motivación y quién alertas. Así el asesor te habla de la forma que mejor te funciona.",
    render: (d, set) => (
      <div className="field-row">
        <div className="fld">
          <label className="fld-label">¿Qué tan disciplinado eres siguiendo un plan?</label>
          <Scale
            value={d.discipline}
            onChange={(v) => set({ discipline: v })}
            lowLabel="Poco"
            highLabel="Mucho"
          />
        </div>
        <div className="fld">
          <label className="fld-label">¿Qué tan impulsivo eres al comprar?</label>
          <Scale
            value={d.impulsivity}
            onChange={(v) => set({ impulsivity: v })}
            lowLabel="Nada"
            highLabel="Mucho"
          />
        </div>
        <div className="fld">
          <label className="fld-label">¿Con qué frecuencia revisas tus finanzas?</label>
          <OptionCards
            options={O.REVIEW_HABITS}
            value={d.reviewHabit}
            onChange={(v) => set({ reviewHabit: v })}
            cols={3}
          />
        </div>
        <div className="fld">
          <label className="fld-label">¿Qué te cuesta más?</label>
          <Chips
            options={O.HARDEST}
            values={d.hardest ?? []}
            onToggle={(v) => set({ hardest: toggle(d.hardest, v) })}
          />
        </div>
        <div className="fld">
          <label className="fld-label">Cuando recibes dinero, normalmente…</label>
          <OptionCards
            options={O.INCOME_REACTIONS}
            value={d.incomeReaction}
            onChange={(v) => set({ incomeReaction: v })}
          />
        </div>
        <div className="fld">
          <label className="fld-label">Después de una semana pesada, ¿qué pasa con tus gastos?</label>
          <OptionCards
            options={O.STRESS_SPENDING}
            value={d.stressSpending}
            onChange={(v) => set({ stressSpending: v })}
          />
        </div>
        <div className="fld">
          <label className="fld-label">Cuando ves algo que quieres pero no estaba planeado…</label>
          <OptionCards
            options={O.UNPLANNED_PURCHASE}
            value={d.unplannedPurchase}
            onChange={(v) => set({ unplannedPurchase: v })}
          />
        </div>
        <div className="fld">
          <label className="fld-label">Cuando ves que otros avanzan más rápido…</label>
          <OptionCards
            options={O.SOCIAL_COMPARISON}
            value={d.socialComparison}
            onChange={(v) => set({ socialComparison: v })}
          />
        </div>
        <div className="fld">
          <label className="fld-label">¿Cuál frase se parece más a lo que a veces piensas sobre el dinero?</label>
          <OptionCards
            options={O.MONEY_SCRIPT_PHRASES}
            value={d.moneyScriptPhrase}
            onChange={(v) => set({ moneyScriptPhrase: v })}
          />
        </div>
      </div>
    ),
  },
  {
    id: "conocimiento",
    label: "Conocimiento",
    eyebrow: "Paso 7 · Tu nivel",
    titleHTML: '¿Cuánto sabes de <span class="it">finanzas</span>?',
    sub: "Para no hablarte ni como profesor universitario ni como TikTok financiero con corbata.",
    help: "Tu nivel de conocimiento ajusta cómo te explicamos las cosas: ni demasiado técnico ni demasiado básico. Y nos dice qué temas reforzar contigo.",
    render: (d, set) => (
      <div className="field-row">
        <OptionCards
          options={O.KNOWLEDGE_LEVELS}
          value={d.knowledgeLevel}
          onChange={(v) => set({ knowledgeLevel: v as ProfileDraft["knowledgeLevel"] })}
        />
        <div className="fld">
          <label className="fld-label">¿Sobre qué te gustaría aprender más?</label>
          <Chips
            options={O.TOPICS}
            values={d.topicsToLearn ?? []}
            onToggle={(v) => set({ topicsToLearn: toggle(d.topicsToLearn, v) })}
          />
        </div>
        <div className="fld">
          <label className="fld-label">Cuando la app te explique algo, prefieres…</label>
          <OptionCards
            options={O.EXPLAIN_STYLES}
            value={d.explainStyle}
            onChange={(v) => set({ explainStyle: v })}
          />
        </div>
        <div className="fld">
          <label className="fld-label">¿Qué tan cómodo te sientes tomando decisiones financieras?</label>
          <OptionCards
            options={O.DECISION_COMFORT}
            value={d.decisionComfort}
            onChange={(v) => set({ decisionComfort: v })}
          />
        </div>
      </div>
    ),
  },
  {
    id: "riesgo",
    label: "Riesgo",
    eyebrow: "Paso 8 · Tolerancia al riesgo",
    titleHTML: 'Tu perfil de <span class="it">riesgo</span>',
    sub: "Clave para futuras recomendaciones de inversión, ahorro y protección.",
    help: "Tu tolerancia al riesgo define qué inversiones y estrategias te recomendamos, acordes a lo que puedes sostener emocional y financieramente. De aquí sale tu perfil de riesgo.",
    render: (d, set) => (
      <div className="field-row">
        <div className="fld">
          <label className="fld-label">Si una inversión baja un 15% temporalmente…</label>
          <OptionCards
            options={O.LOSS_REACTIONS}
            value={d.lossReaction}
            onChange={(v) => set({ lossReaction: v })}
          />
        </div>
        <div className="fld">
          <label className="fld-label">¿Qué prefieres?</label>
          <OptionCards
            options={O.RISK_PREFERENCES}
            value={d.riskPreference}
            onChange={(v) => set({ riskPreference: v as ProfileDraft["riskPreference"] })}
          />
        </div>
        <div className="fld">
          <label className="fld-label">¿En cuánto tiempo necesitarías ese dinero?</label>
          <OptionCards
            options={O.INVEST_HORIZONS}
            value={d.investHorizon}
            onChange={(v) => set({ investHorizon: v })}
            cols={3}
          />
        </div>
        <YesNo
          question="¿Has invertido antes?"
          value={d.hasInvested}
          onChange={(v) => set({ hasInvested: v })}
        />
        <div className="fld">
          <label className="fld-label">¿Qué tan cómodo te sientes con la volatilidad?</label>
          <Scale
            value={d.volatilityComfort}
            onChange={(v) => set({ volatilityComfort: v })}
            lowLabel="Nada"
            highLabel="Mucho"
          />
        </div>
      </div>
    ),
  },
  {
    id: "proteccion",
    label: "Protección",
    eyebrow: "Paso 9 · Tu blindaje",
    titleHTML: 'Tu <span class="it">protección</span> actual',
    sub: "Una persona puede ganar bien y aun así estar financieramente expuesta. Veamos cómo estás.",
    help: "Aquí medimos qué tan blindado estás ante imprevistos (fondo de emergencia y seguros). Ganar bien no es lo mismo que estar protegido: esto detecta tus brechas.",
    render: (d, set) => (
      <div className="field-row">
        <div className="fld">
          <label className="fld-label">¿Tienes fondo de emergencia?</label>
          <OptionCards
            options={[
              { value: "si", label: "Sí" },
              { value: "construyendo", label: "Lo estoy construyendo" },
              { value: "no", label: "No" },
              { value: "no_se", label: "No sé cuánto debería tener" },
            ]}
            value={d.hasEmergencyFund}
            onChange={(v) => set({ hasEmergencyFund: v as ProfileDraft["hasEmergencyFund"] })}
          />
        </div>
        <div className="fld">
          <label className="fld-label">¿Qué seguros tienes hoy?</label>
          <Chips
            options={O.INSURANCES}
            values={d.insurances ?? []}
            onToggle={(v) => set({ insurances: toggle(d.insurances, v) })}
          />
        </div>
        <div className="fld">
          <label className="fld-label">Si mañana tu ingreso principal se detiene, ¿cuánto cubrirías?</label>
          <OptionCards
            options={O.INCOME_STOP_COVERAGE}
            value={d.incomeStopCoverage}
            onChange={(v) => set({ incomeStopCoverage: v })}
          />
        </div>
        <div className="fld">
          <label className="fld-label">¿Qué tan protegido sientes tu futuro financiero?</label>
          <OptionCards
            options={O.PROTECTION_PERCEIVED}
            value={d.protectionPerceived}
            onChange={(v) => set({ protectionPerceived: v })}
          />
        </div>
      </div>
    ),
  },
  {
    id: "acompanamiento",
    label: "Acompañamiento",
    eyebrow: "Paso 10 · Cómo te acompañamos",
    titleHTML: '¿Cómo quieres que te <span class="it">acompañemos</span>?',
    sub: "Esto le da personalidad a tu asesor: desde coach amable hasta directo y exigente.",
    help: "Define la personalidad de tu asesor y cómo te avisa: desde coach amable hasta directo y exigente, con qué frecuencia te da recomendaciones y qué tan intensas quieres las alertas.",
    render: (d, set) => (
      <div className="field-row">
        <div className="fld">
          <label className="fld-label">Tono del acompañamiento</label>
          <OptionCards
            options={O.COACHING_TONES}
            value={d.coachingTone}
            onChange={(v) => set({ coachingTone: v })}
          />
        </div>
        <div className="fld">
          <label className="fld-label">¿Con qué frecuencia quieres recomendaciones?</label>
          <OptionCards
            options={O.COACHING_FREQUENCIES}
            value={d.coachingFrequency}
            onChange={(v) => set({ coachingFrequency: v })}
            cols={3}
          />
        </div>
        <div className="fld">
          <label className="fld-label">¿Qué tan intensas quieres las alertas?</label>
          <OptionCards
            options={O.ALERT_INTENSITIES}
            value={d.alertIntensity}
            onChange={(v) => set({ alertIntensity: v })}
            cols={2}
          />
        </div>
        <div className="fld">
          <label className="fld-label">Cuando la app detecte algo importante, prefieres que…</label>
          <OptionCards
            options={O.ALERT_STYLES}
            value={d.alertStyle}
            onChange={(v) => set({ alertStyle: v })}
          />
        </div>
        <div className="fld">
          <label className="fld-label">Cuando estás por desviarte de una meta, ¿qué te ayuda más?</label>
          <OptionCards
            options={O.INTERVENTION_STYLES}
            value={d.interventionStyle}
            onChange={(v) => set({ interventionStyle: v })}
          />
        </div>
      </div>
    ),
  },
  {
    id: "richlife",
    label: "Rich Life",
    eyebrow: "Paso 11 · Tu Rich Life",
    titleHTML: 'Tu <span class="it">Rich Life</span>',
    sub: "Conectemos el dinero con la vida que quieres. Cada recomendación se conectará con tu porqué.",
    help: "Conectamos el dinero con la vida que quieres. Cada recomendación se ligará a tu 'porqué' para que el plan tenga sentido para ti, no solo números.",
    render: (d, set) => (
      <div className="field-row">
        <div className="fld">
          <label className="fld-label">¿Qué frase describe mejor tu Rich Life?</label>
          <OptionCards
            options={O.RICH_LIFE_PHRASES}
            value={d.richLifePhrase}
            onChange={(v) => set({ richLifePhrase: v })}
          />
        </div>
        <div className="fld">
          <label className="fld-label">
            Describe tu vida financiera ideal en 5–10 años (opcional)
          </label>
          <textarea
            className="inp"
            rows={4}
            value={d.richLifeVision ?? ""}
            onChange={(e) => set({ richLifeVision: e.target.value })}
            placeholder="Sin deudas, con tiempo para mi familia, viajando una vez al año…"
            style={{ resize: "vertical", fontFamily: "inherit" }}
          />
        </div>
        <div className="fld">
          <label className="fld-label">Elige una imagen mental de tu futuro financiero</label>
          <OptionCards
            options={O.FUTURE_IMAGES}
            value={d.futureImage}
            onChange={(v) => set({ futureImage: v })}
          />
        </div>
        <div className="fld">
          <label className="fld-label">¿Qué quieres sentir cuando uses esta app? (máx. 3)</label>
          <Chips
            options={O.DESIRED_FEELINGS}
            values={d.desiredFeeling ?? []}
            onToggle={(v) => set({ desiredFeeling: toggle(d.desiredFeeling, v) })}
            max={3}
          />
        </div>
      </div>
    ),
  },
];

export function Wizard({ initialDraft }: { initialDraft?: ProfileDraft }) {
  const router = useRouter();
  const [draft, setDraft] = useState<ProfileDraft>(initialDraft ?? {});
  const [index, setIndex] = useState(0);
  const [finishing, setFinishing] = useState(false);
  const [diagnosis, setDiagnosis] = useState<ProfileDiagnosis | null>(null);
  // Pantalla inicial de 3 opciones; si ya hay borrador, va directo al wizard.
  const resuming = Boolean(initialDraft && Object.keys(initialDraft).length > 0);
  const [started, setStarted] = useState(resuming);

  const set: Update = useCallback((patch) => setDraft((d) => ({ ...d, ...patch })), []);

  const total = STEPS.length;
  const step = STEPS[index]!;
  const completion = computeCompletion(draft);

  const goNext = async () => {
    // Guardado progresivo best-effort al avanzar.
    void saveDraftAction(draft);
    if (index < total - 1) {
      setIndex((i) => i + 1);
      window.scrollTo({ top: 0, behavior: "smooth" });
    } else {
      await finish();
    }
  };

  const finish = async () => {
    setFinishing(true);
    const goalDetails = (draft.goals ?? []).map((g) => ({
      name: O.GOALS.find((o) => o.value === g)?.label ?? g,
    }));
    const res = await completeOnboardingAction({ ...draft, goalDetails });
    setFinishing(false);
    setDiagnosis(res.diagnosis);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  if (diagnosis) {
    return (
      <ProfileSummary
        diagnosis={diagnosis}
        onContinue={() => router.push("/dashboard")}
        onEdit={() => setDiagnosis(null)}
      />
    );
  }

  if (!started) {
    return <StartChoice onGuided={() => setStarted(true)} />;
  }

  return (
    <div className="wiz">
      <aside className="wiz-side">
        <div className="brand">
          <BrandMark />
          <div>
            <div className="brand-name">
              Compound <span className="ascend">Ascend</span>
            </div>
            <div className="brand-sub">Tu perfil · {total} pasos</div>
          </div>
        </div>
        <div className="side-eyebrow">Tu configuración</div>
        <ol className="stepper">
          {STEPS.map((s, i) => (
            <li
              key={s.id}
              className={cn("step-item", i === index && "active", i < index && "done")}
              onClick={() => setIndex(i)}
            >
              <span className="marker">{i < index ? <Icon name="check" width={3} /> : i + 1}</span>
              <span>{s.label}</span>
            </li>
          ))}
        </ol>
        <div className="side-footer">
          <ThemeToggle />
          <div className="meta">Guardado automático</div>
        </div>
      </aside>

      <main className="wiz-main">
        <div className="wiz-top">
          <div className="progress">
            <span>
              Paso <strong>{index + 1}</strong> de <strong>{total}</strong>
            </span>
            <div className="progress-bar">
              <div
                className="progress-bar-fill"
                style={{ width: `${((index + 1) / total) * 100}%` }}
              />
            </div>
            <span>{completion}% de perfil</span>
          </div>
          <button className="exit-btn" onClick={() => router.push("/dashboard")}>
            Guardar y salir
          </button>
        </div>

        <div className="wiz-canvas">
          <section className="step-frame" key={step.id}>
            <div className="step-eyebrow">{step.eyebrow}</div>
            <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
              <h1
                className="step-title"
                style={{ margin: 0 }}
                dangerouslySetInnerHTML={{ __html: step.titleHTML }}
              />
              <HelpTip text={step.help} label={`Para qué sirve: ${step.label}`} />
            </div>
            <p className="step-sub">{step.sub}</p>
            {step.render(draft, set)}
          </section>
        </div>

        <div className="wiz-foot">
          <button
            className="btn btn-ghost"
            onClick={() => setIndex((i) => Math.max(0, i - 1))}
            disabled={index === 0}
            style={index === 0 ? { opacity: 0.4 } : undefined}
          >
            Atrás
          </button>
          <div className="dots">
            {STEPS.map((s, i) => (
              <span
                key={s.id}
                className={cn("dot", i === index && "active", i < index && "done")}
              />
            ))}
          </div>
          <button className="btn btn-primary" onClick={goNext} disabled={finishing}>
            {finishing ? "Generando tu perfil…" : index === total - 1 ? "Finalizar" : "Continuar"}
            <Icon name="chev" width={2.2} />
          </button>
        </div>
      </main>
    </div>
  );
}
