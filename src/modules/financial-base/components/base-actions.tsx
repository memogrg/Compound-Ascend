"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/ui/icon";
import { Modal } from "@/components/ui/modal";
import { useToast } from "@/components/ui/toast";
import { focusFirstError } from "@/lib/forms";
import {
  FREQUENCIES,
  INCOME_TYPES,
  INCOME_CATEGORIES,
  EXPENSE_NATURES,
  EXPENSE_CATEGORIES,
  CATEGORY_DEFAULT_NATURE,
} from "@/modules/financial-base/constants";
import {
  addIncomeAction,
  addExpenseAction,
  editIncomeAction,
  editExpenseAction,
} from "@/modules/financial-base/api/actions";
import { CURRENCIES } from "@/modules/personal-profile/constants";
import type { IncomeSource, ExpenseItem } from "@/modules/financial-base/types";

type Kind = "income" | "expense";
type EditItem = IncomeSource | ExpenseItem;

function currencySymbol(code: string): string {
  return { CRC: "₡", USD: "$", EUR: "€", MXN: "$", COP: "$", GBP: "£" }[code] ?? "";
}

/** Botón de alta (ingreso / gasto) que abre su propio diálogo. Reutilizable
 * en la toolbar y en los estados vacíos accionables. */
export function AddItemButton({
  kind,
  currency,
  label,
  variant = "btn-primary",
}: {
  kind: Kind;
  currency: string;
  label?: string;
  variant?: "btn-primary" | "btn-secondary";
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button className={`btn ${variant}`} onClick={() => setOpen(true)}>
        <Icon name={kind === "income" ? "income" : "expense"} width={2} />{" "}
        {label ?? (kind === "income" ? "Agregar ingreso" : "Agregar gasto")}
      </button>
      {open ? <ItemDialog kind={kind} currency={currency} onClose={() => setOpen(false)} /> : null}
    </>
  );
}

/** Toolbar de alta (ingreso / gasto). */
export function BaseActions({ currency = "CRC" }: { currency?: string }) {
  return (
    <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
      <AddItemButton kind="income" currency={currency} variant="btn-primary" />
      <AddItemButton kind="expense" currency={currency} variant="btn-secondary" />
    </div>
  );
}

/** Botón de editar para una fila. */
export function EditItemButton({
  kind,
  item,
  currency,
}: {
  kind: Kind;
  item: EditItem;
  currency: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        className="icon-btn"
        style={{ width: 30, height: 30 }}
        aria-label="Editar"
        title="Editar"
        onClick={() => setOpen(true)}
      >
        <Icon name="edit" />
      </button>
      {open ? (
        <ItemDialog kind={kind} currency={currency} item={item} onClose={() => setOpen(false)} />
      ) : null}
    </>
  );
}

function ItemDialog({
  kind,
  currency,
  item,
  onClose,
}: {
  kind: Kind;
  currency: string;
  item?: EditItem;
  onClose: () => void;
}) {
  const router = useRouter();
  const toast = useToast();
  const editing = Boolean(item);
  const title = editing
    ? kind === "income"
      ? "Editar ingreso"
      : "Editar gasto"
    : kind === "income"
      ? "Agregar ingreso"
      : "Agregar gasto";

  return (
    <Modal
      title={title}
      sub={editing ? "Ajusta los datos y guarda." : "No tiene que ser exacto; lo afinamos luego."}
      onClose={onClose}
    >
      <CaptureForm
        kind={kind}
        currency={currency}
        item={item}
        onDone={() => {
          toast(editing ? "Cambios guardados" : "Agregado");
          onClose();
          router.refresh();
        }}
      />
    </Modal>
  );
}

function CaptureForm({
  kind,
  currency,
  item,
  onDone,
}: {
  kind: Kind;
  currency: string;
  item?: EditItem;
  onDone: () => void;
}) {
  const [pending, setPending] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [message, setMessage] = useState<string | null>(null);

  const incomeItem = kind === "income" ? (item as IncomeSource | undefined) : undefined;
  const expenseItem = kind === "expense" ? (item as ExpenseItem | undefined) : undefined;

  const [cat, setCat] = useState<string>(incomeItem?.category ?? "");
  const [nature, setNature] = useState<string>(
    expenseItem?.nature ?? (kind === "income" ? "" : "esencial"),
  );

  const onCategoryChange = (v: string) => {
    setCat(v);
    if (kind === "expense" && CATEGORY_DEFAULT_NATURE[v]) setNature(CATEGORY_DEFAULT_NATURE[v]!);
  };

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    setPending(true);
    setErrors({});
    setMessage(null);
    const fd = new FormData(form);
    const amount = Number(fd.get("amount"));
    const common = {
      name: String(fd.get("name") ?? ""),
      amount: Number.isFinite(amount) ? amount : 0,
      currency: String(fd.get("currency") ?? currency),
      frequency: String(fd.get("frequency") ?? "mensual"),
      isFixed: fd.get("isFixed") === "on",
      ownerScope: "usuario" as const,
    };

    let res;
    if (kind === "income") {
      const payload = {
        ...common,
        incomeType: String(fd.get("incomeType") ?? "activo"),
        category: cat || undefined,
        includeInBudget: true,
      };
      res = incomeItem
        ? await editIncomeAction(incomeItem.id, payload)
        : await addIncomeAction(payload);
    } else {
      const payload = { ...common, nature: nature || "esencial", categoryKey: cat || undefined };
      res = expenseItem
        ? await editExpenseAction(expenseItem.id, payload)
        : await addExpenseAction(payload);
    }

    setPending(false);
    if (res.ok) onDone();
    else {
      if (res.fieldErrors) {
        setErrors(res.fieldErrors);
        focusFirstError(form, res.fieldErrors);
      }
      if (res.message) setMessage(res.message);
    }
  }

  const defAmount = item ? item.amount : undefined;
  const defFreq = item ? item.frequency : "mensual";
  const defCurrency = item ? item.currency : currency;

  return (
    <form onSubmit={onSubmit}>
      <div className="modal-body">
        {message ? (
          <div className="auth-msg warn" role="alert">
            {message}
          </div>
        ) : null}

        <div className="fld">
          <label className="fld-label">Nombre</label>
          <input
            className="inp"
            name="name"
            defaultValue={item?.name ?? ""}
            placeholder={kind === "income" ? "Salario, alquiler…" : "Alquiler, Netflix…"}
            required
            aria-invalid={errors.name ? true : undefined}
          />
          {errors.name ? (
            <span className="auth-err" role="alert">
              {errors.name}
            </span>
          ) : null}
        </div>

        <div className="fld-2">
          <div className="fld">
            <label className="fld-label">Monto</label>
            <div className="inp-money">
              <span className="pre">{currencySymbol(defCurrency)}</span>
              <input
                name="amount"
                type="number"
                step="0.01"
                min="0"
                defaultValue={defAmount}
                placeholder="0"
                required
                aria-invalid={errors.amount ? true : undefined}
              />
            </div>
            {errors.amount ? (
              <span className="auth-err" role="alert">
                {errors.amount}
              </span>
            ) : null}
          </div>
          <div className="fld">
            <label className="fld-label">Moneda</label>
            <select className="sel" name="currency" defaultValue={defCurrency}>
              {CURRENCIES.map((c) => (
                <option key={c.value} value={c.value}>
                  {c.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="fld-2">
          <div className="fld">
            <label className="fld-label">Frecuencia</label>
            <select className="sel" name="frequency" defaultValue={defFreq}>
              {FREQUENCIES.map((f) => (
                <option key={f.value} value={f.value}>
                  {f.label}
                </option>
              ))}
            </select>
          </div>
          <div className="fld">
            <label className="fld-label">Categoría</label>
            <select className="sel" value={cat} onChange={(e) => onCategoryChange(e.target.value)}>
              <option value="">Sin categoría</option>
              {(kind === "income" ? INCOME_CATEGORIES : EXPENSE_CATEGORIES).map((c) => (
                <option key={c.value} value={c.value}>
                  {c.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        {kind === "income" ? (
          <div className="fld">
            <label className="fld-label">Tipo de ingreso</label>
            <select
              className="sel"
              name="incomeType"
              defaultValue={incomeItem?.incomeType ?? "activo"}
            >
              {INCOME_TYPES.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </select>
          </div>
        ) : (
          <div className="fld">
            <label className="fld-label">Naturaleza</label>
            <select className="sel" value={nature} onChange={(e) => setNature(e.target.value)}>
              {EXPENSE_NATURES.map((n) => (
                <option key={n.value} value={n.value}>
                  {n.label}
                </option>
              ))}
            </select>
          </div>
        )}

        <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13 }}>
          <input type="checkbox" name="isFixed" defaultChecked={item ? item.isFixed : true} /> Es un
          monto fijo
        </label>
      </div>

      <div className="modal-foot">
        <button type="button" className="btn btn-ghost" onClick={onDone}>
          Cancelar
        </button>
        <button type="submit" className="btn btn-primary" disabled={pending}>
          {pending ? "Guardando…" : "Guardar"}
        </button>
      </div>
    </form>
  );
}
