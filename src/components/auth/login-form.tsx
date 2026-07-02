"use client";

import Link from "next/link";
import { useActionState } from "react";
import { signInAction, type ActionState } from "@/lib/auth/actions";
import { Field } from "@/components/auth/field";
import { SubmitButton } from "@/components/auth/submit-button";

const initial: ActionState = { ok: false };

export function LoginForm({ next }: { next?: string } = {}) {
  const [state, action] = useActionState(signInAction, initial);
  return (
    <form action={action}>
      {next ? <input type="hidden" name="next" value={next} /> : null}
      {state.message ? <div className="auth-msg warn">{state.message}</div> : null}
      <Field
        label="Correo"
        name="email"
        type="email"
        autoComplete="email"
        placeholder="tu@correo.com"
        error={state.fieldErrors?.email}
        required
      />
      <Field
        label="Contraseña"
        labelEnd={
          <Link className="auth-link" href="/reset-password">
            ¿Olvidaste tu contraseña?
          </Link>
        }
        name="password"
        type="password"
        autoComplete="current-password"
        placeholder="••••••••"
        error={state.fieldErrors?.password}
        required
      />
      <SubmitButton>Iniciar sesión</SubmitButton>
    </form>
  );
}
