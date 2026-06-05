"use client";

/**
 * Lista única cronológica de transacciones con chips de filtro y menú por fila
 * (editar, duplicar, marcar revisada, eliminar). Lo real vive en transactions.
 */
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/ui/icon";
import { useToast } from "@/components/ui/toast";
import { formatMoney } from "@/lib/format";
import { QuickAddModal } from "@/modules/financial-base/components/v2/quick-add-modal";
import {
  removeTransactionAction,
  duplicateTransactionAction,
  markReviewedAction,
} from "@/modules/financial-base/api/v2-actions";
import type { Account, Transaction } from "@/modules/financial-base/types";
import type { Category } from "@/modules/financial-base/services/categories-service";

type Chip = "todo" | "ingresos" | "gastos" | "pendiente" | "escaneado" | "recurrente";
const CHIPS: { id: Chip; label: string }[] = [
  { id: "todo", label: "Todo" },
  { id: "ingresos", label: "Ingresos" },
  { id: "gastos", label: "Gastos" },
  { id: "pendiente", label: "Pendiente" },
  { id: "escaneado", label: "Escaneado" },
  { id: "recurrente", label: "Recurrente" },
];

function matches(t: Transaction, chip: Chip): boolean {
  switch (chip) {
    case "ingresos": return t.kind === "ingreso";
    case "gastos": return t.kind === "gasto";
    case "pendiente": return t.status === "pending_review";
    case "escaneado": return t.origin === "scanned";
    case "recurrente": return t.origin === "recurring";
    default: return true;
  }
}

const STATUS_LABEL: Record<string, string> = {
  confirmed: "Confirmado",
  pending_review: "Pendiente",
};

export function TransactionList({
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
  const [chip, setChip] = useState<Chip>("todo");
  const [editing, setEditing] = useState<Transaction | null>(null);
  const visible = transactions.filter((t) => matches(t, chip));

  return (
    <>
      <div className="chip-grid" style={{ marginBottom: 14 }}>
        {CHIPS.map((c) => (
          <button
            key={c.id}
            type="button"
            className={chip === c.id ? "chip-sel on" : "chip-sel"}
            onClick={() => setChip(c.id)}
            aria-pressed={chip === c.id}
          >
            {c.label}
          </button>
        ))}
      </div>

      <div className="card">
        <div className="card-head">
          <div className="card-title">Movimientos</div>
          <div className="card-sub">{visible.length} en el periodo</div>
        </div>
        {visible.length === 0 ? (
          <div className="muted" style={{ padding: "24px", fontSize: 13 }}>
            No hay movimientos con este filtro.
          </div>
        ) : (
          visible.map((t) => (
            <Row
              key={t.id}
              t={t}
              categoryName={t.categoryId ? (categoryNames[t.categoryId] ?? "Sin categoría") : t.kind === "gasto" ? "Sin categoría" : "—"}
              onEdit={() => setEditing(t)}
            />
          ))
        )}
      </div>

      {editing ? (
        <QuickAddModal
          kind={editing.kind}
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
  onEdit,
}: {
  t: Transaction;
  categoryName: string;
  onEdit: () => void;
}) {
  const router = useRouter();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const isIncome = t.kind === "ingreso";
  const amountStr = `${isIncome ? "+" : "−"}${formatMoney(t.amount, t.currency)}`;

  const run = (fn: () => Promise<{ ok: boolean }>, msg: string) =>
    startTransition(async () => {
      const res = await fn();
      setOpen(false);
      if (res.ok) {
        toast(msg);
        router.refresh();
      } else {
        toast("No se pudo completar", "error");
      }
    });

  return (
    <div className="list-row" style={{ gridTemplateColumns: "auto 1fr auto auto", gap: 12, position: "relative" }}>
      <div style={{ fontSize: 12, color: "var(--muted)", minWidth: 44 }}>
        {t.occurredOn.slice(5).replace("-", "/")}
      </div>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 13.5, fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {t.merchantOrSource || t.description || (isIncome ? "Ingreso" : "Gasto")}
        </div>
        <div className="muted" style={{ fontSize: 11.5, marginTop: 2 }}>
          {categoryName}
          {t.accountLabel ? ` · ${t.accountLabel}` : ""}
        </div>
      </div>
      <span className="tnum" style={{ fontSize: 13.5, fontWeight: 600, color: isIncome ? "var(--pos)" : "var(--neg)" }}>
        {amountStr}
      </span>
      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <span
          className="chip"
          style={
            t.status === "pending_review"
              ? { background: "var(--warn-soft)", color: "var(--warn)", fontSize: 11 }
              : { fontSize: 11 }
          }
        >
          {STATUS_LABEL[t.status] ?? t.status}
        </span>
        <button className="icon-btn" style={{ width: 30, height: 30 }} aria-label="Acciones" onClick={() => setOpen((o) => !o)} disabled={pending}>
          <Icon name="dots" />
        </button>
        {open ? (
          <div className="txn-menu" onMouseLeave={() => setOpen(false)}>
            <button onClick={() => { setOpen(false); onEdit(); }}>Editar</button>
            <button onClick={() => run(() => duplicateTransactionAction(t.id), "Duplicada")}>Duplicar</button>
            {t.status === "pending_review" ? (
              <button onClick={() => run(() => markReviewedAction(t.id), "Marcada revisada")}>Marcar revisada</button>
            ) : null}
            <button className="danger" onClick={() => run(() => removeTransactionAction(t.id), "Eliminada")}>
              Eliminar
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}
