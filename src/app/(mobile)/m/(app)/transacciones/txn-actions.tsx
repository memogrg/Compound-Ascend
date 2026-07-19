"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { formatMoney } from "@/lib/format";
import { capacitorBrowser } from "@/lib/capacitor/native";
import {
  duplicateTransactionAction,
  markReviewedAction,
  splitTransactionAction,
  assignCategoryAction,
  getReceiptUrlAction,
  type ActionResult,
} from "@/modules/financial-base/api/v2-actions";
import {
  categoryMatchesKind,
  type SelectableCategory,
} from "@/modules/financial-base/engine/classify";
import type { Transaction } from "@/modules/financial-base/types";

import { BottomSheet, MoneyField, SheetSelect, useToast } from "../../components/form-kit";

/**
 * Acciones de un movimiento en /m/transacciones — paridad con la web:
 * duplicar, dividir, reasignar sobre, ver recibo y marcar revisada (además de
 * editar/eliminar, que viven en el swipe y se reexponen aquí para descubrirlas).
 *
 * Consume EXACTAMENTE las Server Actions de la web (v2-actions); cero backend nuevo. Tras cada
 * acción: toast en español + router.refresh() (la página es force-dynamic).
 *
 * Solo se abre desde filas gestionables (ingreso/gasto manual NO vinculado), así que "Dividir"
 * —que reemplaza el movimiento por N partes nuevas— nunca puede romper el vínculo
 * transacción↔entidad de un movimiento vinculado.
 */
type Mode = "menu" | "reassign" | "split";

/** Una parte del reparto: monto + sobre (opcional). */
type Part = { amount: number | undefined; categoryId: string };

/** Tolerancia de centavo para comparar la suma de las partes con el monto original. */
const EPS = 0.005;

function txnLabel(t: Transaction): string {
  return t.description || t.merchantOrSource || "Movimiento";
}

/** Reparto inicial: dos mitades que suman exacto (la 2ª absorbe el centavo impar). */
function initialParts(t: Transaction): Part[] {
  const half = Math.round((t.amount / 2) * 100) / 100;
  const rest = Math.round((t.amount - half) * 100) / 100;
  const categoryId = t.categoryId ?? "";
  return [
    { amount: half, categoryId },
    { amount: rest, categoryId },
  ];
}

export function TxnActionsSheet({
  txn,
  categories,
  categoryNames,
  onClose,
  onEdit,
  onDelete,
}: {
  txn: Transaction | null;
  categories: SelectableCategory[];
  categoryNames: Record<string, string>;
  onClose: () => void;
  onEdit: (t: Transaction) => void;
  onDelete: (t: Transaction) => void;
}) {
  const router = useRouter();
  const toast = useToast();
  const [pending, startTransition] = useTransition();
  const [mode, setMode] = useState<Mode>("menu");
  const [parts, setParts] = useState<Part[]>([]);
  const [splitError, setSplitError] = useState<string | null>(null);

  const close = () => {
    setMode("menu");
    setSplitError(null);
    onClose();
  };

  /** Ejecuta una acción del servidor: toast + refresh + cierre. */
  const run = (fn: () => Promise<ActionResult>, okMsg: string) => {
    startTransition(async () => {
      const res = await fn();
      if (res.ok) {
        toast.show(okMsg, "success");
        close();
        router.refresh();
      } else {
        toast.show(res.message ?? "No pudimos completar la acción", "error");
      }
    });
  };

  if (!txn) return null;

  const t = txn;
  const kind = t.kind === "ingreso" ? "ingreso" : "gasto";
  const options = categories
    .filter((c) => categoryMatchesKind(c.categoryType, kind))
    .map((c) => ({ value: c.id, label: c.name }));
  const currentCategory = t.categoryId ? categoryNames[t.categoryId] : undefined;
  const title =
    mode === "reassign" ? "Reasignar sobre" : mode === "split" ? "Dividir movimiento" : "Acciones del movimiento";

  // --- Dividir: la suma de las partes debe cuadrar con el monto original (el servidor no lo valida).
  const sum = parts.reduce((acc, p) => acc + (p.amount ?? 0), 0);
  const diff = sum - t.amount;
  const allPositive = parts.every((p) => (p.amount ?? 0) > 0);
  const splitOk = allPositive && Math.abs(diff) < EPS;

  const openReceipt = () => {
    const path = t.receiptUrl;
    if (!path) return;
    startTransition(async () => {
      const res = await getReceiptUrlAction(path);
      if (!res.ok || !res.url) {
        toast.show("No pudimos abrir el recibo", "error");
        return;
      }
      const browser = capacitorBrowser();
      if (browser) {
        // App nativa: navegador in-app de Capacitor (no saca al usuario de la app).
        await browser.open({ url: res.url });
      } else if (!window.open(res.url, "_blank", "noopener,noreferrer")) {
        toast.show("Permite las ventanas emergentes para ver el recibo", "error");
        return;
      }
      close();
    });
  };

  const submitSplit = () => {
    if (!allPositive) {
      setSplitError("Cada parte debe ser mayor que cero.");
      return;
    }
    if (Math.abs(diff) >= EPS) {
      setSplitError(
        `Las partes suman ${formatMoney(sum, t.currency)} y el movimiento es de ${formatMoney(t.amount, t.currency)}. Ajusta ${formatMoney(Math.abs(diff), t.currency)} ${diff > 0 ? "de menos" : "de más"}.`,
      );
      return;
    }
    setSplitError(null);
    const payload = parts.map((p) => ({
      amount: p.amount ?? 0,
      categoryId: p.categoryId || null,
    }));
    run(() => splitTransactionAction(t.id, payload), `Movimiento dividido en ${payload.length} partes`);
  };

  return (
    <BottomSheet open onClose={close} title={title}>
      <div style={{ display: "grid", gap: 10 }}>
        <div className="muted" style={{ fontSize: 13 }}>
          {txnLabel(t)} · {formatMoney(t.amount, t.currency)}
          {currentCategory ? ` · ${currentCategory}` : ""}
        </div>

        {mode === "menu" ? (
          <>
            <MenuItem
              label="Duplicar"
              hint="Crea una copia con los mismos datos"
              disabled={pending}
              onClick={() => run(() => duplicateTransactionAction(t.id), "Duplicada")}
            />
            <MenuItem
              label="Dividir"
              hint="Reparte el monto en dos o más sobres"
              disabled={pending}
              onClick={() => {
                setParts(initialParts(t));
                setSplitError(null);
                setMode("split");
              }}
            />
            <MenuItem
              label="Reasignar sobre"
              hint={currentCategory ? `Ahora: ${currentCategory}` : "Sin sobre asignado"}
              disabled={pending}
              onClick={() => setMode("reassign")}
            />
            {t.receiptUrl ? (
              <MenuItem label="Ver recibo" hint="Abre el comprobante" disabled={pending} onClick={openReceipt} />
            ) : null}
            {t.status === "pending_review" ? (
              <MenuItem
                label="Marcar revisada"
                hint="Sácala de la bandeja de revisión"
                disabled={pending}
                onClick={() => run(() => markReviewedAction(t.id), "Marcada como revisada")}
              />
            ) : null}
            <MenuItem
              label="Editar"
              hint="Cambia monto, fecha, sobre o cuenta"
              disabled={pending}
              onClick={() => {
                close();
                onEdit(t);
              }}
            />
            <button
              type="button"
              className="m-btn m-btn-block m-btn-quiet-danger"
              disabled={pending}
              onClick={() => {
                close();
                onDelete(t);
              }}
            >
              Eliminar
            </button>
          </>
        ) : null}

        {mode === "reassign" ? (
          <>
            {options.length === 0 ? (
              <div className="muted" style={{ fontSize: 13 }}>
                No tienes sobres disponibles para este tipo de movimiento.
              </div>
            ) : (
              options.map((o) => (
                <button
                  key={o.value}
                  type="button"
                  className="m-btn m-btn-block m-btn-secondary"
                  style={{ justifyContent: "flex-start" }}
                  disabled={pending || o.value === t.categoryId}
                  onClick={() =>
                    run(
                      () =>
                        assignCategoryAction({
                          transactionId: t.id,
                          categoryId: o.value,
                          type: kind === "ingreso" ? "income" : "expense",
                        }),
                      "Sobre reasignado",
                    )
                  }
                >
                  {o.label}
                  {o.value === t.categoryId ? " · actual" : ""}
                </button>
              ))
            )}
            <button
              type="button"
              className="m-btn m-btn-block m-btn-secondary"
              disabled={pending}
              onClick={() => setMode("menu")}
            >
              Volver
            </button>
          </>
        ) : null}

        {mode === "split" ? (
          <>
            {parts.map((p, i) => (
              <div key={i} className="card card-p" style={{ padding: 12 }}>
                <div className="between" style={{ marginBottom: 6 }}>
                  <div className="ov">Parte {i + 1}</div>
                  {parts.length > 2 ? (
                    <button
                      type="button"
                      className="m-chip"
                      disabled={pending}
                      onClick={() => setParts(parts.filter((_, j) => j !== i))}
                    >
                      Quitar
                    </button>
                  ) : null}
                </div>
                <MoneyField
                  name={`split-amount-${i}`}
                  label="Monto"
                  value={p.amount}
                  currency={t.currency}
                  onChange={(v) =>
                    setParts(parts.map((q, j) => (j === i ? { ...q, amount: v } : q)))
                  }
                />
                <SheetSelect
                  name={`split-cat-${i}`}
                  label="Sobre"
                  value={p.categoryId || undefined}
                  options={options}
                  placeholder="Sin sobre"
                  sheetTitle="Elige el sobre"
                  onChange={(v) =>
                    setParts(parts.map((q, j) => (j === i ? { ...q, categoryId: v } : q)))
                  }
                />
              </div>
            ))}

            <button
              type="button"
              className="m-btn m-btn-block m-btn-secondary"
              disabled={pending}
              onClick={() => setParts([...parts, { amount: undefined, categoryId: "" }])}
            >
              Añadir parte
            </button>

            <div className="between">
              <div className="muted" style={{ fontSize: 12.5 }}>
                Suman {formatMoney(sum, t.currency)} de {formatMoney(t.amount, t.currency)}
              </div>
              <div className={`mono ${splitOk ? "pos" : "neg"}`} style={{ fontSize: 12.5, fontWeight: 700 }}>
                {splitOk
                  ? "Cuadra"
                  : `${diff > 0 ? "+" : "−"}${formatMoney(Math.abs(diff), t.currency)}`}
              </div>
            </div>

            {splitError ? (
              <div className="neg" style={{ fontSize: 12.5, lineHeight: 1.45 }}>
                {splitError}
              </div>
            ) : null}

            <div className="muted" style={{ fontSize: 12, lineHeight: 1.45 }}>
              El movimiento original se reemplaza por las partes.
            </div>

            <button
              type="button"
              className="m-btn m-btn-block m-btn-primary"
              disabled={pending || !splitOk}
              onClick={submitSplit}
            >
              {pending ? "Dividiendo…" : "Dividir"}
            </button>
            <button
              type="button"
              className="m-btn m-btn-block m-btn-secondary"
              disabled={pending}
              onClick={() => setMode("menu")}
            >
              Volver
            </button>
          </>
        ) : null}
      </div>
    </BottomSheet>
  );
}

function MenuItem({
  label,
  hint,
  disabled,
  onClick,
}: {
  label: string;
  hint: string;
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className="m-btn m-btn-block m-btn-secondary"
      style={{ justifyContent: "flex-start", flexDirection: "column", alignItems: "flex-start", gap: 2 }}
      disabled={disabled}
      onClick={onClick}
    >
      <span>{label}</span>
      <span className="muted" style={{ fontSize: 11.5, fontWeight: 400 }}>
        {hint}
      </span>
    </button>
  );
}
