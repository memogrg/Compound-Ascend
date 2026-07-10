"use client";

/**
 * CRUD de PÓLIZAS en /m/proteccion, mismo molde que /m/ingresos: reutiliza las Server
 * Actions de wealth (add/edit/removePolicyAction) sin duplicar lógica. Form Kit:
 *  - FAB → alta (addPolicyAction); SwipeRow → Editar (editPolicyAction) / Eliminar
 *    (removePolicyAction) con ConfirmDialog. es-MX, tema claro.
 */
import { useState } from "react";
import { useRouter } from "next/navigation";

import { formatMoney, formatCompact } from "@/lib/format";
import { addPolicyAction, editPolicyAction, removePolicyAction } from "@/modules/wealth/api/actions";
import type { InsurancePolicy } from "@/modules/wealth/types";

import { Fab, BottomSheet, SwipeRow, ConfirmDialog, useToast } from "../../components/form-kit";
import { PolicyForm, type PolicyValues } from "./policy-form";

const POLICY_LABEL: Record<string, string> = {
  medico: "Protección médica",
  vida: "Protección de vida",
  incapacidad: "Protección por incapacidad",
  hogar: "Protección del hogar",
  vehiculo: "Vehículo",
  patrimonial: "Patrimonial",
  empresarial: "Empresarial",
  familiar: "Familiar",
  otro: "Otra cobertura",
};
const FREQ_SUFFIX: Record<string, string> = {
  mensual: "mes",
  trimestral: "trim",
  semestral: "sem",
  anual: "año",
};

/** InsurancePolicy → valores del form de edición (mismo shape que el modal web). */
function toValues(p: InsurancePolicy): PolicyValues {
  return {
    policyType: p.policyType,
    provider: p.provider ?? undefined,
    coverage: p.coverage ?? undefined,
    premium: p.premium ?? undefined,
    premiumFrequency: p.premiumFrequency ?? "mensual",
    currency: p.currency,
  };
}

export function ProteccionManager({
  policies,
  currency,
}: {
  policies: InsurancePolicy[];
  currency: string;
}) {
  const router = useRouter();
  const toast = useToast();
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<InsurancePolicy | null>(null);
  const [deleting, setDeleting] = useState<InsurancePolicy | null>(null);
  const [delPending, setDelPending] = useState(false);

  const confirmDelete = async () => {
    if (!deleting) return;
    setDelPending(true);
    const res = await removePolicyAction(deleting.id);
    setDelPending(false);
    if (res.ok) {
      toast.show("Póliza eliminada", "success");
      setDeleting(null);
      router.refresh();
    } else {
      toast.show(res.message ?? "No se pudo eliminar.", "error");
    }
  };

  return (
    <>
      {policies.length === 0 ? (
        <div className="card card-p">
          <div className="muted" style={{ padding: "12px 0", fontSize: 13.5, lineHeight: 1.5 }}>
            Aún no registras pólizas. Toca el botón + para agregar tu primera cobertura.
          </div>
        </div>
      ) : (
        <div className="card" style={{ padding: 0 }}>
          {policies.map((pol) => {
            const label = POLICY_LABEL[pol.policyType] ?? "Cobertura";
            const suffix = FREQ_SUFFIX[pol.premiumFrequency ?? "anual"] ?? "año";
            return (
              <SwipeRow key={pol.id} onEdit={() => setEditing(pol)} onDelete={() => setDeleting(pol)}>
                <div className="lrow" style={{ margin: 0 }}>
                  <span className="lic" style={{ background: "var(--accent-soft)", color: "var(--accent)" }} aria-hidden>
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round">
                      <path d="M12 3l7 3v6c0 4-3 7-7 9-4-2-7-5-7-9V6Z" />
                    </svg>
                  </span>
                  <div style={{ minWidth: 0 }}>
                    <div className="lname">{label}</div>
                    <div className="lsub">
                      {pol.provider ?? "—"}
                      {pol.coverage ? ` · ${formatCompact(pol.coverage, pol.currency)} cobertura` : ""}
                    </div>
                  </div>
                  {pol.premium ? (
                    <div className="lamt" style={{ marginLeft: "auto" }}>
                      {formatMoney(pol.premium, pol.currency)}/{suffix}
                    </div>
                  ) : null}
                </div>
              </SwipeRow>
            );
          })}
        </div>
      )}

      <Fab onClick={() => setAdding(true)} label="Añadir póliza" />

      {/* Alta */}
      <BottomSheet open={adding} onClose={() => setAdding(false)} title="Añadir póliza">
        <PolicyForm
          currency={currency}
          action={addPolicyAction}
          submitLabel="Guardar póliza"
          successMessage="Póliza agregada"
          onSuccess={() => setAdding(false)}
        />
      </BottomSheet>

      {/* Edición */}
      <BottomSheet open={!!editing} onClose={() => setEditing(null)} title="Editar póliza">
        {editing ? (
          <PolicyForm
            currency={currency}
            initial={toValues(editing)}
            action={(v: PolicyValues) => editPolicyAction(editing.id, v)}
            submitLabel="Guardar cambios"
            successMessage="Póliza actualizada"
            onSuccess={() => setEditing(null)}
          />
        ) : null}
      </BottomSheet>

      {/* Eliminación */}
      <ConfirmDialog
        open={!!deleting}
        title="Eliminar póliza"
        message={
          deleting
            ? `Se eliminará "${POLICY_LABEL[deleting.policyType] ?? "esta cobertura"}". Esta acción no se puede deshacer.`
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
