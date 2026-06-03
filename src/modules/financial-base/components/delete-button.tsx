"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/ui/icon";
import { useToast } from "@/components/ui/toast";
import { removeIncomeAction, removeExpenseAction } from "@/modules/financial-base/api/actions";

/** Botón de borrado de un ítem (ingreso/gasto). */
export function DeleteButton({ id, kind }: { id: string; kind: "income" | "expense" }) {
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  const toast = useToast();

  const onClick = () => {
    startTransition(async () => {
      const res = kind === "income" ? await removeIncomeAction(id) : await removeExpenseAction(id);
      if (res.ok) {
        toast("Eliminado");
        router.refresh();
      }
    });
  };

  return (
    <button
      className="icon-btn"
      style={{ width: 30, height: 30 }}
      aria-label="Eliminar"
      title="Eliminar"
      onClick={onClick}
      disabled={pending}
    >
      <Icon name="x" width={2} />
    </button>
  );
}
