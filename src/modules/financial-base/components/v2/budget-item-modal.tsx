"use client";

/** Alta/edición de un ítem de presupuesto (budget_items). No toca lo real. */
import { CURRENCY_SYMBOL } from "@/lib/format";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Modal } from "@/components/ui/modal";
import { useToast } from "@/components/ui/toast";
import { addBudgetItemAction, editBudgetItemAction } from "@/modules/financial-base/api/v2-actions";
import type { BudgetItem, BudgetType, Period } from "@/modules/financial-base/types";
import type { Category } from "@/modules/financial-base/services/categories-service";
import { FREQUENCIES } from "@/modules/financial-base/constants";
import { CURRENCIES } from "@/modules/personal-profile/constants";

export function BudgetItemModal({
  type,
  period,
  categories,
  currency,
  item,
  onClose,
}: {
  type: BudgetType;
  period: Period;
  categories: Category[];
  currency: string;
  item?: BudgetItem;
  onClose: () => void;
}) {
  const router = useRouter();
  const toast = useToast();
  const editing = Boolean(item);
  const [name, setName] = useState(item?.name ?? "");
  const [amount, setAmount] = useState(item ? String(item.amount) : "");
  const [cur, setCur] = useState(item?.currency ?? currency);
  const [frequency, setFrequency] = useState<string>(item?.frequency ?? "mensual");
  const [categoryId, setCategoryId] = useState(item?.categoryId ?? "");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const amt = Number(amount);
    if (!name.trim()) return setError("Ponle un nombre.");
    if (!Number.isFinite(amt) || amt < 0) return setError("Monto inválido.");
    setPending(true);
    setError(null);
    const payload = {
      type,
      name: name.trim(),
      amount: amt,
      currency: cur,
      frequency,
      categoryId: type === "expense" ? categoryId || null : null,
      periodMonth: period.month,
      periodYear: period.year,
    };
    const res = editing
      ? await editBudgetItemAction(item!.id, payload)
      : await addBudgetItemAction(payload);
    setPending(false);
    if (res.ok) {
      toast(editing ? "Presupuesto actualizado" : "Agregado al presupuesto");
      onClose();
      router.refresh();
    } else {
      setError(res.message ?? "No pudimos guardar.");
    }
  };

  const noun = type === "income" ? "ingreso" : "gasto";
  return (
    <Modal
      title={`${editing ? "Editar" : "Agregar"} presupuesto de ${noun}`}
      sub={`Solo afecta el presupuesto de ${period.label}.`}
      onClose={onClose}
    >
      <form onSubmit={onSubmit}>
        <div className="modal-body">
          {error ? (
            <div className="auth-msg warn" role="alert">
              {error}
            </div>
          ) : null}
          <div className="fld">
            <label className="fld-label">{type === "income" ? "Fuente" : "Nombre"}</label>
            <input
              className="inp"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={type === "income" ? "Salario…" : "Alquiler…"}
              required
            />
          </div>
          <div className="fld-2">
            <div className="fld">
              <label className="fld-label">Monto mensual presupuestado</label>
              <div className="inp-money">
                <span className="pre">{CURRENCY_SYMBOL[cur] ?? ""}</span>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder="0"
                  required
                />
              </div>
            </div>
            <div className="fld">
              <label className="fld-label">Moneda</label>
              <select className="sel" value={cur} onChange={(e) => setCur(e.target.value)}>
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
              <select
                className="sel"
                value={frequency}
                onChange={(e) => setFrequency(e.target.value)}
              >
                {FREQUENCIES.map((f) => (
                  <option key={f.value} value={f.value}>
                    {f.label}
                  </option>
                ))}
              </select>
            </div>
            {type === "expense" ? (
              <div className="fld">
                <label className="fld-label">Categoría</label>
                <select
                  className="sel"
                  value={categoryId}
                  onChange={(e) => setCategoryId(e.target.value)}
                >
                  <option value="">Sin categoría</option>
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>
            ) : (
              <div />
            )}
          </div>
        </div>
        <div className="modal-foot">
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            Cancelar
          </button>
          <button type="submit" className="btn btn-primary" disabled={pending}>
            {pending ? "Guardando…" : "Guardar"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
