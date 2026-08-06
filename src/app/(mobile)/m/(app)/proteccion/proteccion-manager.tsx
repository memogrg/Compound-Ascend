"use client";

/**
 * CRUD de PÓLIZAS en /m/proteccion, mismo molde que /m/ingresos: reutiliza las Server
 * Actions de wealth (add/edit/removePolicyAction) sin duplicar lógica. Form Kit:
 *  - FAB → alta (addPolicyAction); SwipeRow → Editar (editPolicyAction) / Eliminar
 *    (removePolicyAction) con ConfirmDialog. es-MX, tema claro.
 */
import { useState } from "react";
import { useRouter } from "next/navigation";

import {
  addPolicyAction,
  editPolicyAction,
  removePolicyAction,
  payPolicyPremiumAction,
} from "@/modules/wealth/api/actions";
import type { InsurancePolicy } from "@/modules/wealth/types";
import { formatMoney } from "@/lib/format";
import { useCaptureToday } from "@/components/tz/timezone-context";

import {
  Fab,
  BottomSheet,
  PlusChoiceSheet,
  SwipeRow,
  ConfirmDialog,
  FormShell,
  MoneyField,
  DateField,
  useToast,
  type ActionResult,
} from "../../components/form-kit";
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

export function ProteccionManager({ policies }: { policies: InsurancePolicy[] }) {
  const router = useRouter();
  const toast = useToast();
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<InsurancePolicy | null>(null);
  const [deleting, setDeleting] = useState<InsurancePolicy | null>(null);
  const [delPending, setDelPending] = useState(false);
  // El "+" contextual: elección (pagar prima / crear) → picker de póliza → PremiumForm.
  const [plusOpen, setPlusOpen] = useState(false);
  const [picking, setPicking] = useState(false);
  const [paying, setPaying] = useState<InsurancePolicy | null>(null);

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
            const premStr = pol.premium
              ? `${mAmount(pol.premium, pol.currency, 8)}/${suffix}`
              : null;
            // Valor (derecha) = la SUMA ASEGURADA: en una pantalla de defensa, cuánto estás
            // protegido es EL número. Si no hay cobertura, cae a la prima.
            // Subtítulo: prima PRIMERO (así sobrevive a la elipsis), aseguradora después
            // (un nombre, trunca sin perder info clave). El vencimiento no cabe con tres
            // piezas a 375px → vive en la métrica "Próximo vencimiento", medido.
            const value = pol.coverage
              ? mAmount(pol.coverage, pol.currency, 10)
              : (premStr ?? undefined);
            const subParts = (
              pol.coverage
                ? [premStr, pol.provider || null, pol.fundingReference || null]
                : [pol.provider || null, pol.fundingReference || null]
            ).filter(Boolean);
            return (
              <SwipeRow
                key={pol.id}
                onEdit={() => setEditing(pol)}
                onDelete={() => setDeleting(pol)}
              >
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

      {/* Sin pólizas aún no hay a cuál pagar → el "+" va directo a crear. Con al menos una,
          ofrece la elección: pagar una prima o crear un seguro nuevo. */}
      <Fab
        onClick={() => (policies.length === 0 ? setAdding(true) : setPlusOpen(true))}
        label={policies.length === 0 ? "Añadir póliza" : "Pagar prima o crear seguro"}
      />

      {/* El "+" contextual: pagar una prima a un seguro existente o crear uno nuevo. */}
      <PlusChoiceSheet
        open={plusOpen}
        onClose={() => setPlusOpen(false)}
        title="Defensa patrimonial"
        options={[
          {
            key: "prima",
            label: "Pagar una prima a un seguro",
            desc: "Registra el pago de una póliza que ya tienes",
            onSelect: () => setPicking(true),
          },
          {
            key: "crear",
            label: "Crear un seguro nuevo",
            desc: "Registra una póliza nueva",
            onSelect: () => setAdding(true),
          },
        ]}
      />

      {/* Pagar prima · paso 1: elegir el seguro → abre el PremiumForm en su moneda. */}
      <PolicyPickerSheet
        open={picking}
        policies={policies}
        onPick={(pol) => {
          setPicking(false);
          setPaying(pol);
        }}
        onClose={() => setPicking(false)}
      />

      {/* Pagar prima · paso 2: el importe (en la moneda de la póliza) + fecha. */}
      <BottomSheet open={!!paying} onClose={() => setPaying(null)} title="Pagar prima">
        {paying ? <PremiumForm policy={paying} onSuccess={() => setPaying(null)} /> : null}
      </BottomSheet>

      {/* Alta */}
      <BottomSheet open={adding} onClose={() => setAdding(false)} title="Añadir póliza">
        <PolicyForm
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

// ── Pagar una prima a un seguro EXISTENTE (el "+" contextual, Fase 3b) ──────────
// Paso 1: elegir cuál. Calca los pickers de las fases previas: cada seguro con su prima en su
// moneda. Al elegir, abre el PremiumForm.
export function PolicyPickerSheet({
  open,
  policies,
  onPick,
  onClose,
}: {
  open: boolean;
  policies: InsurancePolicy[];
  onPick: (policy: InsurancePolicy) => void;
  onClose: () => void;
}) {
  return (
    <BottomSheet open={open} onClose={onClose} title="¿A cuál seguro?">
      {policies.length === 0 ? (
        <div className="muted" style={{ fontSize: 13, lineHeight: 1.5, padding: "4px 2px 8px" }}>
          No tienes seguros registrados. Crea uno primero.
        </div>
      ) : (
        <div className="m-optlist">
          {policies.map((pol) => {
            const label = POLICY_LABEL[pol.policyType] ?? "Cobertura";
            const name = pol.provider ? `${label} · ${pol.provider}` : label;
            const suffix = FREQ_SUFFIX[pol.premiumFrequency ?? "anual"] ?? "año";
            return (
              <button
                key={pol.id}
                type="button"
                className="m-opt"
                onClick={() => {
                  onClose();
                  onPick(pol);
                }}
              >
                <span>
                  <span className="m-opt-t">{name}</span>
                  {pol.premium ? (
                    <span className="m-opt-d">
                      {formatMoney(pol.premium, pol.currency)}/{suffix}
                    </span>
                  ) : null}
                </span>
              </button>
            );
          })}
        </div>
      )}
    </BottomSheet>
  );
}

// Paso 2: el pago, ligero. Importe SIEMPRE en la moneda de la póliza (prefijado con su prima;
// la moneda no es editable) + fecha. Guarda vía payPolicyPremiumAction (una transacción
// vinculada; la moneda la valida el servidor contra la póliza).
export function PremiumForm({
  policy,
  onSuccess,
}: {
  policy: InsurancePolicy;
  onSuccess: () => void;
}) {
  const todayISO = useCaptureToday();
  const label = POLICY_LABEL[policy.policyType] ?? "Cobertura";
  const name = policy.provider ? `${label} · ${policy.provider}` : label;
  const cur = policy.currency;
  const [amount, setAmount] = useState<number | undefined>(policy.premium ?? undefined);
  const [date, setDate] = useState(todayISO());

  const action = (v: { amount: number | undefined; paymentDate: string }): Promise<ActionResult> =>
    payPolicyPremiumAction({
      policyId: policy.id,
      amount: v.amount,
      currency: cur,
      paymentDate: v.paymentDate,
      policyName: name,
    });

  return (
    <FormShell
      action={action}
      values={{ amount, paymentDate: date }}
      submitLabel="Registrar prima"
      successMessage="Prima registrada"
      onSuccess={onSuccess}
    >
      <div className="muted" style={{ fontSize: 12.5, lineHeight: 1.5 }}>
        Se registra como <strong>gasto vinculado</strong> a {label}, en {cur}.
      </div>
      <MoneyField
        name="amount"
        label="Monto de la prima"
        value={amount}
        onChange={setAmount}
        currency={cur}
      />
      <DateField name="paymentDate" label="Fecha del pago" value={date} onChange={setDate} />
    </FormShell>
  );
}
