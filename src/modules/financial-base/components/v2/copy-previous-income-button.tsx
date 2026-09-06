"use client";

/**
 * "Traer mis recurrentes": materializa en el mes las fuentes de ingreso
 * recurrentes a las que les toca pago, según su ancla. Idempotente.
 *
 * Ya no copia del mes anterior —la agenda sale de las plantillas— y el botón lo
 * dice: un bimestral anclado en enero no tiene línea en febrero, así que
 * "copiar el mes anterior" describía mal lo que pasa y, peor, sugería que en
 * marzo no habría de dónde traerlo. Hoy es sobre todo un botón de rescate: la
 * materialización corre sola al cargar la Base y desde el cron diario.
 */
import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/ui/icon";
import { useToast } from "@/components/ui/toast";
import { ensureRecurringIncomeAction } from "@/modules/financial-base/api/v2-actions";

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
      const res = await ensureRecurringIncomeAction({ periodMonth, periodYear });
      if (res.ok) {
        const n = res.copied ?? 0;
        toast(
          n > 0
            ? `${n} fuente(s) recurrente(s) agendada(s)`
            : "Tus fuentes recurrentes de este mes ya están al día",
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
      <Icon name="repeat" width={2} /> Traer mis recurrentes
    </button>
  );
}
