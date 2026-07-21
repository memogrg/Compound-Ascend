"use client";

import { useState } from "react";

import { BottomSheet, FormShell, MoneyField } from "../../components/form-kit";
import { setDesiredLifestyleAction } from "@/modules/wealth/api/actions";

/**
 * CTA móvil para definir/editar el estilo de vida DESEADO mensual — el insumo del
 * número de libertad. Abre un BottomSheet con un solo MoneyField y reusa la Server
 * Action setDesiredLifestyleAction (misma que web); al guardar, la acción persiste
 * el dato personal y revalida /m/libertad, así la escalera repinta con el número
 * calculado por el motor. La UI no calcula nada: solo captura el gasto deseado.
 */
export function DefineLifestyleSheet({
  currency,
  current,
  label,
  variant = "m-btn-primary",
}: {
  currency: string;
  current?: number | null;
  label: string;
  variant?: "m-btn-primary" | "m-btn-secondary" | "m-btn-ghost";
}) {
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState<number | undefined>(current ?? undefined);
  const editing = current != null && current > 0;

  return (
    <>
      <button
        type="button"
        className={`m-btn ${variant}`}
        style={{ minHeight: 44 }}
        onClick={() => setOpen(true)}
      >
        {label}
      </button>
      <BottomSheet
        open={open}
        onClose={() => setOpen(false)}
        title={editing ? "Editar estilo de vida" : "Definir tu estilo de vida"}
      >
        <p className="muted" style={{ fontSize: 13, lineHeight: 1.5, margin: "0 0 12px" }}>
          El gasto mensual de la vida que querés vivir —lo esencial más lo que la hace rica
          (viajes, hobbies, generosidad). Con él calculamos tu Número de Libertad.
        </p>
        <FormShell
          action={(v: { amount: number | undefined }) =>
            setDesiredLifestyleAction(v.amount != null && v.amount > 0 ? v.amount : null)
          }
          values={{ amount }}
          submitLabel="Guardar"
          successMessage="Estilo de vida guardado"
          onSuccess={() => setOpen(false)}
        >
          <MoneyField
            name="amount"
            label="Gasto mensual deseado"
            value={amount}
            onChange={setAmount}
            currency={currency}
          />
        </FormShell>
      </BottomSheet>
    </>
  );
}
