"use client";

import { ConfirmDeleteButton } from "@/components/ui/confirm-delete-button";
import { removeInvestmentAction, removePolicyAction } from "@/modules/wealth/api/actions";

/** Botón de borrado (inversión/póliza), con confirmación. */
export function DeleteButton({ id, kind }: { id: string; kind: "investment" | "policy" }) {
  return (
    <ConfirmDeleteButton
      noun={kind === "investment" ? "esta inversión" : "esta póliza"}
      onConfirm={() => (kind === "investment" ? removeInvestmentAction(id) : removePolicyAction(id))}
    />
  );
}
