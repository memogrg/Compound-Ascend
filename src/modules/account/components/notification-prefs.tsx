"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { updateNotificationPrefAction } from "@/modules/account/api/actions";
import { useToast } from "@/components/ui/toast";
import type { NotificationPrefs, NotificationChannel } from "@/lib/notifications/preferences";

type Row = {
  key: NotificationChannel;
  label: string;
  hint: string;
  disabled?: boolean;
  badge?: string;
};

const ROWS: Row[] = [
  { key: "inApp", label: "En la app", hint: "Avisos del día en “Qué noté”." },
  { key: "email", label: "Correo", hint: "Resumen semanal por correo." },
  { key: "whatsapp", label: "WhatsApp", hint: "Resumen semanal (si vinculaste tu WhatsApp)." },
  {
    key: "push",
    label: "Notificaciones push",
    hint: "Avisos en tu dispositivo.",
    disabled: true,
    badge: "Próximamente",
  },
];

/** Filas de canales con switch v2 (cuerpo de su set-row). */
export function NotificationPrefs({ prefs }: { prefs: NotificationPrefs }) {
  const router = useRouter();
  const toast = useToast();
  const [state, setState] = useState<NotificationPrefs>(prefs);
  const [busy, setBusy] = useState<NotificationChannel | null>(null);

  const toggle = async (key: NotificationChannel, next: boolean) => {
    setState((s) => ({ ...s, [key]: next }));
    setBusy(key);
    const res = await updateNotificationPrefAction(key, next);
    setBusy(null);
    if (res.ok) {
      toast(next ? "Canal activado" : "Canal desactivado");
      router.refresh();
    } else {
      setState((s) => ({ ...s, [key]: !next })); // revertir
      toast(res.message ?? "No se pudo guardar", "error");
    }
  };

  return (
    <div>
      {ROWS.map((r) => (
        <div key={r.key} className={`notif${r.disabled ? " dis" : ""}`}>
          <div>
            <div className="nt">
              {r.label}
              {r.badge ? <span className="badge-soon">{r.badge}</span> : null}
            </div>
            <div className="nd">{r.hint}</div>
          </div>
          <label className="sw-toggle">
            <input
              type="checkbox"
              checked={state[r.key]}
              disabled={r.disabled || busy === r.key}
              aria-label={r.label}
              onChange={(e) => toggle(r.key, e.target.checked)}
            />
            <span className="tr" />
          </label>
        </div>
      ))}
    </div>
  );
}
