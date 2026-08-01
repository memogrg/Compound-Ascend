"use client";

import Link from "next/link";
import { useActionState, useEffect } from "react";
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

  // Semilla de zona horaria: al registrarse, deja la cookie `tz` con la zona del
  // dispositivo para que el PRIMER render autenticado ya calcule "hoy / mes" en su zona
  // (el layout la persiste luego en el perfil). Cero UI.
  useEffect(() => {
    try {
      const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
      if (tz) {
        document.cookie = `tz=${encodeURIComponent(tz)}; path=/; max-age=${60 * 60 * 24 * 365}; samesite=lax`;
      }
    } catch {
      // Intl no disponible: el capturador del layout lo resolverá tras iniciar sesión.
    }
  }, []);

  if (state.ok && state.message) {
    return (
      <div className="auth-success">
        <div className="ok">
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.4"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="m5 12 5 5 9-11" />
          </svg>
        </div>
        <h2>¡Tu cuenta está lista!</h2>
        <p>{state.message}</p>
        <Link href="/login" className="btn btn-primary">
          Ir a iniciar sesión
        </Link>
      </div>
    );
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
