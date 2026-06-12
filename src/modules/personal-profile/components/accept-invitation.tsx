"use client";

/**
 * Botón de aceptación de invitación. Llama a acceptInvitationAction y, al
 * confirmar, lleva al usuario al panel (el invitado hereda el perfil del hogar;
 * el paso de nombre se resuelve por separado).
 */
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { acceptInvitationAction } from "@/modules/personal-profile/api/actions";

export function AcceptInvitation({
  token,
  inviterName,
  householdName,
}: {
  token: string;
  inviterName: string;
  householdName: string;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const accept = () =>
    start(async () => {
      setError(null);
      const res = await acceptInvitationAction(token);
      if (res.ok) {
        // Único paso del invitado: confirmar cómo quiere que le llamemos.
        router.replace("/invitacion/nombre");
        router.refresh();
      } else {
        setError(res.message ?? "No pudimos aceptar la invitación.");
      }
    });

  return (
    <div>
      <p style={{ fontSize: 15, lineHeight: 1.6, marginBottom: 18 }}>
        <strong>{inviterName}</strong> te invitó a su hogar <strong>{householdName}</strong>. Al
        aceptar te sumas a la gestión compartida y heredas la configuración del perfil; no tendrás
        que llenar el cuestionario.
      </p>
      <button
        type="button"
        className="btn btn-primary"
        onClick={accept}
        disabled={pending}
        style={{ width: "100%" }}
      >
        {pending ? "Uniéndote…" : "Aceptar y unirme al hogar"}
      </button>
      {error ? (
        <span className="auth-err" role="alert" style={{ display: "block", marginTop: 10 }}>
          {error}
        </span>
      ) : null}
    </div>
  );
}
