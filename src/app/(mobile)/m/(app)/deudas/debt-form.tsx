import { useState } from "react";
import { useCaptureCurrency } from "@/components/layout/currency-context";

import {
  FormShell,
  TextField,
  MoneyField,
  SheetSelect,
  CUR_OPTS,
  type ActionResult,
} from "../../components/form-kit";

/**
 * Formulario de deuda reutilizable por ALTA y EDICIÓN (mismo debtInputSchema), espejo de
 * Goal/Income/ExpenseForm. Agnóstico de la action (addDebtAction / editDebtAction ligada a id).
 *
 * IMPORTANTE: `debtColumns` (control-service) mapea TODAS las columnas con `?? null`, así que
 * omitir un campo en la edición lo BORRA. Por eso arrastramos los campos avanzados no editables
 * (tasa variable, seguro, fechas, notas…) desde `initial` para que editar el saldo/cuota NO
 * resetee el resto de la deuda. Solo exponemos el núcleo gestionable en móvil.
 */

export type DebtValues = {
  name: string;
  debtType?: string;
  bank?: string;
  balance: number | undefined;
  originalAmount?: number;
  currentPayment?: number;
  minPayment?: number;
  apr?: number;
  termMonths?: number;
  currency: string;
  // Campos arrastrados (no editables aquí) — preservan la deuda al editar:
  delinquency?: string;
  stress?: number;
  rateType?: string;
  rateIndex?: string;
  rateSpread?: number;
  introFixedMonths?: number;
  introApr?: number;
  startDate?: string;
  extraMonthly?: number;
  insurance?: number;
  notes?: string;
};

export function DebtForm({
  initial,
  action,
  submitLabel,
  successMessage,
  onSuccess,
}: {
  initial?: DebtValues;
  action: (raw: DebtValues) => Promise<ActionResult>;
  submitLabel: string;
  successMessage: string;
  onSuccess: () => void;
}) {
  const [name, setName] = useState(initial?.name ?? "");
  const [debtType, setDebtType] = useState(initial?.debtType ?? "");
  const [bank, setBank] = useState(initial?.bank ?? "");
  const [balance, setBalance] = useState<number | undefined>(initial?.balance);
  const [originalAmount, setOriginal] = useState<number | undefined>(initial?.originalAmount);
  const [currentPayment, setCurrentPayment] = useState<number | undefined>(initial?.currentPayment);
  const [minPayment, setMinPayment] = useState<number | undefined>(initial?.minPayment);
  const [apr, setApr] = useState(initial?.apr != null ? String(initial.apr) : "");
  const [termMonths, setTerm] = useState(initial?.termMonths != null ? String(initial.termMonths) : "");
  // ALTA: la PRINCIPAL del contexto (importe libre); edición: la nativa del ítem. Antes
  // caía a `currency`, la de visualización del topbar — la siembra equivocada.
  const captureCurrency = useCaptureCurrency();
  const [cur, setCur] = useState(initial?.currency ?? captureCurrency);

  // Campos avanzados que NO se editan en móvil pero se preservan (ver nota arriba).
  const carried = initial
    ? {
        delinquency: initial.delinquency,
        stress: initial.stress,
        rateType: initial.rateType,
        rateIndex: initial.rateIndex,
        rateSpread: initial.rateSpread,
        introFixedMonths: initial.introFixedMonths,
        introApr: initial.introApr,
        startDate: initial.startDate,
        extraMonthly: initial.extraMonthly,
        insurance: initial.insurance,
        notes: initial.notes,
      }
    : {};

  const aprNum = apr.trim() === "" ? undefined : Number(apr);
  const termNum = termMonths.trim() === "" ? undefined : Math.round(Number(termMonths));

  const values: DebtValues = {
    ...carried,
    name,
    debtType: debtType.trim() === "" ? undefined : debtType.trim(),
    bank: bank.trim() === "" ? undefined : bank.trim(),
    balance,
    originalAmount,
    currentPayment,
    minPayment,
    apr: aprNum != null && Number.isFinite(aprNum) ? aprNum : undefined,
    termMonths: termNum != null && Number.isFinite(termNum) ? termNum : undefined,
    currency: cur,
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
        placeholder="Tarjeta Visa, préstamo del auto…"
        maxLength={120}
        autoFocus
      />
      <TextField
        name="debtType"
        label="Tipo (opcional)"
        value={debtType}
        onChange={setDebtType}
        placeholder="Tarjeta, préstamo personal, hipoteca…"
        maxLength={40}
      />
      <TextField
        name="bank"
        label="Banco / acreedor (opcional)"
        value={bank}
        onChange={setBank}
        placeholder="BAC, BCR, Nu…"
        maxLength={80}
      />
      <MoneyField name="balance" label="Saldo actual" value={balance} onChange={setBalance} currency={cur} />
      <MoneyField
        name="originalAmount"
        label="Monto original (opcional)"
        value={originalAmount}
        onChange={setOriginal}
        currency={cur}
      />
      <MoneyField
        name="currentPayment"
        label="Cuota mensual (opcional)"
        value={currentPayment}
        onChange={setCurrentPayment}
        currency={cur}
      />
      <MoneyField
        name="minPayment"
        label="Pago mínimo (opcional)"
        value={minPayment}
        onChange={setMinPayment}
        currency={cur}
      />
      <TextField name="apr" label="Tasa anual TAE % (opcional)" value={apr} onChange={setApr} placeholder="24.9" />
      <TextField
        name="termMonths"
        label="Plazo en meses (opcional)"
        value={termMonths}
        onChange={setTerm}
        placeholder="36"
      />
      <SheetSelect name="currency" label="Moneda" value={cur} onChange={setCur} options={CUR_OPTS} sheetTitle="Moneda" />
    </FormShell>
  );
}
