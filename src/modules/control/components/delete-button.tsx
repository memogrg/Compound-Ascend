"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/ui/icon";
import { removeGoalAction, removeDebtAction } from "@/modules/control/api/actions";

export function DeleteButton({ id, kind }: { id: string; kind: "goal" | "debt" }) {
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  const onClick = () =>
    startTransition(async () => {
      const res = kind === "goal" ? await removeGoalAction(id) : await removeDebtAction(id);
      if (res.ok) router.refresh();
    });
  return (
    <button
      className="icon-btn"
      style={{ width: 30, height: 30 }}
      aria-label="Eliminar"
      onClick={onClick}
      disabled={pending}
    >
      <Icon name="x" width={2} />
    </button>
  );
}
