"use client";

/**
 * Navegador de mes (móvil) para Transacciones. `‹ label ›` que cambia `?period=YYYY-MM` con el
 * MISMO mecanismo que el PeriodSelector web (router.replace + scroll:false; el server re-consulta
 * ese período). Reusa los helpers PUROS de período (previous/nextMonthPeriod, monthParam) — sin
 * aritmética de fechas propia. `canNext=false` bloquea ir más allá del mes actual (sin futuros).
 */
import { useTransition } from "react";
import { useRouter, usePathname } from "next/navigation";
import {
  previousMonthPeriod,
  nextMonthPeriod,
  monthParam,
} from "@/modules/financial-base/engine/period";
import type { Period } from "@/modules/financial-base/types";

export function MonthNav({ period, canNext }: { period: Period; canNext: boolean }) {
  const router = useRouter();
  const pathname = usePathname();
  const [pending, startTransition] = useTransition();

  const go = (p: Period) =>
    startTransition(() => router.replace(`${pathname}?period=${monthParam(p)}`, { scroll: false }));

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 12,
        marginBottom: 14,
        opacity: pending ? 0.55 : 1,
      }}
      aria-busy={pending}
    >
      <button
        type="button"
        className="icon-btn"
        aria-label="Mes anterior"
        style={{ fontSize: 22, lineHeight: 1 }}
        onClick={() => go(previousMonthPeriod(period))}
      >
        ‹
      </button>
      <span
        style={{ fontWeight: 600, fontSize: 15, color: "var(--text)", textTransform: "capitalize" }}
      >
        {period.label}
      </span>
      <button
        type="button"
        className="icon-btn"
        aria-label="Mes siguiente"
        disabled={!canNext}
        style={{
          fontSize: 22,
          lineHeight: 1,
          opacity: canNext ? 1 : 0.4,
          cursor: canNext ? "pointer" : "not-allowed",
        }}
        onClick={() => canNext && go(nextMonthPeriod(period))}
      >
        ›
      </button>
    </div>
  );
}
