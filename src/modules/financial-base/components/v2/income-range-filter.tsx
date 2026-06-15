"use client";

/**
 * Filtro de rango del tab de Ingresos (Fase 1). Controla la ventana del
 * histórico y la agregación de los cuadros vía el searchParam `?range=`,
 * preservando el `?period=` actual. Estilo `.seg` del design system.
 */
import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { RANGE_OPTIONS, type RangeKey } from "@/modules/financial-base/engine/period";

export function IncomeRangeFilter({
  range,
  periodParam,
}: {
  range: RangeKey;
  periodParam: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const select = (value: RangeKey) => {
    if (value === range) return;
    startTransition(() => {
      router.push(`/ingresos?period=${periodParam}&range=${value}`);
    });
  };

  return (
    <div className="seg" role="tablist" aria-label="Rango del histórico">
      {RANGE_OPTIONS.map((o) => (
        <button
          key={o.value}
          type="button"
          role="tab"
          aria-selected={range === o.value}
          className={range === o.value ? "seg-btn on" : "seg-btn"}
          onClick={() => select(o.value)}
          disabled={pending}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
