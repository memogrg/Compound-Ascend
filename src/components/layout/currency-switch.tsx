"use client";

/**
 * Switch rápido de moneda de visualización en el topbar. Cambia cómo se MUESTRAN
 * los totales de los dashboards (vía cookie), sin tocar la moneda principal ni
 * los datos. La app convierte con el tipo de cambio en vivo.
 */
import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { setDisplayCurrencyAction } from "@/modules/account/api/actions";

const CODES = ["CRC", "USD", "EUR", "MXN", "COP", "GBP"] as const;
const SYMBOL: Record<string, string> = {
  CRC: "₡",
  USD: "$",
  EUR: "€",
  MXN: "MX$",
  COP: "COL$",
  GBP: "£",
};

export function CurrencySwitch({ current, primary }: { current: string; primary: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const onChange = (code: string) =>
    startTransition(async () => {
      await setDisplayCurrencyAction(code);
      router.refresh();
    });

  return (
    <label className="cur-switch" title="Moneda en que ves tus dashboards">
      <span className="cur-switch-ic" aria-hidden>
        {SYMBOL[current] ?? "¤"}
      </span>
      <select
        value={CODES.includes(current as (typeof CODES)[number]) ? current : "CRC"}
        onChange={(e) => onChange(e.target.value)}
        disabled={pending}
        aria-label="Moneda de visualización"
      >
        {CODES.map((c) => (
          <option key={c} value={c}>
            {c}
            {c === primary ? " (principal)" : ""}
          </option>
        ))}
      </select>
    </label>
  );
}
