"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/ui/icon";
import {
  FREQUENCIES,
  INCOME_TYPES,
  INCOME_CATEGORIES,
  EXPENSE_NATURES,
  EXPENSE_CATEGORIES,
  CATEGORY_DEFAULT_NATURE,
} from "@/modules/financial-base/constants";
import { addIncomeAction, addExpenseAction } from "@/modules/financial-base/api/actions";
import { CURRENCIES } from "@/modules/personal-profile/constants";

type Kind = "income" | "expense" | null;

const FREQ_OPTS = FREQUENCIES;

export function BaseActions({ currency = "CRC" }: { currency?: string }) {
  const [open, setOpen] = useState<Kind>(null);
  const router = useRouter();
  const close = () => setOpen(null);

  return (
    <>
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
        <button className="btn btn-primary" onClick={() => setOpen("income")}>
          <Icon name="income" width={2} /> Agregar ingreso
        </button>
        <button className="btn btn-secondary" onClick={() => setOpen("expense")}>
          <Icon name="expense" width={2} /> Agregar gasto
        </button>
      </div>

      {open && (
        <div className="modal-scrim open" onClick={(e) => e.target === e.currentTarget && close()}>
          <div className="modal" role="dialog">
            <div className="modal-head">
              <div>
                <div className="modal-title">
                  {open === "income" ? "Agregar ingreso" : "Agregar gasto"}
                </div>
                <div className="modal-sub">
                  No tiene que ser exacto. Empieza con un aproximado y lo afinamos.
                </div>
              </div>
              <button className="modal-x" aria-label="Cerrar" onClick={close}>
                <Icon name="x" width={2} />
              </button>
            </div>
            {open === "income" ? (
              <CaptureForm
                kind="income"
                currency={currency}
                onDone={() => {
                  close();
                  router.refresh();
                }}
              />
            ) : (
              <CaptureForm
                kind="expense"
                currency={currency}
                onDone={() => {
                  close();
                  router.refresh();
                }}
              />
            )}
          </div>
        </div>
      )}
    </>
  );
}

function CaptureForm({
  kind,
  currency,
  onDone,
}: {
  kind: "income" | "expense";
  currency: string;
  onDone: () => void;
}) {
  const [pending, setPending] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [message, setMessage] = useState<string | null>(null);
  const [cat, setCat] = useState<string>("");
  const [nature, setNature] = useState<string>(kind === "income" ? "" : "esencial");

  const onCategoryChange = (v: string) => {
    setCat(v);
    if (kind === "expense" && CATEGORY_DEFAULT_NATURE[v]) setNature(CATEGORY_DEFAULT_NATURE[v]!);
  };

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setPending(true);
    setErrors({});
    setMessage(null);
    const fd = new FormData(e.currentTarget);
    const amount = Number(fd.get("amount"));
    const common = {
      name: String(fd.get("name") ?? ""),
      amount: Number.isFinite(amount) ? amount : 0,
      currency: String(fd.get("currency") ?? currency),
      frequency: String(fd.get("frequency") ?? "mensual"),
      isFixed: fd.get("isFixed") === "on",
      ownerScope: "usuario" as const,
    };

    const res =
      kind === "income"
        ? await addIncomeAction({
            ...common,
            incomeType: String(fd.get("incomeType") ?? "activo"),
            category: cat || undefined,
            includeInBudget: true,
          })
        : await addExpenseAction({
            ...common,
            nature: nature || "esencial",
            categoryKey: cat || undefined,
          });

    setPending(false);
    if (res.ok) {
      onDone();
    } else {
      if (res.fieldErrors) setErrors(res.fieldErrors);
      if (res.message) setMessage(res.message);
    }
  }

  return (
    <form onSubmit={onSubmit}>
      <div className="modal-body">
        {message ? <div className="auth-msg warn">{message}</div> : null}

        <div className="fld">
          <label className="fld-label">Nombre</label>
          <input
            className="inp"
            name="name"
            placeholder={kind === "income" ? "Salario, alquiler…" : "Alquiler, Netflix…"}
            required
          />
          {errors.name ? <span className="auth-err">{errors.name}</span> : null}
        </div>

        <div className="fld-2">
          <div className="fld">
            <label className="fld-label">Monto</label>
            <div className="inp-money">
              <span className="pre">{currencySymbol(currency)}</span>
              <input name="amount" type="number" step="0.01" min="0" placeholder="0" required />
            </div>
            {errors.amount ? <span className="auth-err">{errors.amount}</span> : null}
          </div>
          <div className="fld">
            <label className="fld-label">Moneda</label>
            <select className="sel" name="currency" defaultValue={currency}>
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
            <select className="sel" name="frequency" defaultValue="mensual">
              {FREQ_OPTS.map((f) => (
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
            <select className="sel" name="incomeType" defaultValue="activo">
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
          <input type="checkbox" name="isFixed" defaultChecked /> Es un monto fijo
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

function currencySymbol(code: string): string {
  return { CRC: "₡", USD: "$", EUR: "€", MXN: "$", COP: "$", GBP: "£" }[code] ?? "";
}
