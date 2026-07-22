"use client";

/**
 * CRUD de PÓLIZAS en /m/proteccion, mismo molde que /m/ingresos: reutiliza las Server
 * Actions de wealth (add/edit/removePolicyAction) sin duplicar lógica. Form Kit:
 *  - FAB → alta (addPolicyAction); SwipeRow → Editar (editPolicyAction) / Eliminar
 *    (removePolicyAction) con ConfirmDialog. es-MX, tema claro.
 */
import { useState } from "react";
import { useRouter } from "next/navigation";

import { addPolicyAction, editPolicyAction, removePolicyAction } from "@/modules/wealth/api/actions";
import type { InsurancePolicy } from "@/modules/wealth/types";

import { Fab, BottomSheet, SwipeRow, ConfirmDialog, useToast } from "../../components/form-kit";
import type { MIconName } from "../../components/m-icon";
import { MContentCard, MDataRow, MEmptyState, mAmount } from "../../components/content-kit";
import { PolicyForm, type PolicyValues } from "./policy-form";

const POLICY_LABEL: Record<string, string> = {
  medico: "Protección médica",
  gastos_mayores: "Gastos médicos mayores",
  gastos_menores: "Gastos médicos menores",
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

/** Glifo por tipo de póliza: salud, vida, hogar, vehículo… El del set más cercano; el
 *  resto cae al escudo genérico de protección. */
const POLICY_ICON: Record<string, MIconName> = {
  medico: "health",
  gastos_mayores: "health",
  gastos_menores: "health",
  vida: "protection",
  incapacidad: "protection",
  hogar: "housing",
  vehiculo: "transport",
  patrimonial: "protection",
  empresarial: "protection",
  familiar: "household",
  otro: "protection",
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
    fundingReference: p.fundingReference ?? undefined,
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
        <MEmptyState
          icon="protection"
          title="Protege tu patrimonio"
          description="Registra tus seguros —salud, vida, auto, hogar— y verás de un vistazo cuánto cubres, cuánto pagas y qué te falta blindar."
          actionLabel="Registrar una póliza"
          onAction={() => setAdding(true)}
        />
      ) : (
        // padding 0: la fila va a sangre para que el gesto revele Editar/Eliminar; el aire
        // lateral lo pone la regla puente .m-swipe-content .m-drow. Los montos van en la
        // moneda NATIVA de cada póliza (pol.currency): la lista es por-ítem, no un agregado.
        <MContentCard style={{ padding: 0, overflow: "hidden" }}>
          {policies.map((pol) => {
            const label = POLICY_LABEL[pol.policyType] ?? "Cobertura";
            const suffix = FREQ_SUFFIX[pol.premiumFrequency ?? "anual"] ?? "año";
            const premStr = pol.premium ? `${mAmount(pol.premium, pol.currency, 8)}/${suffix}` : null;
            // Valor (derecha) = la SUMA ASEGURADA: en una pantalla de defensa, cuánto estás
            // protegido es EL número. Si no hay cobertura, cae a la prima.
            // Subtítulo: prima PRIMERO (así sobrevive a la elipsis), aseguradora después
            // (un nombre, trunca sin perder info clave). El vencimiento no cabe con tres
            // piezas a 375px → vive en la métrica "Próximo vencimiento", medido.
            const value = pol.coverage ? mAmount(pol.coverage, pol.currency, 10) : (premStr ?? undefined);
            const subParts = (
              pol.coverage
                ? [premStr, pol.provider || null, pol.fundingReference || null]
                : [pol.provider || null, pol.fundingReference || null]
            ).filter(Boolean);
            return (
              <SwipeRow key={pol.id} onEdit={() => setEditing(pol)} onDelete={() => setDeleting(pol)}>
                {/* icon (no leading): los tipos de póliza SON glifos del set. Sin tinte
                    semántico: un seguro no es "bueno/malo", es cobertura → tinte de marca. */}
                <MDataRow
                  icon={POLICY_ICON[pol.policyType] ?? "protection"}
                  title={label}
                  subtitle={subParts.length > 0 ? subParts.join(" · ") : "Sin datos"}
                  value={value}
                />
              </SwipeRow>
            );
          })}
        </MContentCard>
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
