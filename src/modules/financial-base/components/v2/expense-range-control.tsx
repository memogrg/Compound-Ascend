"use client";

/**
 * Segmented control de rango (1m/3m/6m/YTD/All) que scopea SOLO las 4 cards y
 * las 2 gráficas de Gastos. Hace router.push(?range=…) preservando el resto de
 * params (p.ej. ?asOf de los frascos). Usa las clases .seg/.seg-btn del design
 * system; la explicación va en un tooltip "?" (no en párrafo inline).
 */
import { useRouter, usePathname, useSearchParams } from "next/navigation";

const OPTIONS: { value: string; label: string }[] = [
  { value: "1m", label: "1m" },
  { value: "3m", label: "3m" },
  { value: "6m", label: "6m" },
  { value: "ytd", label: "YTD" },
  { value: "all", label: "All" },
];

export function ExpenseRangeControl({ current }: { current: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const go = (value: string) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set("range", value);
    const hash = typeof window !== "undefined" ? window.location.hash : "";
    router.push(`${pathname}?${params.toString()}${hash}`);
  };

  return (
    <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
      <span
        className="tip"
        data-tip="Filtra las 4 tarjetas y las 2 gráficas. No afecta los frascos."
        style={{
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          width: 16,
          height: 16,
          borderRadius: "50%",
          border: "1px solid var(--line)",
          color: "var(--muted)",
          fontSize: 10.5,
          fontWeight: 700,
        }}
      >
        ?
      </span>
      <div className="seg" role="group" aria-label="Rango de cards y gráficas">
        {OPTIONS.map((o) => (
          <button
            key={o.value}
            type="button"
            className={`seg-btn${current === o.value ? " on" : ""}`}
            aria-pressed={current === o.value}
            onClick={() => go(o.value)}
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}
