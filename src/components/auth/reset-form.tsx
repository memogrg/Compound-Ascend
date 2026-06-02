"use client";

import { useActionState } from "react";
import {
  requestPasswordResetAction,
  updatePasswordAction,
  type ActionState,
} from "@/lib/auth/actions";
import { Field } from "@/components/auth/field";
import { SubmitButton } from "@/components/auth/submit-button";

const initial: ActionState = { ok: false };

/** Solicitud de enlace de restablecimiento. */
export function RequestResetForm() {
  const [state, action] = useActionState(requestPasswordResetAction, initial);

  if (state.ok && state.message) {
    return <div className="auth-msg">{state.message}</div>;
  }

  return (
    <form action={action}>
      <Field
        label="Correo"
        name="email"
        type="email"
        autoComplete="email"
        placeholder="tu@correo.com"
        error={state.fieldErrors?.email}
        required
      />
      <SubmitButton>Enviar enlace</SubmitButton>
    </form>
  );
}

/** Definir nueva contraseña (tras seguir el enlace del correo). */
export function UpdatePasswordForm() {
  const [state, action] = useActionState(updatePasswordAction, initial);
  return (
    <form action={action}>
      {state.message ? <div className="auth-msg warn">{state.message}</div> : null}
      <Field
        label="Nueva contraseña"
        name="password"
        type="password"
        autoComplete="new-password"
        placeholder="Mínimo 8 caracteres"
        error={state.fieldErrors?.password}
        required
      />
      <Field
        label="Confirmar contraseña"
        name="confirm"
        type="password"
        autoComplete="new-password"
        placeholder="Repite tu contraseña"
        error={state.fieldErrors?.confirm}
        required
      />
      <SubmitButton>Actualizar contraseña</SubmitButton>
    </form>
  );
}
