import { useState } from "react";

import {
  FormShell,
  TextField,
  MoneyField,
  DateField,
  Segmented,
  SheetSelect,
  CUR_OPTS,
  type ActionResult,
  type Opt,
} from "../../components/form-kit";

/**
 * Formulario de meta reutilizable por ALTA y EDICIÓN (mismo goalInputSchema), espejo de
 * Income/ExpenseForm. Agnóstico de la action (addGoalAction / editGoalAction ligada a id).
 * IMPORTANTE: arrastra `currentAmount` (no editable) para que editar NO lo resetee a 0
 * (el schema tiene default 0); el saldo se mueve solo con aportes/retiros.
 */

export type GoalValues = {
  name: string;
  targetAmount: number | undefined;
  currentAmount: number;
  monthlyContribution: number | undefined;
  currency: string;
  targetDate: string | undefined;
  priority: string;
  goalType?: string;
};

const PRIORITY_OPTS: Opt[] = [
  { value: "alta", label: "Alta" },
  { value: "media", label: "Media" },
  { value: "baja", label: "Baja" },
];

// Toggle Defensa (Normal / Defensa).
const MODE_OPTS: Opt[] = [
  { value: "normal", label: "Normal" },
  { value: "defensa", label: "Defensa" },
];

// En móvil solo se ofrecen los dos FONDOS. Los seguros (gastos mayores / vida)
// se crean desde el flujo web; en móvil quedan como follow-up (no reutilizamos
// aún el formulario de póliza móvil desde este flujo).
const DEFENSE_FUND_OPTS: Opt[] = [
  { value: "defensa:fondo_emergencia", label: "Fondo de emergencia" },
  { value: "defensa:fondo_paz", label: "Fondo de paz" },
];

export function GoalForm({
  initial,
  currency,
  action,
  submitLabel,
  successMessage,
  onSuccess,
}: {
  initial?: Partial<GoalValues>;
  currency: string;
  action: (raw: GoalValues) => Promise<ActionResult>;
  submitLabel: string;
  successMessage: string;
  onSuccess: () => void;
}) {
  const [name, setName] = useState(initial?.name ?? "");
  const [targetAmount, setTargetAmount] = useState<number | undefined>(initial?.targetAmount);
  const [monthlyContribution, setMonthly] = useState<number | undefined>(initial?.monthlyContribution);
  const [targetDate, setTargetDate] = useState(initial?.targetDate ?? "");
  const [priority, setPriority] = useState(initial?.priority ?? "media");
  const [cur, setCur] = useState(initial?.currency ?? currency);
  const initialDefense = (initial?.goalType ?? "").startsWith("defensa:");
  const [mode, setMode] = useState(initialDefense ? "defensa" : "normal");
  const [defenseKind, setDefenseKind] = useState(
    initialDefense ? initial!.goalType! : "defensa:fondo_emergencia",
  );
  const isDefense = mode === "defensa";

  // Fondo de defensa sin nombre → se prefija (sin pisar lo que el usuario puso).
  const effectiveName =
    isDefense && !name.trim()
      ? defenseKind === "defensa:fondo_paz"
        ? "Fondo de paz"
        : "Fondo de emergencia"
      : name;

  const values: GoalValues = {
    name: effectiveName,
    targetAmount,
    currentAmount: initial?.currentAmount ?? 0, // se preserva en edición; 0 al crear
    monthlyContribution,
    currency: cur,
    targetDate: targetDate === "" ? undefined : targetDate,
    priority,
    goalType: isDefense ? defenseKind : undefined,
  };

  return (
    <FormShell
      action={action}
      values={values}
      submitLabel={submitLabel}
      successMessage={successMessage}
      onSuccess={onSuccess}
    >
      <Segmented
        name="mode"
        label="Tipo de ahorro"
        value={mode}
        onChange={setMode}
        options={MODE_OPTS}
      />
      {isDefense ? (
        <SheetSelect
          name="defenseKind"
          label="Protección"
          value={defenseKind}
          onChange={setDefenseKind}
          options={DEFENSE_FUND_OPTS}
          sheetTitle="Protección"
        />
      ) : null}
      <TextField
        name="name"
        label={isDefense ? "Nombre (opcional)" : "Nombre"}
        value={name}
        onChange={setName}
        placeholder={
          isDefense
            ? defenseKind === "defensa:fondo_paz"
              ? "Fondo de paz"
              : "Fondo de emergencia"
            : "Fondo de emergencia, viaje…"
        }
        maxLength={120}
        autoFocus
      />
      <MoneyField name="targetAmount" label="Objetivo" value={targetAmount} onChange={setTargetAmount} currency={cur} />
      <MoneyField name="monthlyContribution" label="Aporte mensual" value={monthlyContribution} onChange={setMonthly} currency={cur} />
      <DateField name="targetDate" label="Fecha límite (opcional)" value={targetDate} onChange={setTargetDate} />
      <Segmented name="priority" label="Prioridad" value={priority} onChange={setPriority} options={PRIORITY_OPTS} />
      <SheetSelect name="currency" label="Moneda" value={cur} onChange={setCur} options={CUR_OPTS} sheetTitle="Moneda" />
    </FormShell>
  );
}
