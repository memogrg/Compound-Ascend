"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { formatMoney, formatPercent } from "@/lib/format";
import { cn } from "@/lib/utils";
import { addGoalAction, editGoalAction } from "@/modules/control/api/actions";
import {
  addPolicyAction,
  removePolicyAction,
  setPeaceMonthsAction,
} from "@/modules/wealth/api/actions";
// Motor puro (sin `server-only`): el rango 3-6 del fondo de paz es una regla del
// dominio, no un número suelto de esta pantalla.
import { PEACE_MONTHS_MAX, PEACE_MONTHS_MIN } from "@/modules/wealth/engine/fund-sizing";
import { defensaSteps } from "@/modules/setup/engine/progress";
import {
  SetupWizard,
  type SetupSkin,
  type SetupStepDef,
} from "@/modules/setup/components/setup-wizard";
import {
  AddBlock,
  ExistingList,
  Field,
  InlineForm,
  MoneyInput,
  RowAction,
  SelectInput,
  TextInput,
} from "@/modules/setup/components/setup-fields";
import type { SetupFund, SetupSnapshot } from "@/modules/setup/types";

/**
 * Asistente de DEFENSA: fondo de emergencia -> fondo de paz -> seguros.
 *
 * El DIMENSIONAMIENTO no se calcula acá: llega ya resuelto por
 * `wealth/engine/fund-sizing` dentro del snapshot (objetivo, acumulado, brecha
 * y aporte sugerido para cerrarla en el horizonte). Este archivo lo muestra y
 * escribe con los actions de siempre: `addGoalAction`/`editGoalAction` para las
 * metas de los fondos (que es lo que son), `setPeaceMonthsAction` para los
 * meses de paz y `addPolicyAction` para las pólizas.
 */
export function DefensaWizard({
  snapshot,
  skin = "web",
  exitHref,
}: {
  snapshot: SetupSnapshot;
  skin?: SetupSkin;
  exitHref: string;
}) {
  const status = defensaSteps(snapshot);

  const steps: SetupStepDef[] = [
    {
      id: "emergencia",
      label: "Emergencia",
      eyebrow: "Paso 1 · El piso",
      title: "Tu fondo de emergencia",
      sub: "El colchón para el imprevisto chico: la llanta, el diente, el electrodoméstico.",
      help: "Es el primer fondo y el más urgente: sin él, cualquier imprevisto vuelve a la tarjeta. El objetivo lo dimensiona el motor de Defensa, y el aporte sugerido es lo que hace falta para cerrarlo en el horizonte previsto.",
      celebration: "Ese es el piso. Con eso, un imprevisto deja de ser una crisis.",
      done: status[0]!.done,
      render: () => (
        <FondoStep
          snapshot={snapshot}
          fund={snapshot.emergency}
          goalType="defensa:fondo_emergencia"
          defaultName="Fondo de emergencia"
          blocked={null}
        />
      ),
    },
    {
      id: "paz",
      label: "Paz",
      eyebrow: "Paso 2 · La tranquilidad",
      title: "Tu fondo de paz",
      sub: "Meses de gasto esencial cubiertos si tu ingreso se detiene.",
      help: "El fondo de paz cubre entre 3 y 6 meses de tu gasto esencial. Cuántos meses es tu decisión: más meses = más tranquilidad y más tiempo para juntarlo. El objetivo se recalcula solo con tu gasto esencial real.",
      celebration: "Con eso, perder el ingreso deja de ser una emergencia inmediata.",
      done: status[1]!.done,
      render: () => <PazStep snapshot={snapshot} />,
    },
    {
      id: "polizas",
      label: "Seguros",
      eyebrow: "Paso 3 · Lo que no podés cubrir solo",
      title: "Tus seguros",
      sub: "Hay golpes que ningún fondo alcanza a cubrir. Para esos, existe la póliza.",
      help: "Los fondos cubren lo que podés pagar de tu bolsillo; el seguro cubre lo que te quebraría. Cargá las pólizas que ya tenés para que el diagnóstico de protección sea real.",
      celebration: "Tu blindaje está registrado.",
      done: status[2]!.done,
      optional: status[2]!.optional,
      render: () => <PolizasStep snapshot={snapshot} />,
    },
  ];

  const startIndex = steps.findIndex((s) => !s.done);

  return (
    <SetupWizard
      steps={steps}
      skin={skin}
      exitHref={exitHref}
      startIndex={startIndex < 0 ? 0 : startIndex}
      finishHref={exitHref}
    />
  );
}

// ── Barra de un fondo ────────────────────────────────────────────────────────

function FundBar({ fund, currency }: { fund: SetupFund; currency: string }) {
  return (
    <div className="setup-fund">
      <div className="setup-fund-head">
        <span>
          {formatMoney(fund.current, currency)} de {formatMoney(fund.target, currency)}
        </span>
        <strong className={cn(fund.covered && "ok")}>{formatPercent(fund.progressPct)}</strong>
      </div>
      <div className="progress-bar">
        <div
          className="progress-bar-fill"
          style={{ width: `${Math.min(100, fund.progressPct * 100)}%` }}
        />
      </div>
      <div className="setup-fund-gap">
        {fund.covered
          ? "Cubierto. Este fondo ya no necesita aportes."
          : `Te faltan ${formatMoney(fund.gap, currency)}.`}
      </div>
    </div>
  );
}

// ── Pasos 1 y 2 · los fondos ─────────────────────────────────────────────────

function FondoStep({
  snapshot,
  fund,
  goalType,
  defaultName,
  blocked,
}: {
  snapshot: SetupSnapshot;
  fund: SetupFund | null;
  goalType: string;
  defaultName: string;
  /** Mensaje si el fondo está bloqueado por el hito anterior (paz tras emergencia). */
  blocked: string | null;
}) {
  const currency = snapshot.currency;
  const goal = snapshot.goals.find((g) => g.goalType === goalType) ?? null;
  const [monthly, setMonthly] = useState<number | null>(
    goal ? goal.monthlyContribution || null : (fund?.recommendedMonthly ?? null),
  );

  if (!fund) {
    return (
      <div className="setup-empty">
        No pudimos dimensionar el fondo todavía. Configurá tu presupuesto primero: el objetivo se
        calcula sobre tu gasto esencial.
      </div>
    );
  }

  return (
    <div className="setup-step">
      <FundBar fund={fund} currency={currency} />

      {blocked ? <div className="setup-note">{blocked}</div> : null}

      {fund.recommendedMonthly > 0 ? (
        <div className="setup-suggestion">
          <span>
            Para cerrarlo en el plazo previsto, apartá{" "}
            <strong>{formatMoney(fund.recommendedMonthly, currency)}</strong> al mes.
          </span>
          <button
            type="button"
            className="setup-suggestion-cta"
            onClick={() => setMonthly(fund.recommendedMonthly)}
          >
            Usar {formatMoney(fund.recommendedMonthly, currency)}
          </button>
        </div>
      ) : null}

      <Field label="Aporte mensual a este fondo">
        <MoneyInput value={monthly} onChange={setMonthly} currency={currency} />
      </Field>

      <InlineForm
        submitLabel={goal ? "Guardar aporte" : "Crear el fondo"}
        onSubmit={() =>
          goal
            ? editGoalAction(goal.id, {
                name: goal.name,
                kind: "meta",
                goalType,
                targetAmount: fund.target,
                currentAmount: goal.currentAmount,
                monthlyContribution: monthly ?? 0,
                currency: goal.currency,
                recurrence: goal.recurrence,
              })
            : addGoalAction({
                name: defaultName,
                kind: "meta",
                goalType,
                targetAmount: fund.target,
                currentAmount: 0,
                monthlyContribution: monthly ?? 0,
                currency,
                recurrence: "ninguna",
              })
        }
      />
    </div>
  );
}

function PazStep({ snapshot }: { snapshot: SetupSnapshot }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const pz = snapshot.peace;
  const months = pz?.months ?? PEACE_MONTHS_MIN;
  const opciones = Array.from(
    { length: PEACE_MONTHS_MAX - PEACE_MONTHS_MIN + 1 },
    (_, i) => PEACE_MONTHS_MIN + i,
  );

  return (
    <div className="setup-step">
      <Field
        label="¿Cuántos meses querés cubrir?"
        hint={
          snapshot.essentialMonthly > 0
            ? `Tu gasto esencial es ${formatMoney(snapshot.essentialMonthly, snapshot.currency)} al mes.`
            : "Configurá tu presupuesto para que el objetivo se calcule con tu gasto real."
        }
      >
        <div className="scale">
          {opciones.map((m) => (
            <button
              key={m}
              type="button"
              className={cn("scale-btn", m === months && "on")}
              disabled={pending}
              onClick={() =>
                start(async () => {
                  const res = await setPeaceMonthsAction(m);
                  if (res.ok) router.refresh();
                })
              }
            >
              {m}
            </button>
          ))}
        </div>
      </Field>

      <FondoStep
        snapshot={snapshot}
        fund={pz}
        goalType="defensa:fondo_paz"
        defaultName="Fondo de paz"
        blocked={
          pz?.blockedByEmergency
            ? "Primero el fondo de emergencia: mientras no esté cubierto, no recomendamos aportar acá. Podés crearlo igual para tenerlo dimensionado."
            : null
        }
      />
    </div>
  );
}

// ── Paso 3 · Pólizas ─────────────────────────────────────────────────────────

const POLICY_TYPES = [
  { value: "gastos_mayores", label: "Gastos médicos mayores" },
  { value: "vida", label: "Vida" },
  { value: "medico", label: "Médico" },
  { value: "gastos_menores", label: "Gastos médicos menores" },
  { value: "incapacidad", label: "Incapacidad" },
  { value: "hogar", label: "Hogar" },
  { value: "vehiculo", label: "Vehículo" },
  { value: "patrimonial", label: "Patrimonial" },
  { value: "otro", label: "Otro" },
];

const PREMIUM_FREQ = [
  { value: "mensual", label: "Mensual" },
  { value: "trimestral", label: "Trimestral" },
  { value: "semestral", label: "Semestral" },
  { value: "anual", label: "Anual" },
];

function PolizasStep({ snapshot }: { snapshot: SetupSnapshot }) {
  const [policyType, setPolicyType] = useState("gastos_mayores");
  const [provider, setProvider] = useState("");
  const [coverage, setCoverage] = useState<number | null>(null);
  const [premium, setPremium] = useState<number | null>(null);
  const [premiumFrequency, setPremiumFrequency] = useState("mensual");
  const currency = snapshot.currency;

  const label = (t: string) => POLICY_TYPES.find((p) => p.value === t)?.label ?? t;

  return (
    <div className="setup-step">
      <ExistingList
        empty="No cargaste ninguna póliza. Si todavía no tenés seguros, este paso puede esperar."
        items={snapshot.policies.map((p) => ({
          id: p.id,
          title: label(p.policyType),
          sub: p.provider ?? "Sin aseguradora cargada",
          value: p.coverage ? formatMoney(p.coverage, p.currency) : "sin cobertura cargada",
          actions: <RowAction label="Quitar" danger onRun={() => removePolicyAction(p.id)} />,
        }))}
      />

      <AddBlock
        label={snapshot.policies.length > 0 ? "Agregar otra póliza" : "Agregar una póliza"}
        openLabel="Nueva póliza"
        defaultOpen={snapshot.policies.length === 0}
      >
        <Field label="Tipo de seguro">
          <SelectInput value={policyType} onChange={setPolicyType} options={POLICY_TYPES} />
        </Field>
        <Field label="Aseguradora">
          <TextInput
            value={provider}
            onChange={setProvider}
            placeholder="INS, Sagicor…"
            maxLength={80}
          />
        </Field>
        <Field label="Cobertura" hint="Cuánto paga la póliza en el peor caso.">
          <MoneyInput value={coverage} onChange={setCoverage} currency={currency} />
        </Field>
        <Field label="Prima">
          <MoneyInput value={premium} onChange={setPremium} currency={currency} />
        </Field>
        <Field label="Cada cuánto pagás la prima">
          <SelectInput
            value={premiumFrequency}
            onChange={setPremiumFrequency}
            options={PREMIUM_FREQ}
          />
        </Field>
        <InlineForm
          submitLabel="Agregar póliza"
          onSubmit={() =>
            addPolicyAction({
              policyType,
              provider: provider.trim() || undefined,
              coverage: coverage ?? undefined,
              premium: premium ?? undefined,
              premiumFrequency,
              currency,
            })
          }
          onDone={() => {
            setProvider("");
            setCoverage(null);
            setPremium(null);
          }}
        />
      </AddBlock>
    </div>
  );
}
