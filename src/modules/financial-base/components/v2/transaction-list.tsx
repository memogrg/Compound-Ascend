"use client";

/**
 * Lista única cronológica con chips, menú por fila, swipe móvil y undo.
 * - Swipe derecha = editar; swipe izquierda = eliminar (con "Deshacer").
 * - El borrado es diferido: se quita al instante y se confirma a los ~5 s;
 *   "Deshacer" lo cancela y restaura la fila. Lo real vive en transactions.
 */
import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/ui/icon";
import { useToast } from "@/components/ui/toast";
import { formatMoney } from "@/lib/format";
import { QuickAddModal } from "@/modules/financial-base/components/v2/quick-add-modal";
import {
  removeTransactionAction,
  duplicateTransactionAction,
  markReviewedAction,
  getReceiptUrlAction,
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

const STATUS_LABEL: Record<string, string> = { confirmed: "Confirmado", pending_review: "Pendiente" };

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
  const router = useRouter();
  const toast = useToast();
  const [chip, setChip] = useState<Chip>("todo");
  const [items, setItems] = useState<Transaction[]>(transactions);
  const [editing, setEditing] = useState<Transaction | null>(null);
  const [, startTransition] = useTransition();
  const timers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  // Re-sincroniza con el servidor tras refresh.
  useEffect(() => setItems(transactions), [transactions]);

  const commitDelete = (id: string) => {
    timers.current.delete(id);
    startTransition(async () => {
      const res = await removeTransactionAction(id);
      if (res.ok) router.refresh();
    });
  };

  const requestDelete = (t: Transaction) => {
    setItems((list) => list.filter((x) => x.id !== t.id));
    const timer = setTimeout(() => commitDelete(t.id), 5000);
    timers.current.set(t.id, timer);
    toast("Eliminada", "info", {
      label: "Deshacer",
      onClick: () => {
        const tm = timers.current.get(t.id);
        if (tm) clearTimeout(tm);
        timers.current.delete(t.id);
        setItems((list) => [t, ...list].sort((a, b) => (a.occurredOn < b.occurredOn ? 1 : -1)));
      },
    });
  };

  const runAction = (fn: () => Promise<{ ok: boolean }>, msg: string) =>
    startTransition(async () => {
      const res = await fn();
      if (res.ok) {
        toast(msg);
        router.refresh();
      } else toast("No se pudo completar", "error");
    });

  const visible = items.filter((t) => matches(t, chip));

  return (
    <>
      <div className="chip-grid" style={{ marginBottom: 14 }}>
        {CHIPS.map((c) => (
          <button key={c.id} type="button" className={chip === c.id ? "chip-sel on" : "chip-sel"} onClick={() => setChip(c.id)} aria-pressed={chip === c.id}>
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
          <div className="muted" style={{ padding: "24px", fontSize: 13 }}>No hay movimientos con este filtro.</div>
        ) : (
          visible.map((t) => (
            <Row
              key={t.id}
              t={t}
              categoryName={t.categoryId ? (categoryNames[t.categoryId] ?? "Sin categoría") : t.kind === "gasto" ? "Sin categoría" : "—"}
              onEdit={() => setEditing(t)}
              onDelete={() => requestDelete(t)}
              onDuplicate={() => runAction(() => duplicateTransactionAction(t.id), "Duplicada")}
              onMarkReviewed={() => runAction(() => markReviewedAction(t.id), "Marcada revisada")}
            />
          ))
        )}
      </div>

      {editing ? (
        <QuickAddModal kind={editing.kind} categories={categories} accounts={accounts} currency={currency} item={editing} onClose={() => setEditing(null)} />
      ) : null}
    </>
  );
}

function Row({
  t,
  categoryName,
  onEdit,
  onDelete,
  onDuplicate,
  onMarkReviewed,
}: {
  t: Transaction;
  categoryName: string;
  onEdit: () => void;
  onDelete: () => void;
  onDuplicate: () => void;
  onMarkReviewed: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [dx, setDx] = useState(0);
  const startX = useRef<number | null>(null);
  const isIncome = t.kind === "ingreso";
  const isTransfer = t.kind === "transferencia";
  const amountColor = isTransfer ? "var(--ink-2)" : isIncome ? "var(--pos)" : "var(--neg)";
  const amountStr = `${isTransfer ? "" : isIncome ? "+" : "−"}${formatMoney(t.amount, t.currency)}`;

  const viewReceipt = async () => {
    setOpen(false);
    const res = await getReceiptUrlAction(t.receiptUrl ?? "");
    if (res.ok && res.url) window.open(res.url, "_blank", "noopener,noreferrer");
  };

  const onPointerDown = (e: React.PointerEvent) => {
    if (e.pointerType !== "touch") return; // swipe solo táctil; desktop usa el menú
    startX.current = e.clientX;
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (startX.current === null) return;
    setDx(Math.max(-120, Math.min(120, e.clientX - startX.current)));
  };
  const onPointerUp = () => {
    if (startX.current === null) return;
    if (dx > 60) onEdit();
    else if (dx < -60) onDelete();
    startX.current = null;
    setDx(0);
  };

  return (
    <div className="swipe-row">
      <div className="swipe-hint" aria-hidden>
        <span className="edit">Editar</span>
        <span className="del">Eliminar</span>
      </div>
      <div
        className="swipe-content list-row"
        style={{ gridTemplateColumns: "auto 1fr auto auto", gap: 12, transform: `translateX(${dx}px)` }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={() => { startX.current = null; setDx(0); }}
      >
        <div style={{ fontSize: 12, color: "var(--muted)", minWidth: 44 }}>{t.occurredOn.slice(5).replace("-", "/")}</div>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 13.5, fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {t.merchantOrSource || t.description || (isIncome ? "Ingreso" : "Gasto")}
          </div>
          <div className="muted" style={{ fontSize: 11.5, marginTop: 2 }}>
            {categoryName}{t.accountLabel ? ` · ${t.accountLabel}` : ""}
          </div>
        </div>
        <span className="tnum" style={{ fontSize: 13.5, fontWeight: 600, color: amountColor }}>{amountStr}</span>
        <div style={{ display: "flex", alignItems: "center", gap: 6, position: "relative" }}>
          <span className="chip" style={t.status === "pending_review" ? { background: "var(--warn-soft)", color: "var(--warn)", fontSize: 11 } : { fontSize: 11 }}>
            {STATUS_LABEL[t.status] ?? t.status}
          </span>
          <button className="icon-btn" style={{ width: 30, height: 30 }} aria-label="Acciones" onClick={() => setOpen((o) => !o)}>
            <Icon name="dots" />
          </button>
          {open ? (
            <div className="txn-menu" onMouseLeave={() => setOpen(false)}>
              <button onClick={() => { setOpen(false); onEdit(); }}>Editar</button>
              <button onClick={() => { setOpen(false); onDuplicate(); }}>Duplicar</button>
              {t.receiptUrl ? <button onClick={viewReceipt}>Ver recibo</button> : null}
              {t.status === "pending_review" ? (
                <button onClick={() => { setOpen(false); onMarkReviewed(); }}>Marcar revisada</button>
              ) : null}
              <button className="danger" onClick={() => { setOpen(false); onDelete(); }}>Eliminar</button>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
