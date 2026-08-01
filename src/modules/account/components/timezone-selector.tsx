"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import { saveUserTimezone } from "@/modules/account/api/actions";
import { useToast } from "@/components/ui/toast";

/** Lista de zonas IANA del navegador; si no está disponible, al menos la actual. */
function zoneOptions(current: string | null): string[] {
  try {
    const all = (
      Intl as unknown as { supportedValuesOf?: (key: string) => string[] }
    ).supportedValuesOf?.("timeZone");
    if (all && all.length) return all;
  } catch {
    // Intl.supportedValuesOf no soportado: se cae a la actual.
  }
  return current ? [current] : ["UTC"];
}

/**
 * Selector de zona horaria (cuerpo de su set-row; el título vive en la página). El
 * servidor calcula "hoy / mes actual" con esta zona; normalmente se captura sola del
 * dispositivo, y aquí el usuario puede fijarla a mano (p. ej. si viaja y prefiere su
 * zona de casa).
 */
export function TimezoneSelector({ current }: { current: string | null }) {
  const router = useRouter();
  const toast = useToast();
  const options = useMemo(() => zoneOptions(current), [current]);
  const [value, setValue] = useState(current ?? "");
  const [busy, setBusy] = useState(false);

  const onChange = async (tz: string) => {
    setValue(tz);
    setBusy(true);
    const res = await saveUserTimezone(tz);
    setBusy(false);
    if (res.ok) {
      // Cookie inmediata: el siguiente render server ya usa la nueva zona.
      document.cookie = `tz=${encodeURIComponent(tz)}; path=/; max-age=${60 * 60 * 24 * 365}; samesite=lax`;
      toast("Zona horaria actualizada");
      router.refresh();
    } else {
      setValue(current ?? "");
      toast(res.message ?? "No se pudo cambiar la zona horaria", "error");
    }
  };

  return (
    <select
      className="sel"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      disabled={busy}
      aria-label="Zona horaria"
      style={{ maxWidth: 280 }}
    >
      {value === "" ? (
        <option value="" disabled>
          Detectar automáticamente
        </option>
      ) : null}
      {options.map((z) => (
        <option key={z} value={z}>
          {z}
        </option>
      ))}
    </select>
  );
}
