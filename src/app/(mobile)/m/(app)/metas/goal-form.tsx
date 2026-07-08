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
};

const PRIORITY_OPTS: Opt[] = [
  { value: "alta", label: "Alta" },
  { value: "media", label: "Media" },
  { value: "baja", label: "Baja" },
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

  const values: GoalValues = {
    name,
    targetAmount,
    currentAmount: initial?.currentAmount ?? 0, // se preserva en edición; 0 al crear
    monthlyContribution,
    currency: cur,
    targetDate: targetDate === "" ? undefined : targetDate,
    priority,
  };

  return (
    <FormShell
      action={action}
      values={values}
      submitLabel={submitLabel}
      successMessage={successMessage}
      onSuccess={onSuccess}
    >
      <TextField
        name="name"
        label="Nombre"
        value={name}
        onChange={setName}
        placeholder="Fondo de emergencia, viaje…"
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
