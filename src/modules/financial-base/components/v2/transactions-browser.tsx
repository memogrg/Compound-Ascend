"use client";

/**
 * Navegador de transacciones con el estilo del diseño Claude (Budget.html,
 * panel `transactions`): barra de búsqueda + chips de filtro + lista `.list-row`
 * (env-ic · nombre · tag · monto/fecha) con menú por fila.
 *
 * Solo presentación + filtrado en cliente. Todas las mutaciones reutilizan las
 * MISMAS server actions de V2 (editar/duplicar/eliminar/marcar revisada).
 */
import { useEffect, useMemo, useRef, useState, useTransition, type ReactNode } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Icon, type IconName } from "@/components/ui/icon";
import { useToast } from "@/components/ui/toast";
import { formatMoney } from "@/lib/format";
import { QuickAddModal } from "@/modules/financial-base/components/v2/quick-add-modal";
import {
  removeTransactionAction,
  duplicateTransactionAction,
  markReviewedAction,
} from "@/modules/financial-base/api/v2-actions";
import {
  describeMoneyFlow,
  liquidityAfterDisplay,
  FLOW_VERB_LABEL,
  LIQUIDITY_LABEL,
  type MoneyFlow,
  type MoneyFlowEffect,
} from "@/modules/financial-base/engine/money-flow";
import { TRANSACTIONS_LIST_CAP } from "@/modules/financial-base/constants";
import type { Account, Transaction } from "@/modules/financial-base/types";
import type { Category } from "@/modules/financial-base/services/categories-service";

type Filter = { id: string; label: string };

/** Glifo de origen por vínculo; los sueltos usan su glifo por tipo. */
const ORIGIN_ICON: Record<string, IconName> = {
  debt: "debt",
  goal: "savings",
  holding: "invest",
  policy: "defense",
  rental: "portfolio",
};
/** Pantalla de origen de una transacción vinculada (para "Ver en X"). */
const ORIGIN_LINK: Record<string, { href: string; label: string }> = {
  debt: { href: "/deudas", label: "Deudas" },
  goal: { href: "/control-financiero", label: "Ahorro" },
  holding: { href: "/patrimonio", label: "Patrimonio" },
  policy: { href: "/patrimonio/proteccion", label: "Protección" },
  rental: { href: "/patrimonio", label: "Patrimonio" },
};

function originIcon(t: Transaction): IconName {
  if (t.linkedKind && t.linkedKind !== "none") return ORIGIN_ICON[t.linkedKind] ?? "txn";
  if (t.kind === "ingreso") return "income";
  if (t.kind === "gasto") return "expense";
  return "txn";
}

/** Color del efecto en liquidez: sale rojo, entra verde, neutro gris. */
function effectColor(effect: MoneyFlowEffect): string {
  return effect === "out" ? "var(--neg)" : effect === "in" ? "var(--pos)" : "var(--ink-2)";
}

function fullDate(iso: string): string {
  return new Date(`${iso}T00:00:00`).toLocaleDateString("es-MX", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

/** Línea de viaje "origen → destino": colorea "Tu liquidez" según el efecto. */
function TravelLine({ flow }: { flow: MoneyFlow }) {
  if (flow.isJarSpend) {
    return (
      <span style={{ color: "var(--ink-2)" }}>Sale del frasco · no toca tu liquidez</span>
    );
  }
  const color = effectColor(flow.effect);
  const token = (label: string) =>
    label === LIQUIDITY_LABEL ? (
      <strong style={{ color, fontWeight: 600 }}>{label}</strong>
    ) : (
      <span>{label}</span>
    );
  return (
    <span>
      {token(flow.fromLabel)}
      <span style={{ color: "var(--muted)" }}> → </span>
      {token(flow.toLabel)}
    </span>
  );
}

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
  balanceAfter,
}: {
  transactions: Transaction[];
  categoryNames: Record<string, string>;
  categories: Category[];
  accounts: Account[];
  currency: string;
  period: string;
  /** Saldo de liquidez tras cada txn que movió el saco (por id). Fase B. */
  balanceAfter?: Record<string, number>;
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
              balanceAfter={balanceAfter?.[t.id]}
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
  balanceAfter,
  onEdit,
  onDelete,
  onDuplicate,
  onMarkReviewed,
}: {
  t: Transaction;
  categoryName: string;
  currency: string;
  balanceAfter?: number;
  onEdit: () => void;
  onDelete: () => void;
  onDuplicate: () => void;
  onMarkReviewed: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const isIncome = t.kind === "ingreso";
  // El viaje del dinero (Fase B): efecto en liquidez, origen y destino. Puro.
  const flow = describeMoneyFlow(t);
  const amtColor = effectColor(flow.effect);
  const sign = flow.effect === "in" ? "+" : flow.effect === "out" ? "−" : "";
  const amountStr = `${sign}${formatMoney(t.amount, t.currency || currency)}`;
  const linked = t.linkedKind && t.linkedKind !== "none" ? t.linkedKind : null;
  const origin = linked ? ORIGIN_LINK[linked] : undefined;
  const iconStyle = isIncome
    ? { width: 34, height: 34, background: "var(--pos-soft)", color: "var(--pos)" }
    : { width: 34, height: 34 };

  return (
    <div>
      <div
        className="list-row"
        style={{ gridTemplateColumns: "34px 1fr auto auto auto", cursor: "pointer" }}
        role="button"
        tabIndex={0}
        aria-expanded={expanded}
        onClick={() => setExpanded((v) => !v)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            setExpanded((v) => !v);
          }
        }}
      >
        <div className="env-ic" style={iconStyle}>
          <Icon name={originIcon(t)} width={2} />
        </div>
        <div style={{ minWidth: 0 }}>
          <div
            className="env-name"
            style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
          >
            {t.merchantOrSource || t.description || (isIncome ? "Ingreso" : "Gasto")}
          </div>
          <div
            className="env-sub"
            style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
          >
            <TravelLine flow={flow} />
          </div>
        </div>
        <span className="inc-tag" style={{ marginRight: 8 }}>
          {isIncome ? "Ingreso" : categoryName}
        </span>
        <div className="env-num">
          <div className="big" style={{ color: amtColor }}>
            {amountStr}
          </div>
          <div className="small">{relativeDate(t.occurredOn)}</div>
        </div>
        {/* Acciones: no deben disparar el expand de la fila. */}
        <div
          style={{ display: "flex", alignItems: "center", gap: 6, position: "relative" }}
          onClick={(e) => e.stopPropagation()}
        >
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
      {expanded ? (
        <MoneyFlowDetail
          t={t}
          flow={flow}
          currency={currency}
          categoryName={categoryName}
          balanceAfter={balanceAfter}
          origin={origin}
        />
      ) : null}
    </div>
  );
}

/** Una fila etiqueta/valor del detalle expandido. */
function DetailField({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", gap: 12, padding: "3px 0" }}>
      <span style={{ color: "var(--muted)", fontSize: 12 }}>{label}</span>
      <span style={{ fontSize: 12.5, textAlign: "right", fontWeight: 500 }}>{children}</span>
    </div>
  );
}

/** Detalle del viaje del dinero al expandir una fila (Fase B). */
function MoneyFlowDetail({
  t,
  flow,
  currency,
  categoryName,
  balanceAfter,
  origin,
}: {
  t: Transaction;
  flow: MoneyFlow;
  currency: string;
  categoryName: string;
  balanceAfter?: number;
  origin?: { href: string; label: string };
}) {
  const amtColor = effectColor(flow.effect);
  const money = formatMoney(t.amount, t.currency || currency);
  const efecto =
    flow.effect === "out"
      ? `− ${money} · sale de tu liquidez`
      : flow.effect === "in"
        ? `+ ${money} · entra a tu liquidez`
        : "No toca tu liquidez";
  const after = liquidityAfterDisplay({ effect: flow.effect, balanceAfter });
  return (
    <div
      style={{
        padding: "10px 16px 14px 52px",
        borderTop: "1px solid var(--line)",
        background: "var(--surface-2, transparent)",
      }}
    >
      <DetailField label="Fecha">{fullDate(t.occurredOn)}</DetailField>
      {flow.isJarSpend ? (
        <>
          <DetailField label="Salió del frasco">
            <span style={{ color: amtColor }}>{flow.fromLabel}</span>
          </DetailField>
          <DetailField label="Pagado con">{categoryName}</DetailField>
        </>
      ) : (
        <>
          <DetailField label="Salió de">
            <span style={flow.fromLabel === LIQUIDITY_LABEL ? { color: amtColor } : undefined}>
              {flow.fromLabel}
            </span>
          </DetailField>
          <DetailField label={FLOW_VERB_LABEL[flow.verb]}>
            <span style={flow.toLabel === LIQUIDITY_LABEL ? { color: amtColor } : undefined}>
              {flow.toLabel || "—"}
            </span>
          </DetailField>
        </>
      )}
      <DetailField label="Efecto en tu liquidez">
        <span style={{ color: amtColor }}>{efecto}</span>
      </DetailField>
      {/* "Liquidez después" se decide por el EFECTO, no por la ausencia del saldo: los
          legados out/in sin fila en el ledger omiten la línea (no dicen "No cambia"). */}
      {after.mode === "hidden" ? null : (
        <DetailField label="Liquidez después">
          {after.mode === "amount" ? formatMoney(after.value, currency) : "No cambia"}
        </DetailField>
      )}
      {origin ? (
        <div style={{ marginTop: 10 }}>
          <Link
            href={origin.href}
            className="btn btn-ghost"
            style={{ fontSize: 12, padding: "4px 12px" }}
            onClick={(e) => e.stopPropagation()}
          >
            Ver en {origin.label} →
          </Link>
        </div>
      ) : null}
    </div>
  );
}
