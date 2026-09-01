"use client";

/**
 * Zona de peligro — borrado de cuenta (#82). Flujo: aviso fuerte → escribir
 * "BORRAR" → enviar OTP al correo → ingresar OTP → descargar export .xlsx →
 * borrar. En móvil nativo, `onBeforeDelete` inyecta el gate biométrico (#64).
 */
import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  requestAccountDeletionOtpAction,
  exportHouseholdDataAction,
  deleteAccountAction,
} from "@/modules/account/api/actions";

type Step = "idle" | "confirm" | "otp";

function downloadBase64(filename: string, base64: string): void {
  const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
  const blob = new Blob([bytes], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function DeleteAccountButton({
  isOwnerWithMembers = false,
  onBeforeDelete,
}: {
  /** Copy más fuerte: al ser dueño con miembros, se borra TODA la data del hogar. */
  isOwnerWithMembers?: boolean;
  /** Gate extra antes de borrar (biometría en móvil nativo). Debe resolver true para continuar. */
  onBeforeDelete?: () => Promise<boolean>;
}) {
  const router = useRouter();
  const [step, setStep] = useState<Step>("idle");
  const [confirmText, setConfirmText] = useState("");
  const [otp, setOtp] = useState("");
  const [exported, setExported] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  const reset = () => {
    setStep("idle");
    setConfirmText("");
    setOtp("");
    setExported(false);
    setError(null);
    setNote(null);
  };

  const sendOtp = async () => {
    setError(null);
    if (confirmText.trim().toUpperCase() !== "BORRAR") {
      setError('Escribí "BORRAR" para continuar.');
      return;
    }
    setBusy(true);
    const r = await requestAccountDeletionOtpAction();
    setBusy(false);
    if (!r.ok) {
      setError(r.message ?? "No pudimos enviar el código.");
      return;
    }
    setNote("Te enviamos un código a tu correo.");
    setStep("otp");
  };

  const doExport = async () => {
    setBusy(true);
    setError(null);
    const r = await exportHouseholdDataAction();
    setBusy(false);
    if (!r.ok || !r.base64 || !r.filename) {
      setError(r.message ?? "No pudimos generar el export.");
      return;
    }
    downloadBase64(r.filename, r.base64);
    setExported(true);
  };

  const doDelete = async () => {
    setError(null);
    if (onBeforeDelete) {
      const ok = await onBeforeDelete();
      if (!ok) {
        setError("Verificación cancelada.");
        return;
      }
    }
    setBusy(true);
    const r = await deleteAccountAction({ confirmText, otp });
    setBusy(false);
    if (!r.ok) {
      setError(r.message ?? "No pudimos completar el borrado.");
      return;
    }
    router.replace("/login?deleted=1");
  };

  if (step === "idle") {
    return (
      <div className="card card-pad" style={{ borderColor: "var(--neg)" }}>
        <div className="card-title" style={{ color: "var(--neg)" }}>
          Borrar mi cuenta
        </div>
        <p className="muted" style={{ fontSize: 13, lineHeight: 1.5, marginTop: 6 }}>
          {isOwnerWithMembers
            ? "Sos el titular del hogar: se borrará TODA la data del hogar (los movimientos de todos los miembros) y tu cuenta. Los demás miembros conservan su cuenta pero pierden los datos compartidos. Es irreversible."
            : "Tus movimientos quedan en el hogar; se borra tu cuenta y tu perfil. Es irreversible."}
        </p>
        <button
          className="btn btn-ghost"
          style={{ marginTop: 12, color: "var(--neg)", borderColor: "var(--neg)" }}
          onClick={() => setStep("confirm")}
        >
          Borrar mi cuenta…
        </button>
      </div>
    );
  }

  return (
    <div className="card card-pad" style={{ borderColor: "var(--neg)" }}>
      <div className="card-title" style={{ color: "var(--neg)" }}>
        Confirmá el borrado
      </div>

      {step === "confirm" && (
        <>
          <p className="muted" style={{ fontSize: 13, lineHeight: 1.5, margin: "6px 0 10px" }}>
            Escribí <strong>BORRAR</strong> para continuar. Te enviaremos un código a tu correo.
          </p>
          <input
            className="inp"
            value={confirmText}
            onChange={(e) => setConfirmText(e.target.value)}
            placeholder="BORRAR"
            autoCapitalize="characters"
          />
        </>
      )}

      {step === "otp" && (
        <>
          <p className="muted" style={{ fontSize: 13, lineHeight: 1.5, margin: "6px 0 10px" }}>
            Ingresá el código que enviamos a tu correo. Descargá tus datos antes de borrar.
          </p>
          <input
            className="inp"
            value={otp}
            onChange={(e) => setOtp(e.target.value)}
            placeholder="Código de 6 dígitos"
            inputMode="numeric"
          />
          <button
            className="btn btn-ghost"
            style={{ marginTop: 10, width: "100%", justifyContent: "center" }}
            onClick={doExport}
            disabled={busy}
          >
            {exported ? "✓ Datos descargados (.xlsx)" : "Descargar mis datos (.xlsx)"}
          </button>
        </>
      )}

      {note && (
        <div className="muted" style={{ fontSize: 12, color: "var(--pos)", marginTop: 8 }}>
          {note}
        </div>
      )}
      {error && <div style={{ fontSize: 12, color: "var(--neg)", marginTop: 8 }}>{error}</div>}

      <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
        <button className="btn btn-ghost" onClick={reset} disabled={busy}>
          Cancelar
        </button>
        {step === "confirm" ? (
          <button className="btn btn-primary" onClick={sendOtp} disabled={busy}>
            {busy ? "Enviando…" : "Enviar código"}
          </button>
        ) : (
          <button
            className="btn"
            style={{ background: "var(--neg)", color: "#fff" }}
            onClick={doDelete}
            disabled={busy || !otp || !exported}
            title={!exported ? "Descargá tus datos primero" : undefined}
          >
            {busy ? "Borrando…" : "Borrar mi cuenta"}
          </button>
        )}
      </div>
    </div>
  );
}
