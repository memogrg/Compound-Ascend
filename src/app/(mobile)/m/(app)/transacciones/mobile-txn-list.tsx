"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

import {
  addTransactionAction,
  editTransactionAction,
  removeTransactionAction,
} from "@/modules/financial-base/api/v2-actions";
import type { Transaction, Account } from "@/modules/financial-base/types";
import type { Jar } from "@/modules/financial-base/engine/expense-jars";
import type { SelectableCategory } from "@/modules/financial-base/engine/classify";
import { formatMoney } from "@/lib/format";

import { Fab, BottomSheet, SwipeRow, ConfirmDialog, useToast } from "../../components/form-kit";
import { TxnForm, type TxnFormValues } from "./txn-form";
import { TxnActionsSheet } from "./txn-actions";

/**
 * Gestión de transacciones en /m/transacciones — reutiliza las Server Actions V2 de la web
 * (add/edit/removeTransactionAction). Filtro por tipo + cada movimiento gestionable en un
 * SwipeRow (Editar/Eliminar) y, al tocarlo, un sheet con el resto de acciones de la web
 * (duplicar, dividir, reasignar sobre, ver recibo, marcar revisada). FAB → registrar
 * ingreso/gasto manual.
 *
 * Vinculadas (linkedKind≠none: pagos de deuda, aportes, dividendos, renta): NO se editan/
 * borran aquí porque removeTransaction sólo borra la fila de transactions y dejaría huérfano
 * el registro de origen (p.ej. el debt_payment). En su lugar se enlaza a la pantalla de
 * origen, que tiene el flujo correcto (revierte el ledger). Igual criterio para
 * transferencias/ajustes (se crean/editan en su propio flujo). Por eso el sheet de acciones
 * solo cuelga de las filas gestionables: así "Dividir" (que reemplaza el movimiento por N
 * partes nuevas) nunca puede romper el vínculo transacción↔entidad.
 */

const KIND_LABEL: Record<Transaction["kind"], string> = {
  ingreso: "Ingreso",
  gasto: "Gasto",
  transferencia: "Transferencia",
  ajuste: "Ajuste",
};

const LINKED_ORIGIN: Record<string, { href: string; label: string }> = {
  debt: { href: "/m/deudas", label: "Deudas" },
  goal: { href: "/m/metas", label: "Ahorro" },
  holding: { href: "/m/patrimonio", label: "Patrimonio" },
  policy: { href: "/m/proteccion", label: "Protección" },
  rental: { href: "/m/patrimonio", label: "Patrimonio" },
};

function isLinked(t: Transaction): boolean {
  return Boolean(t.linkedKind) && t.linkedKind !== "none";
}

/** Gestionable en esta pantalla: ingreso/gasto manual no vinculado. */
function isManageable(t: Transaction): boolean {
  return !isLinked(t) && (t.kind === "ingreso" || t.kind === "gasto");
}

/** Fecha relativa (Hoy / Ayer / día / d mes), como en el Inicio. */
function relativeDay(iso: string): string {
  const now = new Date();
  const d = new Date(`${iso}T00:00:00`);
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const diff = Math.round((today.getTime() - d.getTime()) / 86_400_000);
  if (diff <= 0) return "Hoy";
  if (diff === 1) return "Ayer";
  if (diff < 7) return d.toLocaleDateString("es-MX", { weekday: "short" });
  return d.toLocaleDateString("es-MX", { day: "numeric", month: "short" });
}

type Filter = "all" | "ingreso" | "gasto";
const FILTERS: { key: Filter; label: string }[] = [
  { key: "all", label: "Todas" },
  { key: "ingreso", label: "Ingresos" },
  { key: "gasto", label: "Gastos" },
];

export function MobileTxnList({
  transactions,
  categoryNames,
  categories,
  currency,
  periodLabel,
  jars,
  accounts,
}: {
  transactions: Transaction[];
  categoryNames: Record<string, string>;
  categories: SelectableCategory[];
  currency: string;
  periodLabel: string;
  jars: Jar[];
  accounts: Account[];
}) {
  const router = useRouter();
  const toast = useToast();
  const [filter, setFilter] = useState<Filter>("all");
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<Transaction | null>(null);
  const [deleting, setDeleting] = useState<Transaction | null>(null);
  const [delPending, setDelPending] = useState(false);
  const [actionsFor, setActionsFor] = useState<Transaction | null>(null);

  const list = filter === "all" ? transactions : transactions.filter((t) => t.kind === filter);

  const confirmDelete = async () => {
    if (!deleting) return;
    setDelPending(true);
    const res = await removeTransactionAction(deleting.id);
    setDelPending(false);
    if (res.ok) {
      toast.show("Transacción eliminada", "success");
      setDeleting(null);
      router.refresh();
    } else {
      toast.show(res.message ?? "No se pudo eliminar.", "error");
    }
  };

  return (
    <>
      <div className="m-chips" style={{ marginBottom: 14 }}>
        {FILTERS.map((f) => (
          <button
            key={f.key}
            type="button"
            className={`m-chip${filter === f.key ? " sel" : ""}`}
            aria-pressed={filter === f.key}
            onClick={() => setFilter(f.key)}
          >
            {f.label}
          </button>
        ))}
      </div>

      <div className="between" style={{ marginBottom: 6 }}>
        <div className="sec-title">Todas las transacciones</div>
        <span className="mono" style={{ fontSize: 11, color: "var(--text-muted)" }}>
          {list.length} · {periodLabel}
        </span>
      </div>

      {list.length === 0 ? (
        <div className="card card-p">
          <div className="muted" style={{ fontSize: 13, lineHeight: 1.5 }}>
            No hay movimientos en este periodo. Toca el botón + para registrar el primero.
          </div>
        </div>
      ) : (
        <div className="card">
          {list.map((t) => {
            const linked = isLinked(t);
            const origin = linked && t.linkedKind ? LINKED_ORIGIN[t.linkedKind] : undefined;
            const row = <TxnRow t={t} categoryNames={categoryNames} currency={currency} via={origin?.label} />;

            if (isManageable(t)) {
              return (
                <SwipeRow
                  key={t.id}
                  onEdit={() => setEditing(t)}
                  onDelete={() => setDeleting(t)}
                  onTap={() => setActionsFor(t)}
                >
                  {row}
                </SwipeRow>
              );
            }
            // Vinculada → enlaza a su pantalla de origen (flujo correcto de edición/borrado).
            if (origin) {
              return (
                <Link key={t.id} href={origin.href} style={{ display: "block", textDecoration: "none", color: "inherit" }}>
                  {row}
                </Link>
              );
            }
            // Transferencia/ajuste no vinculado → solo lectura.
            return <div key={t.id}>{row}</div>;
          })}
        </div>
      )}

      <Fab onClick={() => setAdding(true)} label="Registrar transacción" />

      {/* Acciones del movimiento (toque en la fila): duplicar, dividir, reasignar, recibo, revisar */}
      <TxnActionsSheet
        txn={actionsFor}
        categories={categories}
        categoryNames={categoryNames}
        onClose={() => setActionsFor(null)}
        onEdit={(t) => setEditing(t)}
        onDelete={(t) => setDeleting(t)}
      />

      {/* Crear */}
      <BottomSheet open={adding} onClose={() => setAdding(false)} title="Registrar transacción">
        <TxnForm
          jars={jars}
          currency={currency}
          accounts={accounts}
          action={addTransactionAction}
          submitLabel="Registrar"
          successMessage="Transacción registrada"
          onSuccess={() => setAdding(false)}
        />
      </BottomSheet>

      {/* Editar (tipo fijo, como la web) */}
      <BottomSheet open={!!editing} onClose={() => setEditing(null)} title="Editar transacción">
        {editing ? (
          <TxnForm
            initial={editing}
            lockKind
            jars={jars}
            currency={currency}
            accounts={accounts}
            action={(v: TxnFormValues) => editTransactionAction(editing.id, v)}
            submitLabel="Guardar cambios"
            successMessage="Transacción actualizada"
            onSuccess={() => setEditing(null)}
          />
        ) : null}
      </BottomSheet>

      {/* Eliminar */}
      <ConfirmDialog
        open={!!deleting}
        title="Eliminar transacción"
        message={
          deleting
            ? `Se eliminará ${deleting.kind === "ingreso" ? "el ingreso" : "el gasto"} de ${formatMoney(Math.abs(deleting.amount), deleting.currency || currency)}.`
            : undefined
        }
        confirmLabel="Eliminar"
        variant="danger"
        pending={delPending}
        onConfirm={confirmDelete}
        onCancel={() => setDeleting(null)}
      />
    </>
  );
}

/** Fila de transacción (contenido reutilizado por SwipeRow / Link / read-only). */
function TxnRow({
  t,
  categoryNames,
  currency,
  via,
}: {
  t: Transaction;
  categoryNames: Record<string, string>;
  currency: string;
  via?: string;
}) {
  const income = t.kind === "ingreso";
  const sign = income ? "+" : t.kind === "gasto" ? "−" : "";
  const name = t.merchantOrSource || t.description || KIND_LABEL[t.kind];
  const cat = (t.categoryId ? categoryNames[t.categoryId] : "") || KIND_LABEL[t.kind];
  return (
    <div className="lrow">
      <span
        className="lic"
        style={income ? { background: "var(--accent-soft)", color: "var(--accent)" } : undefined}
        aria-hidden
      >
        {income ? (
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
            <path d="M5 12h14M13 6l6 6-6 6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        ) : (
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
            <path d="M6 6h15l-1.5 9h-12z" strokeLinejoin="round" />
            <path d="M6 6 5 3H3M9 20a1 1 0 1 0 0-.01M18 20a1 1 0 1 0 0-.01" strokeLinecap="round" />
          </svg>
        )}
      </span>
      <div style={{ minWidth: 0 }}>
        <div className="lname">{name}</div>
        <div className="lsub">
          {cat} · {relativeDay(t.occurredOn)}
          {via ? <span className="schip" style={{ marginLeft: 6 }}>vía {via}</span> : null}
        </div>
      </div>
      <div className={`lamt ${income ? "pos" : ""}`}>
        {sign}
        {formatMoney(Math.abs(t.amount), t.currency || currency)}
      </div>
    </div>
  );
}
