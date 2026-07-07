"use client";

import { useActionState } from "react";
import { signInAction, type ActionState } from "@/lib/auth/actions";

/**
 * Formulario de login del móvil. REUTILIZA la misma Server Action de la web
 * (`signInAction` de @/lib/auth/actions) → mismo Supabase, mismo rate-limit y
 * mismos mensajes de error en español. Solo cambia la piel (mobile.css) y el
 * destino: `next=/m`, así que en éxito la action redirige a /m.
 */
const initial: ActionState = { ok: false };

export function MobileLoginForm() {
  const [state, action, pending] = useActionState(signInAction, initial);
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
          autoComplete="current-password"
          placeholder="••••••••"
          required
        />
        {state.fieldErrors?.password ? (
          <span className="m-field-err">{state.fieldErrors.password}</span>
        ) : null}
      </label>

      <button className="m-btn m-btn-primary" type="submit" disabled={pending} style={{ marginTop: 6 }}>
        {pending ? "Entrando…" : "Iniciar sesión"}
      </button>
    </form>
  );
}
