"use client";

import { useActionState } from "react";
import Link from "next/link";

import { signUpAction, type ActionState } from "@/lib/auth/actions";

import { AuthSuccess } from "./mobile-auth-success";

/**
 * Registro del móvil (/m/signup). REUTILIZA la misma Server Action de la web
 * (`signUpAction`) → mismo Supabase, rate-limit, schema y mensajes en español. Solo
 * cambia la piel (mobile.css) y el destino: `next=/m`, así el enlace de confirmación
 * vuelve al shell móvil. La action no redirige: al ok muestra "revisa tu correo".
 */
const initial: ActionState = { ok: false };

export function MobileSignupForm() {
  const [state, action, pending] = useActionState(signUpAction, initial);

  if (state.ok && state.message) {
    return (
      <AuthSuccess
        title="¡Tu cuenta está lista!"
        message={state.message}
        linkHref="/m/login"
        linkLabel="Ir a iniciar sesión"
      />
    );
  }

  return (
    <form action={action} className="m-auth">
      {/* La action valida `next` con safeRelative (solo rutas internas) → /m. */}
      <input type="hidden" name="next" value="/m" />

      {state.message ? (
        <div className="m-auth-msg" role="alert">
          {state.message}
        </div>
      ) : null}

      <label className="m-field">
        <span className="m-field-l">¿Cómo quieres que te llamemos?</span>
        <input
          className="m-inp"
          name="displayName"
          type="text"
          autoComplete="name"
          placeholder="Memo, Caro…"
          maxLength={80}
          required
        />
        {state.fieldErrors?.displayName ? (
          <span className="m-field-err">{state.fieldErrors.displayName}</span>
        ) : null}
      </label>

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

      <label className="m-field">
        <span className="m-field-l">Contraseña</span>
        <input
          className="m-inp"
          name="password"
          type="password"
          autoComplete="new-password"
          placeholder="Mínimo 8 caracteres"
          required
        />
        {state.fieldErrors?.password ? (
          <span className="m-field-err">{state.fieldErrors.password}</span>
        ) : null}
      </label>

      <label className="m-field">
        <span className="m-field-l">Confirmar contraseña</span>
        <input
          className="m-inp"
          name="confirm"
          type="password"
          autoComplete="new-password"
          placeholder="Repite la contraseña"
          required
        />
        {state.fieldErrors?.confirm ? (
          <span className="m-field-err">{state.fieldErrors.confirm}</span>
        ) : null}
      </label>

      <button className="m-btn m-btn-block m-btn-primary" type="submit" disabled={pending} style={{ marginTop: 6 }}>
        {pending ? "Creando tu cuenta…" : "Crear cuenta"}
      </button>

      <div style={{ textAlign: "center", marginTop: 16, fontSize: 13, color: "var(--text-muted)" }}>
        ¿Ya tienes cuenta?{" "}
        <Link href="/m/login" className="m-authlink">
          Inicia sesión
        </Link>
      </div>
    </form>
  );
}
