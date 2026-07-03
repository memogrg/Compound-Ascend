"use client";

/**
 * Tarjeta de vinculación de WhatsApp por OTP. Muestra el código a enviar al
 * número del bot; el vínculo se confirma cuando el usuario manda ese código por
 * WhatsApp (lo procesa el webhook). El número nunca se asocia sin verificar.
 * Cuerpo de su set-row (el título/descripción viven en la página).
 */
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/ui/icon";
import { linkWhatsAppAction, revokeWhatsAppAction } from "@/modules/account/api/actions";

type LinkState = { status: "pending" | "active" | "revoked"; phone: string | null } | null;

export function WhatsAppLink({ initial, configured }: { initial: LinkState; configured: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [otp, setOtp] = useState<{
    code: string;
    botNumber: string | null;
    expiresInMin: number;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const isActive = initial?.status === "active";

  const generate = () =>
    start(async () => {
      setError(null);
      const r = await linkWhatsAppAction();
      if (r.ok && r.otp) {
        setOtp({ code: r.otp, botNumber: r.botNumber ?? null, expiresInMin: r.expiresInMin ?? 10 });
      } else {
        setError(r.message ?? "No pudimos generar el código.");
      }
    });

  const revoke = () =>
    start(async () => {
      setError(null);
      const r = await revokeWhatsAppAction();
      if (r.ok) {
        setOtp(null);
        router.refresh();
      } else {
        setError(r.message ?? "No pudimos desvincular.");
      }
    });

  return (
    <div className="statecard">
      {isActive ? (
        <div>
          <div className="linked">
            <span className="ok">
              <Icon name="check" width={2.4} />
            </span>
            Vinculado{initial?.phone ? ` · ${initial.phone}` : ""}
          </div>
          <button
            type="button"
            className="btn btn-secondary"
            style={{ marginTop: 14 }}
            onClick={revoke}
            disabled={pending}
          >
            {pending ? "Desvinculando…" : "Desvincular WhatsApp"}
          </button>
        </div>
      ) : otp ? (
        <div>
          <div style={{ fontSize: 13.5 }}>
            Envía este código por WhatsApp al número{" "}
            <strong>{otp.botNumber ?? "del bot"}</strong>:
          </div>
          <div className="otp-code">{otp.code}</div>
          <div className="otp-exp">
            Expira en {otp.expiresInMin} minutos. Al recibirlo, te confirmaremos por WhatsApp.
          </div>
        </div>
      ) : (
        <div>
          <div style={{ fontSize: 13.5, color: "var(--muted)", marginBottom: 14 }}>
            Aún no has vinculado un número de WhatsApp.
          </div>
          <button
            type="button"
            className="btn btn-primary"
            onClick={generate}
            disabled={pending}
          >
            {pending ? "Generando…" : "Vincular WhatsApp"}
          </button>
        </div>
      )}

      {!configured ? (
        <div className="unconfig" style={{ marginTop: 12 }}>
          <Icon name="info" />
          La integración de WhatsApp aún no está configurada en el servidor.
        </div>
      ) : null}
      {error ? (
        <span className="auth-err" role="alert" style={{ display: "block", marginTop: 10 }}>
          {error}
        </span>
      ) : null}
    </div>
  );
}
