import { useState } from "react";
import { useRouter } from "next/navigation";
import { useCaptureCurrency } from "@/components/layout/currency-context";

import type { Jar, JarEnvelope } from "@/modules/financial-base/engine/expense-jars";
import type { Account, Transaction } from "@/modules/financial-base/types";
import { addCategoryAction } from "@/modules/financial-base/api/v2-actions";
import { isManualEntryClassified } from "@/modules/financial-base/engine/classify";

import {
  BottomSheet,
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

/** Categoría de ingreso (hoja): id real + nombre. */
type IncomeCat = { id: string; name: string };

/**
 * Formulario de transacción (crear/editar) para /m/transacciones — espejo de
 * quick-add-modal.tsx de la web (mismo payload `txnInputSchema`), vía
 * addTransactionAction / editTransactionAction:
 *  - gasto → categoría = sobre (selector agrupado por frasco, reutilizado de /m/gastos) +
 *    comercio.
 *  - ingreso → categoría de ingreso REAL (obligatoria, con crear-al-vuelo) → categoryId +
 *    merchantOrSource = nombre de la categoría. Paridad con el composer web.
 * Solo maneja ingreso/gasto NO vinculados (las vinculadas se gestionan en su pantalla de
 * origen). No duplica validación/persistencia: todo vive en la action/schema del módulo.
 */

const KIND_OPTS: Opt[] = [
  { value: "gasto", label: "Gasto" },
  { value: "ingreso", label: "Ingreso" },
];

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
  incomeCats,
  incomeGroupId,
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
  /** Categorías de ingreso reales (obligatorias en el registro manual de ingreso). */
  incomeCats: IncomeCat[];
  /** Grupo de ingresos, para crear una categoría al vuelo. */
  incomeGroupId: string | null;
  action: (raw: TxnFormValues) => Promise<ActionResult>;
  submitLabel: string;
  successMessage: string;
  onSuccess: () => void;
  /** En edición el tipo (gasto/ingreso) no se cambia (como la web). */
  lockKind?: boolean;
}) {
  const router = useRouter();
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
  // Ingreso: categoría REAL (id) + su nombre como fuente. En edición se siembra de la transacción.
  const [incomeCatId, setIncomeCatId] = useState<string | null>(
    initial && initial.kind === "ingreso" ? (initial.categoryId ?? null) : null,
  );
  const [source, setSource] = useState(
    initial && initial.kind === "ingreso" ? (initial.merchantOrSource ?? "") : "",
  );
  const [extraIncomeCats, setExtraIncomeCats] = useState<IncomeCat[]>([]);
  const [note, setNote] = useState(initial?.description ?? "");
  const [pickerOpen, setPickerOpen] = useState(false);
  const [incomePickerOpen, setIncomePickerOpen] = useState(false);
  // Cuenta donde entró la plata (elegible en ingreso); gasto usa la predeterminada en silencio.
  const [accountId, setAccountId] = useState<string>(initial?.accountId ?? defaultAccountId ?? "");
  const accountOpts: Opt[] = accounts.map((a) => ({ value: a.id, label: a.name }));

  const isExpense = kind === "gasto";
  const allIncomeCats: IncomeCat[] = [
    ...incomeCats,
    ...extraIncomeCats.filter((e) => !incomeCats.some((c) => c.id === e.id)),
  ];

  const values: TxnFormValues = {
    kind,
    amount,
    currency: cur,
    occurredOn: date,
    categoryId: isExpense ? categoryId : incomeCatId,
    accountId: accountId || null,
    merchantOrSource: isExpense ? (merchant.trim() === "" ? undefined : merchant.trim()) : source,
    description: note.trim() === "" ? undefined : note.trim(),
    status: "confirmed",
    origin: "manual",
  };

  // Registro manual COMPLETO: gasto exige sobre, ingreso exige categoría — MISMA fn que el web
  // (isManualEntryClassified). Solo al CREAR: editar una transacción vieja (incl. sin clasificar)
  // no se traba. Este form no maneja transfer/ajuste ni vinculadas.
  const missingCategory =
    !initial && !isManualEntryClassified({ kind, categoryId, incomeCatId });
  const categoryHint = isExpense
    ? "Elegí un sobre para registrar el gasto."
    : "Elegí la categoría del ingreso.";

  // Crea una categoría de ingreso al vuelo (misma UX que el "+ Nueva" de gasto).
  async function createIncomeCat(name: string): Promise<void> {
    if (!incomeGroupId) return;
    const res = await addCategoryAction({ name, parentId: incomeGroupId, categoryType: "income" });
    if (res.ok && res.id) {
      const cat = { id: res.id, name };
      setExtraIncomeCats((prev) => [...prev, cat]);
      setIncomeCatId(cat.id);
      setSource(cat.name);
      setIncomePickerOpen(false);
      router.refresh();
    }
  }

  return (
    <FormShell
      action={action}
      values={values}
      submitLabel={submitLabel}
      successMessage={successMessage}
      onSuccess={onSuccess}
      disabled={missingCategory}
      disabledHint={categoryHint}
    >
      {lockKind ? null : (
        <Segmented name="kind" label="Tipo" value={kind} onChange={setKind} options={KIND_OPTS} />
      )}
      <MoneyField name="amount" label="Monto" value={amount} onChange={setAmount} currency={cur} />

      {isExpense ? (
        <SobreField label={sobreLabel} onOpen={() => setPickerOpen(true)} />
      ) : (
        <>
          <IncomeCatField
            label={incomeCatId ? source : ""}
            onOpen={() => setIncomePickerOpen(true)}
          />
          {accountOpts.length > 0 ? (
            <SheetSelect
              name="accountId"
              label="Cuenta"
              value={accountId}
              onChange={setAccountId}
              options={accountOpts}
              sheetTitle="Cuenta del ingreso"
            />
          ) : null}
        </>
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
      ) : (
        <IncomeCatPicker
          open={incomePickerOpen}
          cats={allIncomeCats}
          selectedId={incomeCatId}
          canCreate={!!incomeGroupId}
          onPick={(c) => {
            setIncomeCatId(c.id);
            setSource(c.name);
            setIncomePickerOpen(false);
          }}
          onCreate={createIncomeCat}
          onClose={() => setIncomePickerOpen(false)}
        />
      )}
    </FormShell>
  );
}

/** Campo "Categoría del ingreso": botón que abre el picker de categorías de ingreso. */
function IncomeCatField({ label, onOpen }: { label: string; onOpen: () => void }) {
  const error = useFormError("categoryId");
  return (
    <div className="m-qfield">
      <div className="m-qlabel">Categoría del ingreso</div>
      <button type="button" className="m-inp m-sheetselect" onClick={onOpen}>
        <span className={label ? "" : "m-sheetselect-ph"}>
          {label || "Selecciona la categoría…"}
        </span>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
          <path d="M6 9l6 6 6-6" />
        </svg>
      </button>
      {error ? <div className="m-field-err">{error}</div> : null}
    </div>
  );
}

/** Picker de categoría de INGRESO (BottomSheet), con crear-al-vuelo. Espeja SobrePicker. */
function IncomeCatPicker({
  open,
  cats,
  selectedId,
  canCreate,
  onPick,
  onCreate,
  onClose,
}: {
  open: boolean;
  cats: IncomeCat[];
  selectedId: string | null;
  canCreate: boolean;
  onPick: (c: IncomeCat) => void;
  onCreate: (name: string) => Promise<void>;
  onClose: () => void;
}) {
  const [newName, setNewName] = useState("");
  const [creating, setCreating] = useState(false);
  const submitNew = async () => {
    const n = newName.trim();
    if (!n || creating) return;
    setCreating(true);
    await onCreate(n);
    setCreating(false);
    setNewName("");
  };
  return (
    <BottomSheet open={open} onClose={onClose} title="Categoría del ingreso">
      <div className="m-optlist">
        {cats.map((c) => (
          <button
            key={c.id}
            type="button"
            className={`m-opt${selectedId === c.id ? " sel" : ""}`}
            onClick={() => onPick(c)}
          >
            <span className="m-opt-t">{c.name}</span>
          </button>
        ))}
      </div>
      {canCreate ? (
        <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
          <input
            className="m-inp"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="Nueva categoría (ej.: Salario)"
            maxLength={60}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                void submitNew();
              }
            }}
          />
          <button
            type="button"
            className="m-btn m-btn-primary"
            style={{ flex: "none" }}
            disabled={creating || !newName.trim()}
            onClick={() => void submitNew()}
          >
            {creating ? "…" : "Crear"}
          </button>
        </div>
      ) : cats.length === 0 ? (
        <div className="muted" style={{ fontSize: 13, padding: "4px 2px" }}>
          No hay categorías de ingreso configuradas.
        </div>
      ) : null}
    </BottomSheet>
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
