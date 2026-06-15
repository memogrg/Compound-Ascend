"use client";

/** Botón "Registrar ingreso" del toolbar (abre el modal simplificado · Fase 1). */
import { useState } from "react";
import { Icon } from "@/components/ui/icon";
import { RegisterIncomeModal } from "@/modules/financial-base/components/v2/register-income-modal";

export function RegisterIncomeButton({ currency }: { currency: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        className="btn btn-secondary"
        style={{ padding: "8px 14px" }}
        onClick={() => setOpen(true)}
      >
        <Icon name="plus" width={2} /> Registrar ingreso
      </button>
      {open ? <RegisterIncomeModal currency={currency} onClose={() => setOpen(false)} /> : null}
    </>
  );
}
