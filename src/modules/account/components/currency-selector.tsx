"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CURRENCIES } from "@/modules/personal-profile/constants";
import { updateCurrencyAction } from "@/modules/account/api/actions";
import { useToast } from "@/components/ui/toast";

/** Selector de moneda principal (cuerpo de su set-row; el título vive en la página). */
export function CurrencySelector({ current }: { current: string }) {
  const router = useRouter();
  const toast = useToast();
  const [value, setValue] = useState(current);
  const [busy, setBusy] = useState(false);

  const onChange = async (code: string) => {
    setValue(code);
    setBusy(true);
    const res = await updateCurrencyAction(code);
    setBusy(false);
    if (res.ok) {
      toast("Moneda actualizada");
      router.refresh();
    } else {
      setValue(current);
      toast(res.message ?? "No se pudo cambiar la moneda", "error");
    }
  };

  return (
    <select
      className="sel"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      disabled={busy}
      aria-label="Moneda principal"
      style={{ maxWidth: 280 }}
    >
      {CURRENCIES.map((c) => (
        <option key={c.value} value={c.value}>
          {c.label}
        </option>
      ))}
    </select>
  );
}
