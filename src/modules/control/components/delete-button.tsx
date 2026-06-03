"use client";

import { ConfirmDeleteButton } from "@/components/ui/confirm-delete-button";
import { removeGoalAction, removeDebtAction } from "@/modules/control/api/actions";

/** Botón de borrado (objetivo/deuda), con confirmación. */
export function DeleteButton({ id, kind }: { id: string; kind: "goal" | "debt" }) {
  return (
    <ConfirmDeleteButton
      noun={kind === "goal" ? "este objetivo" : "esta deuda"}
      onConfirm={() => (kind === "goal" ? removeGoalAction(id) : removeDebtAction(id))}
    />
  );
}
