"use client";

import { useActionState } from "react";
import { signUpAction, type ActionState } from "@/lib/auth/actions";
import { Field } from "@/components/auth/field";
import { SubmitButton } from "@/components/auth/submit-button";

const initial: ActionState = { ok: false };

export function SignupForm({
  defaultEmail,
  next,
}: {
  defaultEmail?: string;
  next?: string;
} = {}) {
  const [state, action] = useActionState(signUpAction, initial);

  if (state.ok && state.message) {
    return <div className="auth-msg">{state.message}</div>;
  }

  return (
    <form action={action}>
      {next ? <input type="hidden" name="next" value={next} /> : null}
      <Field
        label="¿Cómo quieres que te llamemos?"
        name="displayName"
        placeholder="Memo, Caro…"
        autoComplete="name"
        error={state.fieldErrors?.displayName}
        required
      />
      <Field
        label="Correo"
        name="email"
        type="email"
        autoComplete="email"
        placeholder="tu@correo.com"
        defaultValue={defaultEmail}
        error={state.fieldErrors?.email}
        required
      />
      <Field
        label="Contraseña"
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
      <SubmitButton>Crear mi cuenta</SubmitButton>
    </form>
  );
}
