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
    <div className="card card-pad">
      <div className="card-title">Notificaciones</div>
      <p className="muted" style={{ fontSize: 12.5, marginTop: 6, lineHeight: 1.5 }}>
        Elige por dónde quieres recibir tu acompañamiento. Puedes apagar lo que no quieras.
      </p>
      <div style={{ marginTop: 14, display: "grid", gap: 12 }}>
        {ROWS.map((r) => (
          <label
            key={r.key}
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 14,
              opacity: r.disabled ? 0.55 : 1,
              cursor: r.disabled ? "default" : "pointer",
            }}
          >
            <span>
              <span style={{ fontSize: 13.5, fontWeight: 500 }}>
                {r.label}
                {r.badge ? (
                  <span className="chip" style={{ marginLeft: 8, fontSize: 10 }}>
                    {r.badge}
                  </span>
                ) : null}
              </span>
              <span className="muted" style={{ display: "block", fontSize: 11.5, marginTop: 2 }}>
                {r.hint}
              </span>
            </span>
            <input
              type="checkbox"
              checked={state[r.key]}
              disabled={r.disabled || busy === r.key}
              onChange={(e) => toggle(r.key, e.target.checked)}
            />
          </label>
        ))}
      </div>
    </div>
  );
}
