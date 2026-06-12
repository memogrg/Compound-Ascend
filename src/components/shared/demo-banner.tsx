"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/ui/icon";
import { clearAllDataAction } from "@/modules/account/api/actions";

/**
 * Aviso cuando los datos provienen de la plantilla de ejemplo. Permite seguir
 * editándola o empezar de cero (borra todos los datos del usuario).
 */
export function DemoBanner() {
  const router = useRouter();
  const [dismissed, setDismissed] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);

  if (dismissed) return null;

  const clear = async () => {
    setBusy(true);
    const res = await clearAllDataAction();
    setBusy(false);
    if (res.ok) {
      router.push("/bienvenida");
      router.refresh();
    }
  };

  return (
    <div
      className="card"
      style={{
        padding: "14px 18px",
        display: "flex",
        alignItems: "center",
        gap: 14,
        flexWrap: "wrap",
        background: "linear-gradient(140deg, var(--info-soft), var(--surface))",
        border: "1px solid color-mix(in srgb, var(--info) 24%, var(--line))",
      }}
    >
      <span
        style={{
          width: 30,
          height: 30,
          borderRadius: 8,
          display: "grid",
          placeItems: "center",
          background: "var(--info)",
          color: "white",
          flex: "none",
        }}
      >
        <Icon name="spark" filled width={0} />
      </span>
      <div style={{ flex: 1, minWidth: 220 }}>
        <div style={{ fontSize: 13.5, fontWeight: 600 }}>Estás viendo una plantilla de ejemplo</div>
        <div className="muted" style={{ fontSize: 12.5, marginTop: 2, lineHeight: 1.45 }}>
          Edita o borra cualquier dato para hacerlo tuyo. Cuando quieras, empieza de cero.
        </div>
      </div>
      {confirming ? (
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <span className="muted" style={{ fontSize: 12.5 }}>
            ¿Borrar todo?
          </span>
          <button
            className="btn btn-secondary"
            onClick={() => setConfirming(false)}
            disabled={busy}
          >
            No
          </button>
          <button className="btn btn-primary" onClick={clear} disabled={busy}>
            {busy ? "Borrando…" : "Sí, empezar de cero"}
          </button>
        </div>
      ) : (
        <div style={{ display: "flex", gap: 8 }}>
          <button className="btn btn-ghost" onClick={() => setDismissed(true)}>
            Seguir editando
          </button>
          <button className="btn btn-secondary" onClick={() => setConfirming(true)}>
            Empezar de cero
          </button>
        </div>
      )}
    </div>
  );
}
