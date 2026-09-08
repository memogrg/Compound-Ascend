"use client";

/**
 * Cliente de /m/mis-acciones: prioridad (chips), tres pestañas y las acciones.
 *
 * La regla de este archivo: NO calcula nada. Todo llega resuelto del servidor (mismo motor que
 * la web) y acá solo se elige la piel móvil — MSummaryCard para la hero, MContentCard para cada
 * acción, MProgress para las etapas, mAmount() para que ninguna cifra se corte.
 *
 * El «¿Por qué esto primero?» abre una hoja en vez de desplegarse en línea: en una pantalla de
 * 360px, un párrafo que empuja el resto de la lista hace perder el lugar donde ibas.
 */
import { useState, useTransition, type ReactNode } from "react";
import Link from "next/link";
import {
  MSummaryCard,
  MSectionHeader,
  MContentCard,
  MDataRow,
  MMetricGrid,
  MMetricCard,
  MChip,
  MProgress,
  MEmptyState,
  mAmount,
} from "../../components/content-kit";
import { BottomSheet, useToast } from "../../components/form-kit";
// Rutas directas y NO el barrel de actions: éste es un componente de cliente, y el barrel
// re-exporta los servicios ("server-only") — importarlo desde acá rompe el build móvil.
import {
  markActionDone,
  snoozeAction,
  dismissAction,
  reactivateAction,
  setActionPriority,
} from "@/modules/actions/api/actions";
import { proximoRecordatorio } from "@/modules/actions/components/action-buttons";
import type {
  Action,
  ActionKind,
  ActionPlan,
  ActionPriority,
  ActionProgress,
} from "@/modules/actions/types";
import type { DecisionsView } from "@/modules/actions/services/actions-service";
import { formatMoney } from "@/lib/format";

type Tab = "mes" | "decisiones" | "progreso";

const TABS: { id: Tab; label: string }[] = [
  { id: "mes", label: "Este mes" },
  { id: "decisiones", label: "Decisiones" },
  { id: "progreso", label: "Progreso" },
];

const PRIORIDADES: { id: ActionPriority; label: string }[] = [
  { id: "deudas", label: "Salir de deudas" },
  { id: "orden", label: "Ordenarme" },
  { id: "proteger", label: "Protegerme" },
  { id: "crecer", label: "Hacer crecer" },
];

const KIND_LABEL: Record<ActionKind, string> = {
  deuda: "Deuda",
  orden: "Orden",
  proteger: "Protección",
  crecer: "Crecimiento",
};

const ETAPAS = [
  "Estabilidad",
  "Protección mínima",
  "Sin deuda cara",
  "Crecimiento inicial",
  "Crecimiento estructurado",
];

export function AccionesManager({
  plan,
  progress,
  decisions,
  comparador,
}: {
  plan: ActionPlan;
  progress: ActionProgress;
  decisions: DecisionsView;
  comparador: ReactNode;
}) {
  const [tab, setTab] = useState<Tab>("mes");
  const [teach, setTeach] = useState<Action | null>(null);
  const [pending, start] = useTransition();
  const toast = useToast();
  const c = (n: number) => formatMoney(n, plan.currency);

  const correr = (fn: () => Promise<{ ok: boolean; message?: string }>, exito: string) =>
    start(async () => {
      const res = await fn();
      toast.show(
        res.ok ? exito : (res.message ?? "No se pudo guardar"),
        res.ok ? "success" : "error",
      );
    });

  const cambiarPrioridad = (p: ActionPriority) => {
    if (p === plan.priority) return;
    correr(() => setActionPriority(p), "Listo, reordené tus acciones.");
  };

  const hero = plan.hero;
  const vacio = !hero && plan.now.length === 0 && plan.later.length === 0;

  return (
    <>
      {/* Prioridad: chips horizontales. Reordenan y cambian el tono, nunca las reglas. */}
      <div className="m-acc-chips" role="radiogroup" aria-label="Tu prioridad">
        {PRIORIDADES.map((p) => (
          <button
            key={p.id}
            type="button"
            role="radio"
            aria-checked={p.id === plan.priority}
            className={`m-acc-chip${p.id === plan.priority ? " on" : ""}`}
            disabled={pending}
            onClick={() => cambiarPrioridad(p.id)}
          >
            {p.label}
          </button>
        ))}
      </div>

      <div className="m-seg" role="tablist" style={{ marginBottom: 14 }}>
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={tab === t.id}
            className={`m-seg-item${tab === t.id ? " on" : ""}`}
            onClick={() => setTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "mes" ? (
        <>
          <div className="m-acc-note">{plan.note}</div>

          {vacio ? (
            <MEmptyState
              icon="goal"
              title="Estás al día"
              description="No hay ninguna acción pendiente con impacto medible. Cuando algo cambie en tu presupuesto, tus deudas o tu portafolio, aparece aquí."
            />
          ) : (
            <>
              {hero ? (
                <MSummaryCard
                  eyebrow="Tu próxima mejor acción"
                  value={cifraCorta(hero, plan.currency)}
                  tone={hero.kind === "crecer" ? "success" : "neutral"}
                  chip={<MChip>{KIND_LABEL[hero.kind]}</MChip>}
                  sub={descripcionImpacto(hero, plan.currency)}
                  slot={
                    <div>
                      <div className="m-acc-title">{hero.title}</div>
                      <p className="m-acc-why">{hero.why}</p>
                      <Botones
                        action={hero}
                        pending={pending}
                        correr={correr}
                        onTeach={() => setTeach(hero)}
                      />
                    </div>
                  }
                  style={{ marginBottom: 14 }}
                />
              ) : null}

              {plan.now.length > 0 ? (
                <>
                  <MSectionHeader title="Después de esa" />
                  {plan.now.map((a, i) => (
                    <Tarjeta
                      key={a.key}
                      action={a}
                      index={i + 2}
                      pending={pending}
                      correr={correr}
                      onTeach={() => setTeach(a)}
                    />
                  ))}
                </>
              ) : null}

              {plan.later.length > 0 ? (
                <>
                  <MSectionHeader title="Cuando termines estas" />
                  {plan.later.map((a, i) => (
                    <Tarjeta
                      key={a.key}
                      action={a}
                      index={plan.now.length + i + 2}
                      pending={pending}
                      correr={correr}
                      onTeach={() => setTeach(a)}
                    />
                  ))}
                </>
              ) : null}
            </>
          )}

          {/* Tu etapa: el mismo camino de cinco pasos del rail web, compacto. */}
          <MSectionHeader title="Tu etapa" />
          <MContentCard style={{ marginBottom: 14 }}>
            <div className="between" style={{ marginBottom: 8 }}>
              <strong style={{ fontSize: 13.5 }}>
                {plan.stage.level}. {ETAPAS[plan.stage.level - 1]}
              </strong>
              <MChip>{plan.stage.level} de 5</MChip>
            </div>
            <MProgress value={(plan.stage.level - 1) / 5} tone="success" />
            {plan.stage.blockers.length > 0 ? (
              <ul className="m-acc-blockers">
                {plan.stage.blockers.map((b) => (
                  <li key={b}>{b}</li>
                ))}
              </ul>
            ) : null}
          </MContentCard>

          <MSectionHeader title="Con qué decidimos" />
          <MContentCard>
            <MDataRow
              dense
              title="Sobrante del mes"
              value={mAmount(plan.inputs.surplus, plan.currency)}
            />
            <MDataRow
              dense
              title="Deuda más cara"
              value={
                plan.inputs.expensiveDebt
                  ? `${plan.inputs.expensiveDebt.name} · ${plan.inputs.expensiveDebt.apr}%`
                  : "Ninguna sobre 12%"
              }
            />
            <MDataRow
              dense
              title="Fondos de defensa"
              value={plan.inputs.fundsCovered ? "Cubiertos" : "En construcción"}
            />
            <MDataRow dense title="Objetivos activos" value={String(plan.inputs.activeGoals)} />
          </MContentCard>
        </>
      ) : null}

      {tab === "decisiones" ? (
        <>
          {comparador}
          {decisions.debts.length > 0 ? (
            <>
              <MSectionHeader title="Avalancha vs bola de nieve" />
              <MContentCard style={{ marginBottom: 14 }}>
                {decisions.debts.map((d) => (
                  <MDataRow
                    key={d.id}
                    dense
                    title={d.name}
                    subtitle={`${d.apr}% · cuota ${mAmount(d.payment, decisions.currency)}`}
                    value={mAmount(d.balance, decisions.currency)}
                    slot={
                      <div className="m-acc-orden">
                        Avalancha #{d.ordenAvalancha} · Bola de nieve #{d.ordenBolaNieve}
                      </div>
                    }
                  />
                ))}
                {decisions.methodsAgree ? (
                  <p className="m-acc-why">
                    Los dos métodos coinciden en el orden de ataque: no hay nada que elegir aquí.
                  </p>
                ) : null}
                {decisions.method ? <p className="m-acc-why">{decisions.method.reason}</p> : null}
              </MContentCard>
            </>
          ) : null}

          {decisions.pauses.map((p) => (
            <MContentCard key={p.goalId} style={{ marginBottom: 14 }}>
              <div className="m-acc-title">¿Y si pauso &quot;{p.goalName}&quot;?</div>
              <p className="m-acc-why">
                {p.reason} Son {c(p.monthly)}/mes.
              </p>
              <MMetricGrid>
                <MMetricCard
                  label="Si lo pausas 90 días"
                  value={mAmount(p.interestSaved, decisions.currency)}
                  sub={`${p.monthsSaved} meses antes · tu objetivo se corre ~${p.goalShiftMonths} meses`}
                  tone="success"
                />
                <MMetricCard
                  label="Si lo mantienes"
                  value={mAmount(0, decisions.currency)}
                  sub="la deuda sigue su curso; tu objetivo llega a tiempo"
                />
              </MMetricGrid>
            </MContentCard>
          ))}
        </>
      ) : null}

      {tab === "progreso" ? (
        <>
          <MMetricGrid cols={3} style={{ marginBottom: 14 }}>
            <MMetricCard
              label="Intereses evitados"
              value={mAmount(progress.interestAvoided, progress.currency, 8)}
              tone="success"
            />
            <MMetricCard label="Meses ganados" value={String(progress.monthsGained)} />
            <MMetricCard
              label="Decisiones"
              value={`${progress.done.length}·${progress.snoozed.length}·${progress.dismissed.length}`}
              sub="hechas · pospuestas · descartadas"
            />
          </MMetricGrid>

          {progress.done.length === 0 &&
          progress.snoozed.length === 0 &&
          progress.dismissed.length === 0 ? (
            <MEmptyState
              icon="rules"
              title="Todavía no hay historial"
              description="Cuando marques una acción como hecha, pospuesta o descartada, aquí verás qué decidiste y cuánto valió."
            />
          ) : (
            <MContentCard>
              {progress.done.map((s) => (
                <MDataRow
                  key={s.id}
                  dense
                  title={s.impact?.label ?? s.actionKey}
                  subtitle={`Hecha · ${s.updatedAt.slice(0, 10)}`}
                />
              ))}
              {[...progress.snoozed, ...progress.dismissed].map((s) => (
                <MDataRow
                  key={s.id}
                  dense
                  title={s.impact?.label ?? s.actionKey}
                  subtitle={
                    s.status === "pospuesta" && s.snoozeUntil
                      ? `Pospuesta hasta ${s.snoozeUntil}`
                      : "Descartada"
                  }
                  trailing={
                    <button
                      type="button"
                      className="m-acc-btn"
                      disabled={pending}
                      onClick={() =>
                        correr(() => reactivateAction(s.actionKey), "Vuelve a tu lista.")
                      }
                    >
                      Reactivar
                    </button>
                  }
                />
              ))}
            </MContentCard>
          )}
        </>
      ) : null}

      <BottomSheet
        open={teach !== null}
        onClose={() => setTeach(null)}
        title="¿Por qué esto primero?"
      >
        <p className="m-acc-teach">{teach?.teach.replace(/\*\*/g, "")}</p>
        {teach ? (
          <Link
            className="m-acc-btn m-acc-btn-primary"
            href={teach.route}
            onClick={() => setTeach(null)}
          >
            Ir a hacerlo
          </Link>
        ) : null}
      </BottomSheet>
    </>
  );
}

/** Los tres botones. En móvil «No por ahora» se acorta a «No»: la fila tiene 320px. */
function Botones({
  action,
  pending,
  correr,
  onTeach,
}: {
  action: Action;
  pending: boolean;
  correr: (fn: () => Promise<{ ok: boolean; message?: string }>, exito: string) => void;
  onTeach: () => void;
}) {
  return (
    <div className="m-acc-row">
      <button
        type="button"
        className="m-acc-btn m-acc-btn-primary"
        disabled={pending}
        onClick={() =>
          correr(() => markActionDone(action.key, action.impact), "Anotado. Bien ahí.")
        }
      >
        Lo hago
      </button>
      <button
        type="button"
        className="m-acc-btn"
        disabled={pending}
        onClick={() =>
          correr(
            () => snoozeAction(action.key, proximoRecordatorio(new Date())),
            "Te la recuerdo pronto.",
          )
        }
      >
        Recordarme
      </button>
      <button
        type="button"
        className="m-acc-btn"
        disabled={pending}
        onClick={() =>
          correr(
            () => dismissAction(action.key, action.relatedInsightId),
            "Listo, no te la vuelvo a proponer.",
          )
        }
      >
        No
      </button>
      <button type="button" className="m-acc-link" onClick={onTeach}>
        ¿Por qué?
      </button>
    </div>
  );
}

function Tarjeta({
  action,
  index,
  pending,
  correr,
  onTeach,
}: {
  action: Action;
  index: number;
  pending: boolean;
  correr: (fn: () => Promise<{ ok: boolean; message?: string }>, exito: string) => void;
  onTeach: () => void;
}) {
  return (
    <MContentCard style={{ marginBottom: 12, opacity: action.locked ? 0.72 : 1 }}>
      <div className="between" style={{ marginBottom: 6 }}>
        <span className="mono m-acc-num">{String(index).padStart(2, "0")}</span>
        <MChip tone={action.locked ? "neutral" : "success"}>{KIND_LABEL[action.kind]}</MChip>
      </div>
      <div className="m-acc-title">{action.title}</div>
      <p className="m-acc-why">{action.why}</p>
      <div className="m-acc-impact mono">{action.impact.label}</div>
      {action.locked ? (
        <div className="m-acc-lock">🔒 {action.lockReason}</div>
      ) : (
        <Botones action={action} pending={pending} correr={correr} onTeach={onTeach} />
      )}
    </MContentCard>
  );
}

/**
 * La cifra grande de la hero: el número solo, abreviado si no cabe. Un porcentaje o un plazo no
 * tienen moneda, así que van tal cual.
 */
function cifraCorta(action: Action, currency: string): string {
  const { kind, value, label } = action.impact;
  if (kind === "monto" || kind === "brecha") return mAmount(value ?? 0, currency, 11);
  return label;
}

/**
 * El subtexto de la hero: la etiqueta del impacto SIN repetir el monto que ya está arriba
 * ("₡640.000 de interés que no pagás" → "de interés que no pagás"). Repetir la cifra dos veces
 * en dos líneas seguidas la hace parecer dos cifras distintas.
 */
function descripcionImpacto(action: Action, currency: string): string {
  const { kind, value, label } = action.impact;
  if (kind !== "monto" && kind !== "brecha") return label;
  const monto = formatMoney(value ?? 0, currency);
  return label.startsWith(monto) ? label.slice(monto.length).trim() : label;
}
