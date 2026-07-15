"use client";

import { useActionState } from "react";
import Link from "next/link";

import { requestPasswordResetAction, type ActionState } from "@/lib/auth/actions";

import { AuthSuccess } from "./mobile-auth-success";

/**
 * Solicitar recuperación de contraseña en el móvil (/m/reset-password). REUTILIZA la
 * misma Server Action de la web (`requestPasswordResetAction`): mismo rate-limit y la
 * MISMA respuesta genérica (no revela si el correo existe). El paso de fijar la nueva
 * contraseña se hace por el enlace del correo, no aquí. La action no redirige: al ok
 * muestra "Revisa tu correo".
 */
const initial: ActionState = { ok: false };

export function MobileResetForm() {
  const [state, action, pending] = useActionState(requestPasswordResetAction, initial);

  if (state.ok && state.message) {
    return (
      <AuthSuccess
        title="Revisa tu correo"
        message={state.message}
        linkHref="/m/login"
        linkLabel="Volver a iniciar sesión"
      />
    );
  }

  return (
    <form action={action} className="m-auth">
      {state.message ? (
        <div className="m-auth-msg" role="alert">
          {state.message}
        </div>
      ) : null}

      <label className="m-field">
        <span className="m-field-l">Correo</span>
        <input
          className="m-inp"
          name="email"
          type="email"
          autoComplete="email"
          inputMode="email"
          placeholder="tu@correo.com"
          required
        />
        {state.fieldErrors?.email ? (
          <span className="m-field-err">{state.fieldErrors.email}</span>
        ) : null}
      </label>

      <button className="m-btn m-btn-block m-btn-primary" type="submit" disabled={pending} style={{ marginTop: 6 }}>
        {pending ? "Enviando…" : "Enviar enlace de recuperación"}
      </button>

      <div style={{ textAlign: "center", marginTop: 16, fontSize: 13, color: "var(--text-muted)" }}>
        <Link href="/m/login" className="m-authlink">
          Volver a iniciar sesión
        </Link>
      </div>
    </form>
  );
}
