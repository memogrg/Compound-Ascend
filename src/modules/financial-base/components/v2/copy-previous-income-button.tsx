"use client";

/**
 * "Copiar ingresos del mes anterior" (Fase 2): trae al mes actual solo las
 * fuentes de ingreso recurrentes del mes previo. Idempotente (no duplica).
 */
import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/ui/icon";
import { useToast } from "@/components/ui/toast";
import { copyPreviousMonthIncomeAction } from "@/modules/financial-base/api/v2-actions";

export function CopyPreviousIncomeButton({
  periodMonth,
  periodYear,
}: {
  periodMonth: number;
  periodYear: number;
}) {
  const router = useRouter();
  const toast = useToast();
  const [pending, startTransition] = useTransition();

  const onClick = () =>
    startTransition(async () => {
      const res = await copyPreviousMonthIncomeAction({ periodMonth, periodYear });
      if (res.ok) {
        const n = res.copied ?? 0;
        toast(
          n > 0
            ? `${n} fuente(s) recurrente(s) copiada(s)`
            : "No hay fuentes recurrentes nuevas que copiar",
        );
        router.refresh();
      } else toast(res.message ?? "No se pudo copiar", "error");
    });

  return (
    <button
      type="button"
      className="btn btn-ghost"
      style={{ padding: "8px 14px" }}
      onClick={onClick}
      disabled={pending}
    >
      <Icon name="repeat" width={2} /> Copiar mes anterior
    </button>
  );
}
