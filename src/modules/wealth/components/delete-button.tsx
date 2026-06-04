"use client";

import { ConfirmDeleteButton } from "@/components/ui/confirm-delete-button";
import {
  removeInvestmentAction,
  removePolicyAction,
  removeHoldingAction,
} from "@/modules/wealth/api/actions";

type Kind = "investment" | "policy" | "holding";

const NOUNS: Record<Kind, string> = {
  investment: "esta inversión",
  policy: "esta póliza",
  holding: "esta posición",
};

/** Botón de borrado (inversión / póliza / posición), con confirmación. */
export function DeleteButton({ id, kind }: { id: string; kind: Kind }) {
  const onConfirm =
    kind === "holding"
      ? () => removeHoldingAction(id)
      : kind === "investment"
        ? () => removeInvestmentAction(id)
        : () => removePolicyAction(id);
  return <ConfirmDeleteButton noun={NOUNS[kind]} onConfirm={onConfirm} />;
}
