import { useState } from "react";

import {
  FormShell,
  TextField,
  MoneyField,
  SheetSelect,
  FREQ_OPTS,
  CUR_OPTS,
  type ActionResult,
  type Opt,
} from "../../components/form-kit";

/**
 * Formulario de gasto reutilizable por ALTA y EDICIÓN (mismo expenseInputSchema),
 * espejo de IncomeForm. Agnóstico de la action: recibe `action` (addExpenseAction o
 * editExpenseAction ligada a un id). FormShell maneja pending/fieldErrors/toast/refresh.
 */

export type ExpenseValues = {
  name: string;
  amount: number | undefined;
  nature: string;
  frequency: string;
  currency: string;
};

const NATURE_OPTS: Opt[] = [
  { value: "esencial", label: "Esencial" },
  { value: "estilo_vida", label: "Estilo de vida" },
  { value: "financiero", label: "Financiero" },
  { value: "proteccion", label: "Protección" },
  { value: "crecimiento", label: "Crecimiento" },
  { value: "ahorro", label: "Ahorro" },
  { value: "inversion", label: "Inversión" },
  { value: "donacion", label: "Donación" },
  { value: "miscelaneo", label: "Misceláneo" },
];

export function ExpenseForm({
  initial,
  currency,
  action,
  submitLabel,
  successMessage,
  onSuccess,
}: {
  initial?: Partial<ExpenseValues>;
  currency: string;
  action: (raw: ExpenseValues) => Promise<ActionResult>;
  submitLabel: string;
  successMessage: string;
  onSuccess: () => void;
}) {
  const [name, setName] = useState(initial?.name ?? "");
  const [amount, setAmount] = useState<number | undefined>(initial?.amount);
  const [nature, setNature] = useState(initial?.nature ?? "esencial");
  const [frequency, setFrequency] = useState(initial?.frequency ?? "mensual");
  const [cur, setCur] = useState(initial?.currency ?? currency);

  const values: ExpenseValues = { name, amount, nature, frequency, currency: cur };

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
        placeholder="Vivienda, alimentación…"
        maxLength={120}
        autoFocus
      />
      <MoneyField name="amount" label="Monto" value={amount} onChange={setAmount} currency={cur} />
      <SheetSelect name="nature" label="Naturaleza" value={nature} onChange={setNature} options={NATURE_OPTS} sheetTitle="Naturaleza del gasto" />
      <SheetSelect name="frequency" label="Frecuencia" value={frequency} onChange={setFrequency} options={FREQ_OPTS} sheetTitle="Frecuencia" />
      <SheetSelect name="currency" label="Moneda" value={cur} onChange={setCur} options={CUR_OPTS} sheetTitle="Moneda" />
    </FormShell>
  );
}
