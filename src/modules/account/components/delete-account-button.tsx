"use client";

/**
 * Zona de peligro — borrado de cuenta (#82). Flujo: aviso fuerte → escribir
 * "BORRAR" → enviar OTP al correo → ingresar OTP → descargar export .xlsx →
 * borrar. En móvil nativo, `onBeforeDelete` inyecta el gate biométrico (#64).
 * `variant` adapta las clases: "web" (btn/card/inp) o "mobile" (m-btn/m-inp,
 * sin card interno porque va dentro de un MContentCard).
 */
import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  requestAccountDeletionOtpAction,
  exportHouseholdDataAction,
  deleteAccountAction,
} from "@/modules/account/api/actions";
import { downloadBase64Xlsx } from "./download-xlsx";

type Step = "idle" | "confirm" | "otp";
type Variant = "web" | "mobile";

export function DeleteAccountButton({
  isOwnerWithMembers = false,
  variant = "web",
  onBeforeDelete,
}: {
  /** Copy más fuerte: al ser dueño con miembros, se borra TODA la data del hogar. */
  isOwnerWithMembers?: boolean;
  variant?: Variant;
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

  const m = variant === "mobile";
  const cls = {
    wrap: m ? "" : "card card-pad",
    inp: m ? "m-inp" : "inp",
    ghost: m ? "m-btn m-btn-block" : "btn btn-ghost",
    primary: m ? "m-btn m-btn-block m-btn-primary" : "btn btn-primary",
    danger: m ? "m-btn m-btn-block m-btn-danger" : "btn",
  };
  const wrapStyle = m ? undefined : { borderColor: "var(--neg)" as const };

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
    downloadBase64Xlsx(r.filename, r.base64);
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
      <div className={cls.wrap} style={wrapStyle}>
        <div style={{ fontWeight: 700, color: "var(--neg)", fontSize: 15 }}>Borrar mi cuenta</div>
        <p className="muted" style={{ fontSize: 13, lineHeight: 1.5, marginTop: 6 }}>
          {isOwnerWithMembers
            ? "Sos el titular del hogar: se borrará TODA la data del hogar (los movimientos de todos los miembros) y tu cuenta. Los demás miembros conservan su cuenta pero pierden los datos compartidos. Es irreversible."
            : "Tus movimientos quedan en el hogar; se borra tu cuenta y tu perfil. Es irreversible."}
        </p>
        <button className={cls.danger} style={{ marginTop: 12 }} onClick={() => setStep("confirm")}>
          Borrar mi cuenta…
        </button>
      </div>
    );
  }

  return (
    <div className={cls.wrap} style={wrapStyle}>
      <div style={{ fontWeight: 700, color: "var(--neg)", fontSize: 15 }}>Confirmá el borrado</div>

      {step === "confirm" && (
        <>
          <p className="muted" style={{ fontSize: 13, lineHeight: 1.5, margin: "6px 0 10px" }}>
            Escribí <strong>BORRAR</strong> para continuar. Te enviaremos un código a tu correo.
          </p>
          <input
            className={cls.inp}
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
            className={cls.inp}
            value={otp}
            onChange={(e) => setOtp(e.target.value)}
            placeholder="Código de 6 dígitos"
            inputMode="numeric"
          />
          <button
            className={cls.ghost}
            style={{ marginTop: 10 }}
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

      <div style={{ display: "flex", gap: 8, marginTop: 14, flexWrap: "wrap" }}>
        <button className={cls.ghost} onClick={reset} disabled={busy}>
          Cancelar
        </button>
        {step === "confirm" ? (
          <button className={cls.primary} onClick={sendOtp} disabled={busy}>
            {busy ? "Enviando…" : "Enviar código"}
          </button>
        ) : (
          <button
            className={cls.danger}
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
