import { useState } from "react";

import {
  addTransactionAction,
  addCategoryAction,
  addBudgetItemAction,
  setEnvelopeBudgetAction,
} from "@/modules/financial-base/api/v2-actions";
import type { Jar, JarEnvelope } from "@/modules/financial-base/engine/expense-jars";
import type { Account, Period } from "@/modules/financial-base/types";
import { formatMoney } from "@/lib/format";

import {
  BottomSheet,
  FormShell,
  TextField,
  MoneyField,
  DateField,
  SheetSelect,
  Toggle,
  CUR_OPTS,
  useFormError,
  type ActionResult,
} from "../../components/form-kit";

/**
 * Formularios V2 de la pantalla Gastos (frascos + sobres), reutilizando EXACTAMENTE las
 * mismas Server Actions que la web /gastos (expense-jars/*):
 *  - AddSpendForm    → addTransactionAction (kind='gasto'; categoryId = sobre). Selector de
 *                      sobre agrupado por frasco (como add-spend-modal.tsx).
 *  - CreateSobreForm → addCategoryAction (parentId=frasco, isFavorite) + addBudgetItemAction
 *                      para el presupuesto del sobre (como new-sobre-modal / jar-normal-modal).
 *  - BudgetEditForm  → setEnvelopeBudgetAction, con el gate de 3 checks de la web
 *                      (budget-warning-modal) y el aviso de líneas derivadas (res.message).
 * No duplica validación/persistencia: todo vive en las actions/schemas del módulo.
 */

type NormalJar = Extract<Jar, { kind: "normal" }>;

function todayISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** Solo frascos normales con sobres — los que admiten un gasto directo por categoría. */
export function normalJarsWithEnvelopes(jars: Jar[]): NormalJar[] {
  return jars.filter((j): j is NormalJar => j.kind === "normal" && j.envelopes.length > 0);
}

// ── Registrar gasto ────────────────────────────────────────────────────────
type SpendValues = {
  kind: "gasto";
  amount: number | undefined;
  currency: string;
  occurredOn: string;
  categoryId: string | null;
  accountId: string | null;
  merchantOrSource: string | undefined;
};

export function AddSpendForm({
  jars,
  currency,
  accounts,
  presetCategoryId,
  onSuccess,
}: {
  jars: Jar[];
  currency: string;
  accounts: Account[];
  /** Sobre preseleccionado (cuando se abre desde un frasco). */
  presetCategoryId?: string;
  onSuccess: () => void;
}) {
  const normalJars = normalJarsWithEnvelopes(jars);
  const defaultAccountId = accounts.find((a) => a.isDefault)?.id ?? accounts[0]?.id ?? null;

  const preset = presetCategoryId
    ? normalJars.flatMap((j) => j.envelopes).find((e) => e.id === presetCategoryId)
    : undefined;

  const [categoryId, setCategoryId] = useState<string | null>(preset?.id ?? null);
  const [sobreLabel, setSobreLabel] = useState<string>(preset?.name ?? "");
  const [amount, setAmount] = useState<number | undefined>(undefined);
  const [cur, setCur] = useState(currency);
  const [date, setDate] = useState(todayISO());
  const [merchant, setMerchant] = useState("");
  const [pickerOpen, setPickerOpen] = useState(false);

  const values: SpendValues = {
    kind: "gasto",
    amount,
    currency: cur,
    occurredOn: date,
    categoryId,
    accountId: defaultAccountId,
    merchantOrSource: merchant.trim() === "" ? undefined : merchant.trim(),
  };

  return (
    <FormShell
      action={addTransactionAction}
      values={values}
      submitLabel="Registrar gasto"
      successMessage="Gasto registrado"
      onSuccess={onSuccess}
    >
      <MoneyField name="amount" label="Monto" value={amount} onChange={setAmount} currency={cur} />
      <SobreField
        label={sobreLabel}
        onOpen={() => setPickerOpen(true)}
      />
      <TextField
        name="merchantOrSource"
        label="Comercio / descripción (opcional)"
        value={merchant}
        onChange={setMerchant}
        placeholder="Súper, gasolina…"
        maxLength={160}
      />
      <DateField name="occurredOn" label="Fecha" value={date} onChange={setDate} />
      <SheetSelect name="currency" label="Moneda" value={cur} onChange={setCur} options={CUR_OPTS} sheetTitle="Moneda" />

      {/* Selector de sobre agrupado por frasco (como add-spend-modal.tsx) */}
      <SobrePicker
        open={pickerOpen}
        jars={normalJars}
        currency={currency}
        selectedId={categoryId}
        onPick={(env) => {
          setCategoryId(env.id);
          setSobreLabel(env.name);
          setPickerOpen(false);
        }}
        onClose={() => setPickerOpen(false)}
      />
    </FormShell>
  );
}

/** Campo "Sobre": botón tipo SheetSelect que abre el picker agrupado. Muestra error de Zod. */
function SobreField({ label, onOpen }: { label: string; onOpen: () => void }) {
  const error = useFormError("categoryId");
  return (
    <div className="m-qfield">
      <div className="m-qlabel">Sobre</div>
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

/** Picker de sobre agrupado por frasco (BottomSheet anidado). Reutilizado también por
 *  el registro de transacciones (/m/transacciones). */
export function SobrePicker({
  open,
  jars,
  currency,
  selectedId,
  onPick,
  onClose,
}: {
  open: boolean;
  jars: NormalJar[];
  currency: string;
  selectedId: string | null;
  onPick: (env: JarEnvelope) => void;
  onClose: () => void;
}) {
  return (
    <BottomSheet open={open} onClose={onClose} title="Elige un sobre">
      {jars.length === 0 ? (
        <div className="muted" style={{ fontSize: 13, lineHeight: 1.5, padding: "4px 2px 8px" }}>
          Aún no tienes sobres. Crea uno dentro de un frasco primero.
        </div>
      ) : (
        <div style={{ display: "grid", gap: 14 }}>
          {jars.map((jar) => (
            <div key={jar.group}>
              <div className="ov" style={{ marginBottom: 6 }}>
                {jar.name}
              </div>
              <div className="m-optlist">
                {jar.envelopes.map((e) => (
                  <button
                    key={e.id}
                    type="button"
                    className={`m-opt${selectedId === e.id ? " sel" : ""}`}
                    onClick={() => onPick(e)}
                  >
                    <span className="m-opt-t">{e.name}</span>
                    <span className="muted mono" style={{ fontSize: 12 }}>
                      {formatMoney(e.spent, currency)} / {formatMoney(e.budget, currency)}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </BottomSheet>
  );
}

// ── Crear sobre (categoría hoja + presupuesto) ─────────────────────────────
export function CreateSobreForm({
  jarGroup,
  currency,
  period,
  onSuccess,
}: {
  jarGroup: string;
  currency: string;
  period: Period;
  onSuccess: () => void;
}) {
  const [name, setName] = useState("");
  const [amount, setAmount] = useState<number | undefined>(undefined);
  const [cur, setCur] = useState(currency);

  // Igual que la web: crea la categoría (sobre favorito) y, si hay monto, su línea
  // de presupuesto del mes. Dos actions encadenadas envueltas como una sola.
  const action = async (v: { name: string; amount: number | undefined; currency: string }): Promise<ActionResult> => {
    const cat = await addCategoryAction({
      name: v.name,
      parentId: jarGroup,
      categoryType: "expense",
      isFavorite: true,
    });
    if (!cat.ok || !cat.id) {
      return { ok: false, message: cat.message, fieldErrors: cat.fieldErrors };
    }
    if (v.amount != null && v.amount > 0) {
      const b = await addBudgetItemAction({
        type: "expense",
        categoryId: cat.id,
        name: v.name,
        amount: v.amount,
        currency: v.currency,
        periodMonth: period.month,
        periodYear: period.year,
      });
      if (!b.ok) return { ok: false, message: b.message ?? "Se creó el sobre, pero no su presupuesto." };
    }
    return { ok: true };
  };

  return (
    <FormShell
      action={action}
      values={{ name: name.trim(), amount, currency: cur }}
      submitLabel="Crear sobre"
      successMessage="Sobre creado"
      onSuccess={onSuccess}
    >
      <TextField
        name="name"
        label="Nombre del sobre"
        value={name}
        onChange={setName}
        placeholder="Renta, súper, gasolina…"
        maxLength={60}
        autoFocus
      />
      <MoneyField name="amount" label="Presupuesto del mes (opcional)" value={amount} onChange={setAmount} currency={cur} />
      <SheetSelect name="currency" label="Moneda" value={cur} onChange={setCur} options={CUR_OPTS} sheetTitle="Moneda" />
    </FormShell>
  );
}

// ── Editar presupuesto de un sobre (gate de 3 checks + líneas derivadas) ────
const CHECKS = [
  "Entiendo que este presupuesto debió configurarse antes de iniciar el período.",
  "Entiendo que modificarlo afectará la precisión de mis métricas y análisis.",
  "Entiendo que solo debo usar esto cuando haya un cambio real en mis circunstancias.",
];

export function BudgetEditForm({
  envelope,
  currency,
  period,
  onSuccess,
}: {
  envelope: JarEnvelope;
  currency: string;
  period: Period;
  onSuccess: () => void;
}) {
  const [checks, setChecks] = useState<[boolean, boolean, boolean]>([false, false, false]);
  const [amount, setAmount] = useState<number | undefined>(envelope.budget || undefined);
  const allChecked = checks[0] && checks[1] && checks[2];

  const setCheck = (i: number, v: boolean) =>
    setChecks((prev) => {
      const next = [...prev] as [boolean, boolean, boolean];
      next[i] = v;
      return next;
    });

  const values = {
    categoryId: envelope.id,
    name: envelope.name,
    amount,
    currency,
    periodMonth: period.month,
    periodYear: period.year,
  };

  return (
    <>
      <div className="muted" style={{ fontSize: 12.5, lineHeight: 1.5, marginBottom: 12 }}>
        El presupuesto debería fijarse antes de que arranque el mes. Confirma que entiendes
        esto para poder ajustarlo a mitad de período.
      </div>
      <div style={{ display: "grid", gap: 4, marginBottom: 8 }}>
        {CHECKS.map((c, i) => (
          <Toggle key={i} name={`check${i}`} label={c} value={checks[i]!} onChange={(v) => setCheck(i, v)} />
        ))}
      </div>

      {allChecked ? (
        <FormShell
          action={setEnvelopeBudgetAction}
          values={values}
          submitLabel="Guardar presupuesto"
          successMessage="Presupuesto actualizado"
          onSuccess={onSuccess}
        >
          <MoneyField
            name="amount"
            label={`Nuevo presupuesto · ${envelope.name}`}
            value={amount}
            onChange={setAmount}
            currency={currency}
          />
        </FormShell>
      ) : (
        <div className="muted" style={{ fontSize: 12, marginTop: 6 }}>
          Marca las 3 casillas para habilitar la edición.
        </div>
      )}
    </>
  );
}
