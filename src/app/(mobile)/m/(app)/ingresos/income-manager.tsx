"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import {
  addIncomeAction,
  editIncomeAction,
  removeIncomeAction,
} from "@/modules/financial-base/api/actions";
import type { IncomeSource } from "@/modules/financial-base";
import { formatMoney } from "@/lib/format";

import { Fab, BottomSheet, SwipeRow, ConfirmDialog, useToast } from "../../components/form-kit";
import { IncomeForm, type IncomeValues } from "./income-form";

/**
 * CRUD de fuentes de ingreso en /m/ingresos, cableado 100% al Form Kit y a las Server
 * Actions existentes (add/edit/removeIncomeAction + incomeInputSchema):
 *  - FAB → hoja de ALTA (addIncomeAction).
 *  - SwipeRow → Editar (hoja precargada → editIncomeAction) / Eliminar (ConfirmDialog
 *    destructivo → removeIncomeAction).
 * pending/errores/toast/refresh los maneja FormShell; el borrado (una acción sin form)
 * se maneja aquí con toast + router.refresh(). es-MX, tema claro.
 */

const TYPE_LABEL: Record<string, string> = {
  activo: "Activo",
  pasivo: "Pasivo",
  extraordinario: "Extraordinario",
};

export function IncomeManager({ sources, currency }: { sources: IncomeSource[]; currency: string }) {
  const router = useRouter();
  const toast = useToast();
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<IncomeSource | null>(null);
  const [deleting, setDeleting] = useState<IncomeSource | null>(null);
  const [delPending, setDelPending] = useState(false);

  const confirmDelete = async () => {
    if (!deleting) return;
    setDelPending(true);
    const res = await removeIncomeAction(deleting.id);
    setDelPending(false);
    if (res.ok) {
      toast.show("Ingreso eliminado", "success");
      setDeleting(null);
      router.refresh();
    } else {
      toast.show("No se pudo eliminar.", "error");
    }
  };

  return (
    <>
      <div className="card">
        {sources.length === 0 ? (
          <div className="muted" style={{ padding: "16px 18px", fontSize: 13.5, lineHeight: 1.5 }}>
            Aún no registras fuentes de ingreso. Toca el botón + para agregar la primera.
          </div>
        ) : (
          sources.map((s) => {
            const passive = s.incomeType === "pasivo";
            return (
              <SwipeRow key={s.id} onEdit={() => setEditing(s)} onDelete={() => setDeleting(s)}>
                <div className="lrow">
                  <span
                    className="lic"
                    style={{ background: "var(--accent-soft)", color: "var(--accent)" }}
                    aria-hidden
                  >
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round">
                      {passive ? (
                        <>
                          <path d="M4 11l8-6 8 6" />
                          <path d="M6 10v9h12v-9" />
                        </>
                      ) : (
                        <>
                          <rect x="2" y="7" width="20" height="14" rx="2" />
                          <path d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                        </>
                      )}
                    </svg>
                  </span>
                  <div style={{ minWidth: 0 }}>
                    <div className="lname">{s.name}</div>
                    <div className="lsub">
                      <span className="schip">{s.frequency.toUpperCase()}</span> ·{" "}
                      {TYPE_LABEL[s.incomeType] ?? s.incomeType}
                    </div>
                  </div>
                  <div className="lamt pos">+{formatMoney(s.amountMonthly, s.currency)}</div>
                </div>
              </SwipeRow>
            );
          })
        )}
      </div>

      <Fab onClick={() => setAdding(true)} label="Agregar ingreso" />

      {/* Alta */}
      <BottomSheet open={adding} onClose={() => setAdding(false)} title="Nuevo ingreso">
        <IncomeForm
          currency={currency}
          action={addIncomeAction}
          submitLabel="Guardar ingreso"
          successMessage="Ingreso agregado"
          onSuccess={() => setAdding(false)}
        />
      </BottomSheet>

      {/* Edición (precargada desde la fuente) */}
      <BottomSheet open={!!editing} onClose={() => setEditing(null)} title="Editar ingreso">
        {editing ? (
          <IncomeForm
            currency={currency}
            initial={{
              name: editing.name,
              amount: editing.amount,
              incomeType: editing.incomeType,
              frequency: editing.frequency,
              currency: editing.currency,
            }}
            action={(v: IncomeValues) => editIncomeAction(editing.id, v)}
            submitLabel="Guardar cambios"
            successMessage="Ingreso actualizado"
            onSuccess={() => setEditing(null)}
          />
        ) : null}
      </BottomSheet>

      {/* Eliminación */}
      <ConfirmDialog
        open={!!deleting}
        title="Eliminar ingreso"
        message={
          deleting
            ? `Se eliminará "${deleting.name}". Esta acción no se puede deshacer.`
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
