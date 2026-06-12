"use client";

/**
 * Tarjeta de vinculación de WhatsApp por OTP. Muestra el código a enviar al
 * número del bot; el vínculo se confirma cuando el usuario manda ese código por
 * WhatsApp (lo procesa el webhook). El número nunca se asocia sin verificar.
 */
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
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
    <div className="card card-pad">
      <div className="card-title">Asistente de WhatsApp</div>
      <p className="muted" style={{ fontSize: 13, marginTop: 10, lineHeight: 1.5 }}>
        Registra gastos por foto o texto y consulta tu presupuesto desde WhatsApp. Tu número se
        vincula a tu familia solo tras confirmar un código.
      </p>

      {isActive ? (
        <div style={{ marginTop: 14 }}>
          <div style={{ fontSize: 14, fontWeight: 500 }}>
            ✅ Vinculado{initial?.phone ? ` · ${initial.phone}` : ""}
          </div>
          <button
            type="button"
            className="btn btn-secondary"
            style={{ marginTop: 12 }}
            onClick={revoke}
            disabled={pending}
          >
            {pending ? "Desvinculando…" : "Desvincular WhatsApp"}
          </button>
        </div>
      ) : otp ? (
        <div className="auth-msg" style={{ marginTop: 14, lineHeight: 1.6 }}>
          Envía este código por WhatsApp al número <strong>{otp.botNumber ?? "del bot"}</strong>:
          <div
            className="tnum"
            style={{ fontSize: 30, fontWeight: 700, letterSpacing: 4, margin: "10px 0" }}
          >
            {otp.code}
          </div>
          <span className="muted" style={{ fontSize: 12.5 }}>
            Expira en {otp.expiresInMin} minutos. Al recibirlo, te confirmaremos por WhatsApp.
          </span>
        </div>
      ) : (
        <button
          type="button"
          className="btn btn-primary"
          style={{ marginTop: 14 }}
          onClick={generate}
          disabled={pending}
        >
          {pending ? "Generando…" : "Vincular WhatsApp"}
        </button>
      )}

      {!configured ? (
        <p className="muted" style={{ fontSize: 11.5, marginTop: 12 }}>
          La integración de WhatsApp aún no está configurada en el servidor.
        </p>
      ) : null}
      {error ? (
        <span className="auth-err" role="alert" style={{ display: "block", marginTop: 10 }}>
          {error}
        </span>
      ) : null}
    </div>
  );
}
