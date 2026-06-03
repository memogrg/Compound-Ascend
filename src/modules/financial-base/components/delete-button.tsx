"use client";

import { ConfirmDeleteButton } from "@/components/ui/confirm-delete-button";
import { removeIncomeAction, removeExpenseAction } from "@/modules/financial-base/api/actions";

/** Botón de borrado de un ítem (ingreso/gasto), con confirmación. */
export function DeleteButton({ id, kind }: { id: string; kind: "income" | "expense" }) {
  return (
    <ConfirmDeleteButton
      noun={kind === "income" ? "este ingreso" : "este gasto"}
      onConfirm={() => (kind === "income" ? removeIncomeAction(id) : removeExpenseAction(id))}
    />
  );
}
