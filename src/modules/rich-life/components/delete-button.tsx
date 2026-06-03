"use client";

import { ConfirmDeleteButton } from "@/components/ui/confirm-delete-button";
import { removeAssetAction, removeLiabilityAction } from "@/modules/rich-life/api/actions";

/** Botón de borrado (activo/pasivo), con confirmación. */
export function DeleteButton({ id, kind }: { id: string; kind: "asset" | "liability" }) {
  return (
    <ConfirmDeleteButton
      noun={kind === "asset" ? "este activo" : "este pasivo"}
      onConfirm={() => (kind === "asset" ? removeAssetAction(id) : removeLiabilityAction(id))}
    />
  );
}
