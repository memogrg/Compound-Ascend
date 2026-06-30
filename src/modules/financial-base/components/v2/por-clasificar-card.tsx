"use client";

/**
 * Vista "Por clasificar": movimientos que entraron sin sobre (categoryId=null), p. ej.
 * por WhatsApp o ingesta sin regla que matchee. El usuario asigna el sobre en 1 tap y,
 * opcional, crea la regla para que la próxima del mismo comercio caiga sola. Calcada de
 * ReconciliationCard: colapsable, filas densas, solo UI (la lógica vive en la action).
 */
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/ui/icon";
import { useToast } from "@/components/ui/toast";
import { formatMoney } from "@/lib/format";
import { assignCategoryAction } from "@/modules/financial-base/api/v2-actions";
import { categoryMatchesKind, type SelectableCategory } from "@/modules/financial-base/engine/classify";
import type { Transaction } from "@/modules/financial-base/types";

const HELP =
  "Movimientos que entraron sin sobre (p. ej. por WhatsApp). Asignalos para que cuenten en tu presupuesto.";

export function PorClasificarCard({
  items,
  categories,
  suggested,
}: {
  items: Transaction[];
  categories: SelectableCategory[];
  /** Pre-relleno sugerido por IA: txnId → categoryId (editable, no auto-asigna). */
  suggested?: Record<string, string>;
}) {
  const router = useRouter();
  const toast = useToast();
  const [open, setOpen] = useState(true);
  const [pending, startTransition] = useTransition();
  const [busy, setBusy] = useState<string | null>(null);
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const [remember, setRemember] = useState<Set<string>>(new Set());

  const visible = items.filter((t) => !hidden.has(t.id));
  if (visible.length === 0) return null;

  const toggleRemember = (id: string) =>
    setRemember((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const assign = (t: Transaction, categoryId: string) => {
    if (!categoryId) return;
    setBusy(t.id);
    const merchant = t.merchantOrSource ?? t.description ?? undefined;
    startTransition(async () => {
      const res = await assignCategoryAction({
        transactionId: t.id,
        categoryId,
        crearRegla: remember.has(t.id) && Boolean(merchant),
        merchant,
        type: t.kind === "gasto" ? "expense" : "income",
      });
      setBusy(null);
      if (res.ok) {
        toast("Movimiento clasificado");
        setHidden((prev) => new Set(prev).add(t.id));
        router.refresh();
      } else {
        toast(res.message ?? "No se pudo clasificar", "error");
      }
    });
  };

  return (
    <div className="card" style={{ padding: 0 }}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          width: "100%",
          padding: "12px 18px",
          background: "transparent",
          border: "none",
          cursor: "pointer",
          textAlign: "left",
          fontSize: 13,
          color: "var(--ink-2)",
        }}
      >
        <span
          className="chip"
          style={{
            background: "var(--warn-soft, rgba(190,140,40,.12))",
            color: "var(--warn)",
            fontSize: 10.5,
            flex: "none",
          }}
        >
          {visible.length}
        </span>
        <span style={{ fontWeight: 500 }}>
          Por clasificar: {visible.length} {visible.length === 1 ? "movimiento" : "movimientos"} sin
          sobre
        </span>
        <span
          className="tip"
          data-tip={HELP}
          style={{ display: "inline-flex", color: "var(--muted)", flex: "none" }}
          onClick={(e) => e.stopPropagation()}
        >
          <Icon name="info" style={{ width: 14, height: 14 }} />
        </span>
        <span
          className="muted"
          style={{
            marginLeft: "auto",
            display: "inline-flex",
            transform: open ? "rotate(90deg)" : "none",
            transition: "transform .15s",
          }}
        >
          <Icon name="chev" style={{ width: 14, height: 14 }} />
        </span>
      </button>

      {open ? (
        <div style={{ padding: "0 18px 12px", borderTop: "1px solid var(--line)" }}>
          {visible.map((t) => {
            const rowBusy = pending && busy === t.id;
            const options = categories.filter((c) => categoryMatchesKind(c.categoryType, t.kind as "gasto" | "ingreso"));
            const sug = suggested?.[t.id];
            const sugName = sug ? options.find((o) => o.id === sug)?.name : undefined;
            return (
              <div
                key={t.id}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  flexWrap: "wrap",
                  padding: "8px 0",
                  borderBottom: "1px solid var(--line)",
                  fontSize: 12.5,
                  opacity: rowBusy ? 0.5 : 1,
                }}
              >
                <span className="tnum" style={{ fontWeight: 600, flex: "none" }}>
                  {formatMoney(t.amount, t.currency)}
                </span>
                <span
                  style={{
                    minWidth: 0,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {t.merchantOrSource ?? t.description ?? (t.kind === "ingreso" ? "Ingreso" : "Gasto")}
                </span>
                <span className="muted" style={{ flex: "none" }}>
                  {t.occurredOn}
                </span>
                <span
                  style={{ display: "inline-flex", gap: 8, marginLeft: "auto", alignItems: "center", flex: "none" }}
                >
                  {sug && sugName ? (
                    <span
                      className="tip"
                      data-tip="Sugerido por IA según comercios parecidos. Tocá «usar» o elegí otro."
                      style={{ display: "inline-flex", alignItems: "center", gap: 6, flex: "none" }}
                    >
                      <span className="chip" style={{ fontSize: 10.5 }}>
                        ✨ {sugName}
                      </span>
                      <button
                        type="button"
                        className="btn btn-ghost"
                        style={{ padding: "2px 8px", fontSize: 11 }}
                        disabled={rowBusy}
                        onClick={() => assign(t, sug)}
                      >
                        usar
                      </button>
                    </span>
                  ) : null}
                  <label className="tip" data-tip="Crear una regla para este comercio" style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 11 }}>
                    <input
                      type="checkbox"
                      checked={remember.has(t.id)}
                      disabled={rowBusy}
                      onChange={() => toggleRemember(t.id)}
                    />
                    recordar
                  </label>
                  <select
                    className="sel"
                    style={{ width: "auto", fontSize: 12, padding: "4px 8px" }}
                    defaultValue={sug ?? ""}
                    disabled={rowBusy}
                    onChange={(e) => assign(t, e.target.value)}
                  >
                    <option value="" disabled>
                      {rowBusy ? "…" : "Elegí un sobre"}
                    </option>
                    {options.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </span>
              </div>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
