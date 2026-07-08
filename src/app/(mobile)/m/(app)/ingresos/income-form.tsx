import { useState } from "react";

import type { IncomeType } from "@/modules/financial-base/types";
import type { CategoryNode } from "@/modules/financial-base/services/categories-service";

import {
  FormShell,
  TextField,
  MoneyField,
  DateField,
  Segmented,
  SheetSelect,
  Toggle,
  FREQ_OPTS,
  CUR_OPTS,
  type ActionResult,
  type Opt,
} from "../../components/form-kit";

/**
 * Formulario de una FUENTE de ingreso V2 (mismo modelo que la web /ingresos:
 * budget_items). Reutiliza `incomeSourceInputSchema` vía register/updateIncomeSourceAction.
 * Espejo de register-income-modal.tsx (payload idéntico): nombre · monto/moneda · fecha ·
 * tipo (activo/pasivo/extraordinario) · subcategoría (hojas del grupo del tipo, tomadas del
 * incomeTree) · recurrencia + frecuencia. Sin duplicar validación/persistencia (todo en la
 * action/schema del módulo). Nota: NO se replica el sub-flujo de stub de inversión (pasivo →
 * Alquileres/Dividendos); en móvil se registra como fuente manual normal.
 */

export type IncomeSourceValues = {
  name: string;
  amount: number | undefined;
  currency: string;
  occurredOn: string;
  incomeType: string;
  recurrent: boolean;
  frequency: string;
  categoryId: string | null;
};

const TYPE_OPTS: Opt[] = [
  { value: "activo", label: "Activo" },
  { value: "pasivo", label: "Pasivo" },
  { value: "extraordinario", label: "Extraordinario" },
];

// Tipo → key del grupo de sistema (igual que register-income-modal.tsx).
const GROUP_KEY_BY_TYPE: Record<IncomeType, string> = {
  activo: "inc_activo",
  pasivo: "inc_pasivo",
  extraordinario: "inc_extra",
};

const NO_SUBCATEGORY = "";

function todayISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** Hojas (subcategorías) del grupo del tipo elegido, tomadas del incomeTree (como la web). */
function leavesForType(incomeTree: CategoryNode[], incomeType: string): Opt[] {
  const incomeRoot = incomeTree.find((r) => r.key === "g_ingresos") ?? incomeTree[0];
  if (!incomeRoot) return [];
  const groupKey = GROUP_KEY_BY_TYPE[incomeType as IncomeType];
  const group = incomeRoot.children.find((c) => c.key === groupKey);
  if (!group) return [];
  return incomeRoot.children
    .filter((c) => c.parentId === group.id)
    .map((c) => ({ value: c.id, label: c.name }));
}

export function IncomeSourceForm({
  initial,
  currency,
  incomeTree,
  action,
  submitLabel,
  successMessage,
  onSuccess,
}: {
  initial?: IncomeSourceValues;
  currency: string;
  incomeTree: CategoryNode[];
  action: (raw: IncomeSourceValues) => Promise<ActionResult>;
  submitLabel: string;
  successMessage: string;
  onSuccess: () => void;
}) {
  const [name, setName] = useState(initial?.name ?? "");
  const [amount, setAmount] = useState<number | undefined>(initial?.amount);
  const [cur, setCur] = useState(initial?.currency ?? currency);
  const [date, setDate] = useState(initial?.occurredOn ?? todayISO());
  const [incomeType, setIncomeTypeRaw] = useState(initial?.incomeType ?? "activo");
  const [categoryId, setCategoryId] = useState(initial?.categoryId ?? NO_SUBCATEGORY);
  const [recurrent, setRecurrent] = useState(initial?.recurrent ?? false);
  const [frequency, setFrequency] = useState(initial?.frequency ?? "mensual");

  // Cambiar el tipo cambia las subcategorías disponibles → limpia la selección.
  const setIncomeType = (t: string) => {
    setIncomeTypeRaw(t);
    setCategoryId(NO_SUBCATEGORY);
  };

  const subOpts: Opt[] = [
    { value: NO_SUBCATEGORY, label: "Sin subcategoría" },
    ...leavesForType(incomeTree, incomeType),
  ];

  const values: IncomeSourceValues = {
    name,
    amount,
    currency: cur,
    occurredOn: date,
    incomeType,
    recurrent,
    frequency: recurrent ? frequency : "mensual",
    categoryId: categoryId === NO_SUBCATEGORY ? null : categoryId,
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
        placeholder="Salario, alquiler, comisión…"
        maxLength={120}
        autoFocus
      />
      <MoneyField name="amount" label="Monto" value={amount} onChange={setAmount} currency={cur} />
      <SheetSelect name="currency" label="Moneda" value={cur} onChange={setCur} options={CUR_OPTS} sheetTitle="Moneda" />
      <DateField name="occurredOn" label="Fecha" value={date} onChange={setDate} />
      <Segmented name="incomeType" label="Tipo de ingreso" value={incomeType} onChange={setIncomeType} options={TYPE_OPTS} />
      {subOpts.length > 1 ? (
        <SheetSelect
          name="categoryId"
          label="Subcategoría (opcional)"
          value={categoryId}
          onChange={setCategoryId}
          options={subOpts}
          sheetTitle="Subcategoría"
        />
      ) : null}
      <Toggle
        name="recurrent"
        label="Recurrente"
        value={recurrent}
        onChange={setRecurrent}
        hint="Se copia al traer los ingresos del mes anterior."
      />
      {recurrent ? (
        <SheetSelect name="frequency" label="Frecuencia" value={frequency} onChange={setFrequency} options={FREQ_OPTS} sheetTitle="Frecuencia" />
      ) : null}
    </FormShell>
  );
}
