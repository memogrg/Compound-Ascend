"use client";

/** Botón "Registrar ingreso" del toolbar (abre el modal simplificado · Fase 1). */
import { useState } from "react";
import { Icon } from "@/components/ui/icon";
import { RegisterIncomeModal } from "@/modules/financial-base/components/v2/register-income-modal";
import type { CategoryNode } from "@/modules/financial-base/services/categories-service";

export function RegisterIncomeButton({
  incomeTree,
}: {
  incomeTree: CategoryNode[];
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        className="btn btn-primary"
        style={{ padding: "8px 14px" }}
        onClick={() => setOpen(true)}
      >
        <Icon name="plus" width={2} /> Registrar ingreso
      </button>
      {open ? (
        <RegisterIncomeModal
          incomeTree={incomeTree}
          onClose={() => setOpen(false)}
        />
      ) : null}
    </>
  );
}
