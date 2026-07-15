import { useState } from "react";

import type { IncomeType } from "@/modules/financial-base/types";
import type { CategoryNode } from "@/modules/financial-base/services/categories-service";
import { registerPassiveIncomeWithStubAction } from "@/modules/financial-base/api/v2-actions";

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
 * incomeTree) · recurrencia + frecuencia.
 *
 * Sub-flujo de INGRESO PASIVO CON ACTIVO (solo en alta, allowPassiveStub): cuando el tipo es
 * "pasivo", un Toggle permite marcar que proviene de un activo (renta/dividendos). Si se activa,
 * el guardado usa registerPassiveIncomeWithStubAction (crea también el stub de inversión) en vez
 * de la action normal — mismo camino que la web, expuesto aquí de forma explícita.
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

const SUBTYPE_OPTS: Opt[] = [
  { value: "renta", label: "Renta" },
  { value: "dividendos", label: "Dividendos" },
];

export function IncomeSourceForm({
  initial,
  currency,
  incomeTree,
  action,
  submitLabel,
  successMessage,
  onSuccess,
  allowPassiveStub = false,
}: {
  initial?: IncomeSourceValues;
  currency: string;
  incomeTree: CategoryNode[];
  action: (raw: IncomeSourceValues) => Promise<ActionResult>;
  submitLabel: string;
  successMessage: string;
  onSuccess: () => void;
  /** Habilita el sub-flujo "de un activo" (solo en alta). */
  allowPassiveStub?: boolean;
}) {
  const [name, setName] = useState(initial?.name ?? "");
  const [amount, setAmount] = useState<number | undefined>(initial?.amount);
  const [cur, setCur] = useState(initial?.currency ?? currency);
  const [date, setDate] = useState(initial?.occurredOn ?? todayISO());
  const [incomeType, setIncomeTypeRaw] = useState(initial?.incomeType ?? "activo");
  const [categoryId, setCategoryId] = useState(initial?.categoryId ?? NO_SUBCATEGORY);
  const [recurrent, setRecurrent] = useState(initial?.recurrent ?? false);
  const [frequency, setFrequency] = useState(initial?.frequency ?? "mensual");

  // Sub-flujo de ingreso pasivo con activo (renta/dividendos → crea stub de inversión).
  const [fromAsset, setFromAsset] = useState(false);
  const [subtype, setSubtype] = useState("renta");
  const [assetName, setAssetName] = useState("");
  const [baseValue, setBaseValue] = useState<number | undefined>(undefined);

  // Cambiar el tipo cambia las subcategorías disponibles → limpia la selección.
  const setIncomeType = (t: string) => {
    setIncomeTypeRaw(t);
    setCategoryId(NO_SUBCATEGORY);
    if (t !== "pasivo") setFromAsset(false); // el stub solo aplica a pasivo
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

  const stubActive = allowPassiveStub && incomeType === "pasivo" && fromAsset;
  const isRental = subtype === "renta";

  /**
   * Guardado: si el sub-flujo de activo está activo, valida en cliente (el schema anida
   * income.* y no mapearía a los campos) y usa registerPassiveIncomeWithStubAction; si no,
   * el flujo normal (register/update) sin cambios.
   */
  const submit = (v: IncomeSourceValues): Promise<ActionResult> => {
    if (!stubActive) return action(v);
    if (!assetName.trim()) {
      return Promise.resolve({ ok: false, fieldErrors: { assetName: "Ponle un nombre al activo" } });
    }
    if (baseValue === undefined || baseValue < 0) {
      return Promise.resolve({ ok: false, fieldErrors: { baseValue: "Indica el valor del activo" } });
    }
    return registerPassiveIncomeWithStubAction({
      income: v,
      subtype: isRental ? "renta" : "dividendos",
      assetName: assetName.trim(),
      baseValue,
    });
  };

  return (
    <FormShell
      action={submit}
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

      {allowPassiveStub && incomeType === "pasivo" ? (
        <Toggle
          name="fromAsset"
          label="¿Es renta o dividendos de un activo?"
          value={fromAsset}
          onChange={setFromAsset}
          hint="Crearemos también el activo en Inversiones/Patrimonio para darle seguimiento."
        />
      ) : null}

      {stubActive ? (
        <>
          <Segmented name="subtype" label="Tipo de activo" value={subtype} onChange={setSubtype} options={SUBTYPE_OPTS} />
          <TextField
            name="assetName"
            label={isRental ? "Nombre del bien" : "Ticker o nombre"}
            value={assetName}
            onChange={setAssetName}
            placeholder={isRental ? "Apartamento centro…" : "AAPL, VOO…"}
            maxLength={120}
          />
          <MoneyField
            name="baseValue"
            label={isRental ? "Valor del inmueble" : "Monto invertido"}
            value={baseValue}
            onChange={setBaseValue}
            currency={cur}
          />
        </>
      ) : null}
    </FormShell>
  );
}
