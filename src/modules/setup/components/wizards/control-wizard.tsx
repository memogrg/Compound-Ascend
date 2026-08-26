"use client";

import { useState } from "react";

import { formatMoney } from "@/lib/format";
import {
  addDebtAction,
  addGoalAction,
  editGoalAction,
  removeDebtAction,
  removeGoalAction,
} from "@/modules/control/api/actions";
import { controlSteps } from "@/modules/setup/engine/progress";
import { budgetBalance, suggestGoalMonthly } from "@/modules/setup/engine/suggestions";
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
  SuggestionNote,
  TextInput,
} from "@/modules/setup/components/setup-fields";
import type { SetupSnapshot } from "@/modules/setup/types";

/**
 * Asistente de CONTROL: deudas -> metas de ahorro.
 *
 * Escribe con `addDebtAction` / `addGoalAction` (los mismos de
 * /deudas y /control-financiero). Al reentrar muestra lo que ya existe y deja
 * editarlo — el aporte mensual de una meta se cambia desde acá con
 * `editGoalAction`, que es el mismo camino del formulario de Ahorro.
 */
export function ControlWizard({
  snapshot,
  skin = "web",
  exitHref,
}: {
  snapshot: SetupSnapshot;
  skin?: SetupSkin;
  exitHref: string;
}) {
  const status = controlSteps(snapshot);

  const steps: SetupStepDef[] = [
    {
      id: "deudas",
      label: "Deudas",
      eyebrow: "Paso 1 · Lo que debés",
      title: "¿A quién le debés?",
      sub: "Cargá cada deuda con su saldo, su cuota y su tasa. Sin la tasa no se puede priorizar.",
      help: "Con el saldo, la cuota y la tasa de cada deuda, el motor de prioridades decide a cuál abonarle primero y cuánto te ahorra hacerlo. Es la misma lista de la pantalla de Deudas.",
      celebration: "Ya sabemos exactamente contra qué estás jugando.",
      done: status[0]!.done,
      optional: status[0]!.optional,
      render: () => <DeudasStep snapshot={snapshot} />,
    },
    {
      id: "metas",
      label: "Metas",
      eyebrow: "Paso 2 · Hacia dónde ahorrás",
      title: "¿Para qué estás ahorrando?",
      sub: "Una meta sin aporte mensual es un deseo. Poné cuánto le vas a mandar.",
      help: "Cada meta guarda su objetivo y su aporte mensual. Ese aporte es lo que el panel usa para decir si vas en tiempo o atrasado, y es la misma meta que ves en Ahorro.",
      celebration: "Tus metas ya tienen combustible.",
      done: status[1]!.done,
      render: () => <MetasStep snapshot={snapshot} />,
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

// ── Paso 1 · Deudas ──────────────────────────────────────────────────────────

function DeudasStep({ snapshot }: { snapshot: SetupSnapshot }) {
  const [name, setName] = useState("");
  const [balance, setBalance] = useState<number | null>(null);
  const [minPayment, setMinPayment] = useState<number | null>(null);
  const [apr, setApr] = useState<number | null>(null);
  const currency = snapshot.currency;

  const total = snapshot.debts.reduce((t, d) => t + d.balance, 0);

  return (
    <div className="setup-step">
      <ExistingList
        empty="No cargaste ninguna deuda. Si no debés nada, este paso ya está: seguí al siguiente."
        items={snapshot.debts.map((d) => ({
          id: d.id,
          title: d.name,
          sub: `Cuota ${formatMoney(d.minPayment, d.currency)}${d.apr ? ` · ${d.apr}% anual` : " · sin tasa cargada"}`,
          value: formatMoney(d.balance, d.currency),
          actions: <RowAction label="Quitar" danger onRun={() => removeDebtAction(d.id)} />,
        }))}
      />

      {snapshot.debts.length > 0 ? (
        <div className="setup-total">
          Deuda total <strong>{formatMoney(total, currency)}</strong>
        </div>
      ) : null}

      <AddBlock
        label={snapshot.debts.length > 0 ? "Agregar otra deuda" : "Agregar una deuda"}
        openLabel="Nueva deuda"
        defaultOpen={snapshot.debts.length === 0}
      >
        <Field label="¿Qué deuda es?">
          <TextInput
            value={name}
            onChange={setName}
            placeholder="Tarjeta BAC, préstamo del carro…"
            maxLength={120}
          />
        </Field>
        <Field label="Saldo actual">
          <MoneyInput value={balance} onChange={setBalance} currency={currency} />
        </Field>
        <Field label="Cuota mensual">
          <MoneyInput value={minPayment} onChange={setMinPayment} currency={currency} />
        </Field>
        <Field
          label="Tasa anual (%)"
          hint="Es lo que decide el orden de pago. Si no la sabés, mirá el estado de cuenta."
        >
          <input
            className="inp"
            type="number"
            min={0}
            max={200}
            step="any"
            value={apr === null ? "" : String(apr)}
            onChange={(e) => setApr(e.target.value === "" ? null : Number(e.target.value))}
            placeholder="0"
          />
        </Field>
        <InlineForm
          submitLabel="Agregar deuda"
          disabled={!name.trim() || balance === null}
          onSubmit={() =>
            addDebtAction({
              name: name.trim(),
              balance: balance ?? 0,
              minPayment: minPayment ?? 0,
              currentPayment: minPayment ?? 0,
              apr: apr ?? undefined,
              currency,
            })
          }
          onDone={() => {
            setName("");
            setBalance(null);
            setMinPayment(null);
            setApr(null);
          }}
        />
      </AddBlock>
    </div>
  );
}

// ── Paso 2 · Metas ───────────────────────────────────────────────────────────

const RECURRENCES = [
  { value: "ninguna", label: "Una sola vez" },
  { value: "mensual", label: "Se reinicia cada mes" },
  { value: "trimestral", label: "Cada trimestre" },
  { value: "semestral", label: "Cada semestre" },
  { value: "anual", label: "Cada año" },
];

function MetasStep({ snapshot }: { snapshot: SetupSnapshot }) {
  const [name, setName] = useState("");
  const [target, setTarget] = useState<number | null>(null);
  const [monthly, setMonthly] = useState<number | null>(null);
  const [targetDate, setTargetDate] = useState("");
  const [recurrence, setRecurrence] = useState("ninguna");
  const currency = snapshot.currency;

  // Los fondos de defensa son savings_goals también: se configuran en su propio
  // asistente y acá se ocultan para no ofrecer dos puertas al mismo dato.
  const metas = snapshot.goals.filter((g) => !(g.goalType ?? "").startsWith("defensa:"));
  const libre = budgetBalance(snapshot.incomeMonthly, snapshot.budgetedMonthly, currency).free;

  const suggestion = suggestGoalMonthly(target ?? 0, 0, targetDate || null, new Date(), currency);

  return (
    <div className="setup-step">
      <ExistingList
        empty="Todavía no tenés metas de ahorro."
        items={metas.map((g) => ({
          id: g.id,
          title: g.name,
          sub:
            g.targetAmount > 0
              ? `${formatMoney(g.currentAmount, g.currency)} de ${formatMoney(g.targetAmount, g.currency)}`
              : "Sobre acumulador (sin objetivo)",
          value:
            g.monthlyContribution > 0
              ? `${formatMoney(g.monthlyContribution, g.currency)}/mes`
              : "sin aporte",
          actions: (
            <>
              <AporteEditor goal={g} />
              <RowAction label="Quitar" danger onRun={() => removeGoalAction(g.id)} />
            </>
          ),
        }))}
      />

      {libre > 0 ? (
        <div className="setup-total">
          Te quedan <strong>{formatMoney(libre, currency)}</strong> libres cada mes para repartir
          entre tus metas.
        </div>
      ) : null}

      <AddBlock
        label={metas.length > 0 ? "Agregar otra meta" : "Agregar mi primera meta"}
        openLabel="Nueva meta"
        defaultOpen={metas.length === 0}
      >
        <Field label="¿Para qué?">
          <TextInput
            value={name}
            onChange={setName}
            placeholder="Viaje, prima del carro, estudio…"
            maxLength={120}
          />
        </Field>
        <Field label="¿Cuánto querés juntar?" hint="Dejalo vacío si es un sobre sin meta fija.">
          <MoneyInput value={target} onChange={setTarget} currency={currency} />
        </Field>
        <Field label="¿Para cuándo?">
          <input
            className="inp"
            type="date"
            value={targetDate}
            onChange={(e) => setTargetDate(e.target.value)}
          />
        </Field>
        {target ? (
          <SuggestionNote suggestion={suggestion} currency={currency} onApply={setMonthly} />
        ) : null}
        <Field label="Aporte mensual">
          <MoneyInput value={monthly} onChange={setMonthly} currency={currency} />
        </Field>
        <Field label="Recurrencia">
          <SelectInput value={recurrence} onChange={setRecurrence} options={RECURRENCES} />
        </Field>
        <InlineForm
          submitLabel="Agregar meta"
          disabled={!name.trim()}
          onSubmit={() =>
            addGoalAction({
              name: name.trim(),
              kind: target ? "meta" : "sobre",
              targetAmount: target ?? null,
              currentAmount: 0,
              monthlyContribution: monthly ?? 0,
              currency,
              targetDate: targetDate || undefined,
              recurrence,
            })
          }
          onDone={() => {
            setName("");
            setTarget(null);
            setMonthly(null);
            setTargetDate("");
            setRecurrence("ninguna");
          }}
        />
      </AddBlock>
    </div>
  );
}

/**
 * Edición del aporte mensual de una meta YA existente, en la misma fila. Usa
 * `editGoalAction` (el del formulario de Ahorro) reenviando el resto de los
 * campos sin tocarlos: el asistente MODIFICA, no reemplaza.
 */
function AporteEditor({ goal }: { goal: SetupSnapshot["goals"][number] }) {
  const [open, setOpen] = useState(false);
  const [monthly, setMonthly] = useState<number | null>(goal.monthlyContribution || null);

  if (!open) {
    return (
      <button type="button" className="setup-row-action" onClick={() => setOpen(true)}>
        Aporte
      </button>
    );
  }
  return (
    <div className="setup-inline-new">
      <MoneyInput value={monthly} onChange={setMonthly} currency={goal.currency} />
      <InlineForm
        submitLabel="Guardar"
        onSubmit={() =>
          editGoalAction(goal.id, {
            name: goal.name,
            kind: goal.kind,
            goalType: goal.goalType ?? undefined,
            targetAmount: goal.targetAmount || null,
            currentAmount: goal.currentAmount,
            monthlyContribution: monthly ?? 0,
            currency: goal.currency,
            recurrence: goal.recurrence,
          })
        }
        onDone={() => setOpen(false)}
        secondary={
          <button type="button" className="btn btn-secondary" onClick={() => setOpen(false)}>
            Cancelar
          </button>
        }
      />
    </div>
  );
}
