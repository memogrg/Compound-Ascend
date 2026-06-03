"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CURRENCIES } from "@/modules/personal-profile/constants";
import { updateCurrencyAction } from "@/modules/account/api/actions";
import { useToast } from "@/components/ui/toast";

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
    <div className="card card-pad">
      <div className="card-title">Moneda principal</div>
      <p className="muted" style={{ fontSize: 12.5, marginTop: 6, lineHeight: 1.5 }}>
        Se usa para mostrar tus cifras y como predeterminada al agregar ítems nuevos.
      </p>
      <select
        className="sel"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={busy}
        style={{ marginTop: 12, maxWidth: 240 }}
      >
        {CURRENCIES.map((c) => (
          <option key={c.value} value={c.value}>
            {c.label}
          </option>
        ))}
      </select>
    </div>
  );
}
