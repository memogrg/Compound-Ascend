"use client";

/** Tabla de presupuesto editable (income o expense) de un periodo. Solo budget_items. */
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/ui/icon";
import { useToast } from "@/components/ui/toast";
import { formatMoney } from "@/lib/format";
import { BudgetItemModal } from "@/modules/financial-base/components/v2/budget-item-modal";
import { removeBudgetItemAction } from "@/modules/financial-base/api/v2-actions";
import type { BudgetItem, BudgetType, Period } from "@/modules/financial-base/types";
import type { Category } from "@/modules/financial-base/services/categories-service";

export function EditableBudgetTable({
  type,
  title,
  items,
  categoryNames,
  categories,
  period,
  currency,
}: {
  type: BudgetType;
  title: string;
  items: BudgetItem[];
  categoryNames: Record<string, string>;
  categories: Category[];
  period: Period;
  currency: string;
}) {
  const router = useRouter();
  const toast = useToast();
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<BudgetItem | null>(null);
  const [pending, startTransition] = useTransition();

  const remove = (id: string) =>
    startTransition(async () => {
      const res = await removeBudgetItemAction(id);
      if (res.ok) {
        toast("Eliminado del presupuesto");
        router.refresh();
      } else toast("No se pudo eliminar", "error");
    });

  return (
    <div className="card">
      <div className="card-head">
        <div>
          <div className="card-title">{title}</div>
          <div className="card-sub">{items.length} ítem(s) · {period.label}</div>
        </div>
        <button className="btn btn-secondary" onClick={() => setAdding(true)} style={{ padding: "7px 12px" }}>
          <Icon name="plus" width={2} /> Agregar
        </button>
      </div>

      {items.length === 0 ? (
        <div className="muted" style={{ padding: "20px 24px", fontSize: 13 }}>
          Sin presupuesto este mes. Agrega tu primer ítem.
        </div>
      ) : (
        items.map((it) => (
          <div key={it.id} className="list-row" style={{ gridTemplateColumns: "1fr auto auto" }}>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 13.5, fontWeight: 500 }}>{it.name}</div>
              <div className="muted" style={{ fontSize: 11.5, marginTop: 2, textTransform: "capitalize" }}>
                {it.frequency}
                {it.categoryId && categoryNames[it.categoryId] ? ` · ${categoryNames[it.categoryId]}` : ""}
              </div>
            </div>
            <span className="tnum" style={{ fontSize: 13.5, fontWeight: 500 }}>
              {formatMoney(it.amount, it.currency)}
            </span>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <button className="icon-btn" style={{ width: 30, height: 30 }} aria-label="Editar" onClick={() => setEditing(it)}>
                <Icon name="edit" />
              </button>
              <button className="icon-btn" style={{ width: 30, height: 30 }} aria-label="Eliminar" onClick={() => remove(it.id)} disabled={pending}>
                <Icon name="x" width={2} />
              </button>
            </div>
          </div>
        ))
      )}

      {adding ? (
        <BudgetItemModal type={type} period={period} categories={categories} currency={currency} onClose={() => setAdding(false)} />
      ) : null}
      {editing ? (
        <BudgetItemModal type={type} period={period} categories={categories} currency={currency} item={editing} onClose={() => setEditing(null)} />
      ) : null}
    </div>
  );
}
