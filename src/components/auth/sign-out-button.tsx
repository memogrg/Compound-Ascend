"use client";

import { signOutAction } from "@/lib/auth/actions";

/** Botón de cierre de sesión (icono) para el pie del sidebar. */
export function SignOutButton() {
  return (
    <form action={signOutAction}>
      <button type="submit" className="icon-btn" aria-label="Cerrar sesión" title="Cerrar sesión">
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
          <path d="M16 17l5-5-5-5M21 12H9" />
        </svg>
      </button>
    </form>
  );
}
