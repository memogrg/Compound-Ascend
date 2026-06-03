"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CURRENCIES } from "@/modules/personal-profile/constants";
import { updateCurrencyAction } from "@/modules/account/api/actions";

export function CurrencySelector({ current }: { current: string }) {
  const router = useRouter();
  const [value, setValue] = useState(current);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const onChange = async (code: string) => {
    setValue(code);
    setBusy(true);
    setMsg(null);
    const res = await updateCurrencyAction(code);
    setBusy(false);
    if (res.ok) {
      setMsg("Moneda actualizada.");
      router.refresh();
    } else {
      setValue(current);
      setMsg(res.message ?? "No se pudo cambiar.");
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
      {msg ? (
        <div className="muted" style={{ fontSize: 12, marginTop: 8 }}>
          {msg}
        </div>
      ) : null}
    </div>
  );
}
