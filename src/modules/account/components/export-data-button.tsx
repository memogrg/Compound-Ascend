"use client";

/**
 * Exportar mis datos — la MISMA acción que ya existía dentro del borrado de
 * cuenta (#82), pero con vida propia en Configuración.
 *
 * Por qué existe este archivo: el .xlsx completo se generaba desde hace rato,
 * pero el único botón que lo llamaba estaba adentro del flujo de borrado. O
 * sea que para bajarte una copia de tus datos había que empezar a destruir la
 * cuenta y frenar a tiempo. Portabilidad que solo se alcanza pasando por la
 * zona de peligro no es portabilidad.
 *
 * No pide OTP ni confirmación: leer tus propios datos no es una operación
 * destructiva. El export del borrado se queda donde está, como última
 * oportunidad antes de que no haya vuelta atrás.
 *
 * `variant` adapta las clases igual que DeleteAccountButton: "web" (btn) o
 * "mobile" (m-btn), sin card propio porque va dentro de un MContentCard.
 */
import { useState } from "react";
import { exportHouseholdDataAction } from "@/modules/account/api/actions";
import { downloadBase64Xlsx } from "./download-xlsx";

type Variant = "web" | "mobile";

export function ExportDataButton({ variant = "web" }: { variant?: Variant }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const m = variant === "mobile";
  const btnClass = m ? "m-btn m-btn-block" : "btn btn-ghost";

  const run = async () => {
    setBusy(true);
    setError(null);
    setDone(false);
    const r = await exportHouseholdDataAction();
    setBusy(false);
    if (!r.ok || !r.base64 || !r.filename) {
      setError(r.message ?? "No pudimos generar el archivo. Intentá de nuevo.");
      return;
    }
    downloadBase64Xlsx(r.filename, r.base64);
    setDone(true);
  };

  return (
    <div>
      <button type="button" className={btnClass} onClick={run} disabled={busy}>
        {busy ? "Preparando tu archivo…" : "Descargar mis datos (.xlsx)"}
      </button>

      <p className="muted" style={{ fontSize: 12.5, lineHeight: 1.55, margin: "10px 0 0" }}>
        Un archivo de Excel con una hoja por tema: movimientos, presupuesto, deudas, inversiones,
        metas, seguros y perfil. Si compartís hogar, incluye el hogar completo y cada movimiento
        lleva su autor.
      </p>

      {done ? (
        <p style={{ fontSize: 12.5, margin: "8px 0 0", color: "var(--pos)" }}>
          Listo: revisá tus descargas.
        </p>
      ) : null}
      {error ? (
        <p style={{ fontSize: 12.5, margin: "8px 0 0", color: "var(--neg)" }}>{error}</p>
      ) : null}
    </div>
  );
}
