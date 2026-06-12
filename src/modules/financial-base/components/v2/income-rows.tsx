"use client";

/**
 * Lista de ingresos reales del mes con el estilo `.inc-row` del diseño Claude.
 * La "confirm-pill" (Recibido / Confirmar recibido) mapea al estado de la
 * transacción: confirmed → recibido; pending_review → confirmar (markReviewed).
 * Edición/duplicado/borrado reutilizan las MISMAS server actions de V2.
 */
import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/ui/icon";
import { useToast } from "@/components/ui/toast";
import { formatMoney } from "@/lib/format";
import { QuickAddModal } from "@/modules/financial-base/components/v2/quick-add-modal";
import {
  markReviewedAction,
  removeTransactionAction,
  duplicateTransactionAction,
} from "@/modules/financial-base/api/v2-actions";
import type { Account, Transaction } from "@/modules/financial-base/types";
import type { Category } from "@/modules/financial-base/services/categories-service";

export function IncomeRows({
  transactions,
  categoryNames,
  categories,
  accounts,
  currency,
}: {
  transactions: Transaction[];
  categoryNames: Record<string, string>;
  categories: Category[];
  accounts: Account[];
  currency: string;
}) {
  const router = useRouter();
  const toast = useToast();
  const [items, setItems] = useState<Transaction[]>(transactions);
  const [editing, setEditing] = useState<Transaction | null>(null);
  const [, startTransition] = useTransition();

  useEffect(() => setItems(transactions), [transactions]);

  const run = (fn: () => Promise<{ ok: boolean }>, msg: string) =>
    startTransition(async () => {
      const res = await fn();
      if (res.ok) {
        toast(msg);
        router.refresh();
      } else toast("No se pudo completar", "error");
    });

  if (items.length === 0) {
    return (
      <div className="muted" style={{ padding: "24px", fontSize: 13 }}>
        Sin ingresos registrados este mes. Usa “Registrar ingreso” para añadir uno.
      </div>
    );
  }

  return (
    <>
      <div className="inc-list">
        {items.map((t) => (
          <Row
            key={t.id}
            t={t}
            categoryName={t.categoryId ? (categoryNames[t.categoryId] ?? "Ingreso") : "Ingreso"}
            currency={currency}
            onEdit={() => setEditing(t)}
            onConfirm={() => run(() => markReviewedAction(t.id), "Ingreso confirmado este mes")}
            onDuplicate={() => run(() => duplicateTransactionAction(t.id), "Duplicado")}
            onDelete={() => run(() => removeTransactionAction(t.id), "Eliminado")}
          />
        ))}
      </div>
      {editing ? (
        <QuickAddModal
          kind="ingreso"
          categories={categories}
          accounts={accounts}
          currency={currency}
          item={editing}
          onClose={() => setEditing(null)}
        />
      ) : null}
    </>
  );
}

function Row({
  t,
  categoryName,
  currency,
  onEdit,
  onConfirm,
  onDuplicate,
  onDelete,
}: {
  t: Transaction;
  categoryName: string;
  currency: string;
  onEdit: () => void;
  onConfirm: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
}) {
  const [open, setOpen] = useState(false);
  const received = t.status === "confirmed";

  return (
    <div className="inc-row">
      <div className="inc-ic">
        <Icon name="income" />
      </div>
      <div style={{ minWidth: 0 }}>
        <div
          className="inc-name"
          style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
        >
          {t.merchantOrSource || t.description || "Ingreso"}
        </div>
        <div className="inc-sub">
          {t.occurredOn.slice(5).replace("-", "/")}
          {t.accountLabel ? ` · ${t.accountLabel}` : ""}
        </div>
      </div>
      {/* TODO(data): el diseño usa un "Tipo de ingreso" (Salario/Bono/Pasivo…)
          como tag. Las transacciones V2 solo tienen categoría, así que el tag
          muestra la categoría. */}
      <span className="inc-tag">{categoryName}</span>
      <button
        type="button"
        className={received ? "confirm-pill done" : "confirm-pill"}
        onClick={received ? undefined : onConfirm}
        disabled={received}
        title={received ? "Ingreso recibido" : "Marcar como recibido"}
      >
        <Icon name="check" width={received ? 3 : 2.4} />
        {received ? "Recibido" : "Confirmar recibido"}
      </button>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 6,
          justifyContent: "flex-end",
          position: "relative",
        }}
      >
        <span className="inc-amt">+{formatMoney(t.amount, t.currency || currency)}</span>
        <button
          className="icon-btn"
          style={{ width: 30, height: 30 }}
          aria-label="Acciones"
          onClick={() => setOpen((o) => !o)}
        >
          <Icon name="dots" />
        </button>
        {open ? (
          <div className="txn-menu" onMouseLeave={() => setOpen(false)}>
            <button
              onClick={() => {
                setOpen(false);
                onEdit();
              }}
            >
              Editar
            </button>
            <button
              onClick={() => {
                setOpen(false);
                onDuplicate();
              }}
            >
              Duplicar
            </button>
            <button
              className="danger"
              onClick={() => {
                setOpen(false);
                onDelete();
              }}
            >
              Eliminar
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}
