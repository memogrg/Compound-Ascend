import { useState } from "react";

import {
  FormShell,
  TextField,
  MoneyField,
  Segmented,
  SheetSelect,
  FREQ_OPTS,
  CUR_OPTS,
  type ActionResult,
  type Opt,
} from "../../components/form-kit";

/**
 * Formulario de ingreso reutilizable por ALTA y EDICIÓN (mismo incomeInputSchema).
 * Es agnóstico de la action: recibe `action` (addIncomeAction o editIncomeAction ligada
 * a un id). FormShell envuelve pending/fieldErrors/toast/refresh. No duplica lógica.
 */

export type IncomeValues = {
  name: string;
  amount: number | undefined;
  incomeType: string;
  frequency: string;
  currency: string;
};

const TYPE_OPTS: Opt[] = [
  { value: "activo", label: "Activo" },
  { value: "pasivo", label: "Pasivo" },
  { value: "extraordinario", label: "Extraordinario" },
];

export function IncomeForm({
  initial,
  currency,
  action,
  submitLabel,
  successMessage,
  onSuccess,
}: {
  initial?: Partial<IncomeValues>;
  currency: string;
  action: (raw: IncomeValues) => Promise<ActionResult>;
  submitLabel: string;
  successMessage: string;
  onSuccess: () => void;
}) {
  const [name, setName] = useState(initial?.name ?? "");
  const [amount, setAmount] = useState<number | undefined>(initial?.amount);
  const [incomeType, setIncomeType] = useState(initial?.incomeType ?? "activo");
  const [frequency, setFrequency] = useState(initial?.frequency ?? "mensual");
  const [cur, setCur] = useState(initial?.currency ?? currency);

  const values: IncomeValues = { name, amount, incomeType, frequency, currency: cur };

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
        placeholder="Salario, alquiler…"
        maxLength={120}
        autoFocus
      />
      <MoneyField name="amount" label="Monto" value={amount} onChange={setAmount} currency={cur} />
      <Segmented name="incomeType" label="Tipo de ingreso" value={incomeType} onChange={setIncomeType} options={TYPE_OPTS} />
      <SheetSelect name="frequency" label="Frecuencia" value={frequency} onChange={setFrequency} options={FREQ_OPTS} sheetTitle="Frecuencia" />
      <SheetSelect name="currency" label="Moneda" value={cur} onChange={setCur} options={CUR_OPTS} sheetTitle="Moneda" />
    </FormShell>
  );
}
