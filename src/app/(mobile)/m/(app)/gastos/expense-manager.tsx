"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import {
  addExpenseAction,
  editExpenseAction,
  removeExpenseAction,
} from "@/modules/financial-base/api/actions";
import type { ExpenseItem } from "@/modules/financial-base";
import { formatMoney } from "@/lib/format";

import { Fab, BottomSheet, SwipeRow, ConfirmDialog, useToast } from "../../components/form-kit";
import { ExpenseForm, type ExpenseValues } from "./expense-form";

/**
 * CRUD de gastos en /m/gastos (mismo molde que IncomeManager), cableado al Form Kit y a
 * las Server Actions existentes (add/edit/removeExpenseAction + expenseInputSchema):
 *  - FAB → alta.
 *  - SwipeRow → Editar (hoja precargada → editExpenseAction) / Eliminar (ConfirmDialog →
 *    removeExpenseAction). Convive con la vista de frascos (solo lectura) de la pantalla.
 */

const NATURE_LABEL: Record<string, string> = {
  esencial: "Esencial",
  estilo_vida: "Estilo de vida",
  financiero: "Financiero",
  proteccion: "Protección",
  crecimiento: "Crecimiento",
  ahorro: "Ahorro",
  inversion: "Inversión",
  donacion: "Donación",
  miscelaneo: "Misceláneo",
};

export function ExpenseManager({ expenses, currency }: { expenses: ExpenseItem[]; currency: string }) {
  const router = useRouter();
  const toast = useToast();
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<ExpenseItem | null>(null);
  const [deleting, setDeleting] = useState<ExpenseItem | null>(null);
  const [delPending, setDelPending] = useState(false);

  const confirmDelete = async () => {
    if (!deleting) return;
    setDelPending(true);
    const res = await removeExpenseAction(deleting.id);
    setDelPending(false);
    if (res.ok) {
      toast.show("Gasto eliminado", "success");
      setDeleting(null);
      router.refresh();
    } else {
      toast.show("No se pudo eliminar.", "error");
    }
  };

  return (
    <>
      <div className="card">
        {expenses.length === 0 ? (
          <div className="muted" style={{ padding: "16px 18px", fontSize: 13.5, lineHeight: 1.5 }}>
            Aún no registras gastos. Toca el botón + para agregar el primero.
          </div>
        ) : (
          expenses.map((e) => (
            <SwipeRow key={e.id} onEdit={() => setEditing(e)} onDelete={() => setDeleting(e)}>
              <div className="lrow">
                <span className="lic" style={{ background: "var(--surface-2)" }} aria-hidden>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round">
                    <path d="M6 6h15l-1.5 9h-12z" />
                    <path d="M6 6 5 3H3M9 20a1 1 0 1 0 0-.01M18 20a1 1 0 1 0 0-.01" />
                  </svg>
                </span>
                <div style={{ minWidth: 0 }}>
                  <div className="lname">{e.name}</div>
                  <div className="lsub">
                    <span className="schip">{e.frequency.toUpperCase()}</span> ·{" "}
                    {NATURE_LABEL[e.nature] ?? e.nature}
                  </div>
                </div>
                <div className="lamt">−{formatMoney(e.amountMonthly, e.currency)}</div>
              </div>
            </SwipeRow>
          ))
        )}
      </div>

      <Fab onClick={() => setAdding(true)} label="Agregar gasto" />

      {/* Alta */}
      <BottomSheet open={adding} onClose={() => setAdding(false)} title="Nuevo gasto">
        <ExpenseForm
          currency={currency}
          action={addExpenseAction}
          submitLabel="Guardar gasto"
          successMessage="Gasto agregado"
          onSuccess={() => setAdding(false)}
        />
      </BottomSheet>

      {/* Edición */}
      <BottomSheet open={!!editing} onClose={() => setEditing(null)} title="Editar gasto">
        {editing ? (
          <ExpenseForm
            currency={currency}
            initial={{
              name: editing.name,
              amount: editing.amount,
              nature: editing.nature,
              frequency: editing.frequency,
              currency: editing.currency,
            }}
            action={(v: ExpenseValues) => editExpenseAction(editing.id, v)}
            submitLabel="Guardar cambios"
            successMessage="Gasto actualizado"
            onSuccess={() => setEditing(null)}
          />
        ) : null}
      </BottomSheet>

      {/* Eliminación */}
      <ConfirmDialog
        open={!!deleting}
        title="Eliminar gasto"
        message={deleting ? `Se eliminará "${deleting.name}". Esta acción no se puede deshacer.` : undefined}
        confirmLabel="Eliminar"
        variant="danger"
        pending={delPending}
        onConfirm={confirmDelete}
        onCancel={() => setDeleting(null)}
      />
    </>
  );
}
