import { useState } from "react";
import { useCaptureCurrency } from "@/components/layout/currency-context";

import type { Jar, JarEnvelope } from "@/modules/financial-base/engine/expense-jars";
import type { Account, Transaction } from "@/modules/financial-base/types";

import {
  FormShell,
  MoneyField,
  DateField,
  TextField,
  SheetSelect,
  Segmented,
  CUR_OPTS,
  useFormError,
  type ActionResult,
  type Opt,
} from "../../components/form-kit";
import { SobrePicker, normalJarsWithEnvelopes } from "../gastos/gastos-forms";

/**
 * Formulario de transacción (crear/editar) para /m/transacciones — espejo de
 * quick-add-modal.tsx de la web (mismo payload `txnInputSchema`), vía
 * addTransactionAction / editTransactionAction:
 *  - gasto → categoría = sobre (selector agrupado por frasco, reutilizado de /m/gastos) +
 *    comercio.
 *  - ingreso → fuente (lista fija de la web) → merchantOrSource; sin categoría.
 * Solo maneja ingreso/gasto NO vinculados (las vinculadas se gestionan en su pantalla de
 * origen). No duplica validación/persistencia: todo vive en la action/schema del módulo.
 */

const KIND_OPTS: Opt[] = [
  { value: "gasto", label: "Gasto" },
  { value: "ingreso", label: "Ingreso" },
];

// Fuentes de ingreso (idénticas a la web quick-add-modal): mapean a merchant_or_source.
const INCOME_SOURCES: Opt[] = ["Salario", "Comisión", "Venta", "Reembolso", "Ingreso pasivo", "Extraordinario"].map(
  (s) => ({ value: s, label: s }),
);

function todayISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export type TxnFormValues = {
  kind: string;
  amount: number | undefined;
  currency: string;
  occurredOn: string;
  categoryId: string | null;
  accountId: string | null;
  merchantOrSource: string | undefined;
  description: string | undefined;
  status: "confirmed";
  origin: "manual";
};

export function TxnForm({
  initial,
  jars,
  currency,
  accounts,
  action,
  submitLabel,
  successMessage,
  onSuccess,
  lockKind,
}: {
  initial?: Transaction;
  jars: Jar[];
  currency: string;
  accounts: Account[];
  action: (raw: TxnFormValues) => Promise<ActionResult>;
  submitLabel: string;
  successMessage: string;
  onSuccess: () => void;
  /** En edición el tipo (gasto/ingreso) no se cambia (como la web). */
  lockKind?: boolean;
}) {
  const normalJars = normalJarsWithEnvelopes(jars);
  const defaultAccountId = accounts.find((a) => a.isDefault)?.id ?? accounts[0]?.id ?? null;
  const envById = (id: string | null | undefined) =>
    id ? normalJars.flatMap((j) => j.envelopes).find((e) => e.id === id) : undefined;

  const [kind, setKind] = useState<string>(initial?.kind ?? "gasto");
  const [amount, setAmount] = useState<number | undefined>(initial?.amount);
  // En ALTA, la PRINCIPAL del contexto (importe libre); en edición, la nativa del ítem.
  // Antes caía a `currency` (la de visualización del topbar), que es justo lo que sembraba
  // la moneda equivocada.
  const captureCurrency = useCaptureCurrency();
  const [cur, setCur] = useState(initial?.currency ?? captureCurrency);
  const [date, setDate] = useState(initial?.occurredOn ?? todayISO());
  const [categoryId, setCategoryId] = useState<string | null>(initial?.categoryId ?? null);
  const [sobreLabel, setSobreLabel] = useState<string>(envById(initial?.categoryId)?.name ?? "");
  const [merchant, setMerchant] = useState(initial && initial.kind === "gasto" ? (initial.merchantOrSource ?? "") : "");
  const [source, setSource] = useState(
    initial && initial.kind === "ingreso" ? (initial.merchantOrSource ?? "Salario") : "Salario",
  );
  const [note, setNote] = useState(initial?.description ?? "");
  const [pickerOpen, setPickerOpen] = useState(false);

  const isExpense = kind === "gasto";

  const values: TxnFormValues = {
    kind,
    amount,
    currency: cur,
    occurredOn: date,
    categoryId: isExpense ? categoryId : null,
    accountId: defaultAccountId,
    merchantOrSource: isExpense ? (merchant.trim() === "" ? undefined : merchant.trim()) : source,
    description: note.trim() === "" ? undefined : note.trim(),
    status: "confirmed",
    origin: "manual",
  };

  return (
    <FormShell
      action={action}
      values={values}
      submitLabel={submitLabel}
      successMessage={successMessage}
      onSuccess={onSuccess}
    >
      {lockKind ? null : (
        <Segmented name="kind" label="Tipo" value={kind} onChange={setKind} options={KIND_OPTS} />
      )}
      <MoneyField name="amount" label="Monto" value={amount} onChange={setAmount} currency={cur} />

      {isExpense ? (
        <SobreField label={sobreLabel} onOpen={() => setPickerOpen(true)} />
      ) : (
        <SheetSelect name="merchantOrSource" label="Fuente" value={source} onChange={setSource} options={INCOME_SOURCES} sheetTitle="Fuente del ingreso" />
      )}

      {isExpense ? (
        <TextField
          name="merchantOrSource"
          label="Comercio (opcional)"
          value={merchant}
          onChange={setMerchant}
          placeholder="Súper, gasolina…"
          maxLength={160}
        />
      ) : null}

      <DateField name="occurredOn" label="Fecha" value={date} onChange={setDate} />
      <TextField name="description" label="Nota (opcional)" value={note} onChange={setNote} placeholder="Detalle…" maxLength={280} />
      <SheetSelect name="currency" label="Moneda" value={cur} onChange={setCur} options={CUR_OPTS} sheetTitle="Moneda" />

      {isExpense ? (
        <SobrePicker
          open={pickerOpen}
          jars={normalJars}
          currency={currency}
          selectedId={categoryId}
          onPick={(env: JarEnvelope) => {
            setCategoryId(env.id);
            setSobreLabel(env.name);
            setPickerOpen(false);
          }}
          onClose={() => setPickerOpen(false)}
        />
      ) : null}
    </FormShell>
  );
}

/** Campo "Categoría (sobre)": botón tipo SheetSelect que abre el picker agrupado. */
function SobreField({ label, onOpen }: { label: string; onOpen: () => void }) {
  const error = useFormError("categoryId");
  return (
    <div className="m-qfield">
      <div className="m-qlabel">Categoría</div>
      <button type="button" className="m-inp m-sheetselect" onClick={onOpen}>
        <span className={label ? "" : "m-sheetselect-ph"}>{label || "Selecciona un sobre…"}</span>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
          <path d="M6 9l6 6 6-6" />
        </svg>
      </button>
      {error ? <div className="m-field-err">{error}</div> : null}
    </div>
  );
}
