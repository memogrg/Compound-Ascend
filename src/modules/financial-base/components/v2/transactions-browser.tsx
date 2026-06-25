"use client";

/**
 * Navegador de transacciones con el estilo del diseño Claude (Budget.html,
 * panel `transactions`): barra de búsqueda + chips de filtro + lista `.list-row`
 * (env-ic · nombre · tag · monto/fecha) con menú por fila.
 *
 * Solo presentación + filtrado en cliente. Todas las mutaciones reutilizan las
 * MISMAS server actions de V2 (editar/duplicar/eliminar/marcar revisada).
 */
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Icon } from "@/components/ui/icon";
import { useToast } from "@/components/ui/toast";
import { formatMoney } from "@/lib/format";
import { QuickAddModal } from "@/modules/financial-base/components/v2/quick-add-modal";
import {
  removeTransactionAction,
  duplicateTransactionAction,
  markReviewedAction,
} from "@/modules/financial-base/api/v2-actions";
import { TRANSACTIONS_LIST_CAP } from "@/modules/financial-base/constants";
import type { Account, Transaction } from "@/modules/financial-base/types";
import type { Category } from "@/modules/financial-base/services/categories-service";

type Filter = { id: string; label: string };

function relativeDate(iso: string): string {
  const today = new Date();
  const d = new Date(`${iso}T00:00:00`);
  const dayMs = 86_400_000;
  const diff = Math.round((startOfDay(today) - startOfDay(d)) / dayMs);
  if (diff === 0) return "Hoy";
  if (diff === 1) return "Ayer";
  if (diff > 1 && diff < 7) return ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"][d.getDay()]!;
  return iso.slice(5).replace("-", "/");
}
function startOfDay(d: Date): number {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

export function TransactionsBrowser({
  transactions,
  categoryNames,
  categories,
  accounts,
  currency,
  period,
}: {
  transactions: Transaction[];
  categoryNames: Record<string, string>;
  categories: Category[];
  accounts: Account[];
  currency: string;
  period: string;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const toast = useToast();
  // Deep-link "ver movimientos ›" desde un sobre → filtra por esa categoría.
  const catParam = searchParams.get("cat");
  // Si el período alcanzó el tope, la búsqueda local opera sobre los más recientes.
  const capped = transactions.length >= TRANSACTIONS_LIST_CAP;
  const [items, setItems] = useState<Transaction[]>(transactions);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState(catParam ? `cat:${catParam}` : "all");
  const [editing, setEditing] = useState<Transaction | null>(null);
  const [, startTransition] = useTransition();
  const timers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => setItems(transactions), [transactions]);

  // Atajo "/" para enfocar la búsqueda (igual que el diseño).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName ?? "";
      if (e.key === "/" && !/input|select|textarea/i.test(tag)) {
        e.preventDefault();
        searchRef.current?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Chips dinámicos: tipos + categorías de gasto más usadas.
  const filters = useMemo<Filter[]>(() => {
    const base: Filter[] = [
      { id: "all", label: "Todas" },
      { id: "income", label: "Ingresos" },
      { id: "spending", label: "Gastos" },
    ];
    const counts = new Map<string, { label: string; n: number }>();
    for (const t of items) {
      if (t.kind !== "gasto" || !t.categoryId) continue;
      const label = categoryNames[t.categoryId] ?? "Sin categoría";
      const cur = counts.get(t.categoryId) ?? { label, n: 0 };
      cur.n += 1;
      counts.set(t.categoryId, cur);
    }
    const top = [...counts.entries()].sort((a, b) => b[1].n - a[1].n).slice(0, 4);
    const chips = top.map(([id, v]) => ({ id: `cat:${id}`, label: v.label }));
    // Si llegamos por deep-link a una categoría sin movimientos (no está en el
    // top), añade su chip para que el filtro activo sea visible.
    if (catParam && !chips.some((c) => c.id === `cat:${catParam}`)) {
      chips.push({ id: `cat:${catParam}`, label: categoryNames[catParam] ?? "Categoría" });
    }
    return [...base, ...chips];
  }, [items, categoryNames, catParam]);

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
  const run = (fn: () => Promise<{ ok: boolean }>, msg: string) =>
    startTransition(async () => {
      const res = await fn();
      if (res.ok) {
        toast(msg);
        router.refresh();
      } else toast("No se pudo completar", "error");
    });

  const q = query.toLowerCase().trim();
  const visible = items.filter((t) => {
    if (filter === "income" && t.kind !== "ingreso") return false;
    if (filter === "spending" && t.kind !== "gasto") return false;
    if (filter.startsWith("cat:") && t.categoryId !== filter.slice(4)) return false;
    if (!q) return true;
    const cat = t.categoryId ? (categoryNames[t.categoryId] ?? "") : "";
    const hay =
      `${t.merchantOrSource ?? ""} ${t.description ?? ""} ${cat} ${t.amount}`.toLowerCase();
    return hay.includes(q);
  });

  return (
    <div className="grid">
      <div className="card card-pad" style={{ paddingBottom: 16 }}>
        <div className="searchbar">
          <Icon name="search" />
          <input
            ref={searchRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar por comercio, categoría o monto…"
            aria-label="Buscar transacciones"
          />
          <span className="kbd">/</span>
        </div>
        <div className="filter-chips" style={{ marginTop: 12 }}>
          {filters.map((f) => (
            <button
              key={f.id}
              type="button"
              className={filter === f.id ? "fchip on" : "fchip"}
              onClick={() => setFilter(f.id)}
              aria-pressed={filter === f.id}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      <div className="card">
        <div className="card-head">
          <div>
            <div className="card-title">Todas las transacciones</div>
            <div className="card-sub">
              {visible.length} movimiento{visible.length === 1 ? "" : "s"} · {period}
              {capped ? ` · mostrando los ${TRANSACTIONS_LIST_CAP} más recientes` : ""}
            </div>
          </div>
        </div>
        {visible.length === 0 ? (
          <div
            style={{
              padding: "40px 24px",
              textAlign: "center",
              color: "var(--muted)",
              fontSize: 13,
            }}
          >
            Sin resultados para tu búsqueda.
          </div>
        ) : (
          visible.map((t) => (
            <Row
              key={t.id}
              t={t}
              categoryName={
                t.categoryId
                  ? (categoryNames[t.categoryId] ?? "Sin categoría")
                  : t.kind === "ingreso"
                    ? "Ingreso"
                    : "Sin categoría"
              }
              currency={currency}
              onEdit={() => setEditing(t)}
              onDelete={() => requestDelete(t)}
              onDuplicate={() => run(() => duplicateTransactionAction(t.id), "Duplicada")}
              onMarkReviewed={() => run(() => markReviewedAction(t.id), "Marcada revisada")}
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
    </div>
  );
}

function Row({
  t,
  categoryName,
  currency,
  onEdit,
  onDelete,
  onDuplicate,
  onMarkReviewed,
}: {
  t: Transaction;
  categoryName: string;
  currency: string;
  onEdit: () => void;
  onDelete: () => void;
  onDuplicate: () => void;
  onMarkReviewed: () => void;
}) {
  const [open, setOpen] = useState(false);
  const isIncome = t.kind === "ingreso";
  const amountStr = `${isIncome ? "+" : "−"}${formatMoney(t.amount, t.currency || currency)}`;
  const iconStyle = isIncome
    ? { width: 34, height: 34, background: "var(--pos-soft)", color: "var(--pos)" }
    : { width: 34, height: 34 };

  return (
    <div className="list-row" style={{ gridTemplateColumns: "34px 1fr auto auto auto" }}>
      <div className="env-ic" style={iconStyle}>
        <Icon name={isIncome ? "income" : "expense"} width={2} />
      </div>
      <div style={{ minWidth: 0 }}>
        <div
          className="env-name"
          style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
        >
          {t.merchantOrSource || t.description || (isIncome ? "Ingreso" : "Gasto")}
        </div>
        <div className="env-sub">
          {categoryName}
          {t.accountLabel ? ` · ${t.accountLabel}` : ""}
        </div>
      </div>
      <span className="inc-tag" style={{ marginRight: 8 }}>
        {isIncome ? "Ingreso" : categoryName}
      </span>
      <div className="env-num">
        <div className="big" style={{ color: isIncome ? "var(--pos)" : undefined }}>
          {amountStr}
        </div>
        <div className="small">{relativeDate(t.occurredOn)}</div>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 6, position: "relative" }}>
        {t.status === "pending_review" ? (
          <span
            className="chip"
            style={{ background: "var(--warn-soft)", color: "var(--warn)", fontSize: 11 }}
          >
            Pendiente
          </span>
        ) : null}
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
            {t.status === "pending_review" ? (
              <button
                onClick={() => {
                  setOpen(false);
                  onMarkReviewed();
                }}
              >
                Marcar revisada
              </button>
            ) : null}
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
