"use client";

import { useState } from "react";

/**
 * Campo de formulario reutilizable para auth (label + input + error).
 * Los campos de contraseña incluyen toggle de visibilidad (solo UI;
 * no altera name/id ni el envío del formulario).
 */
export function Field({
  label,
  labelEnd,
  name,
  type = "text",
  placeholder,
  autoComplete,
  defaultValue,
  error,
  required,
}: {
  label: string;
  /** Elemento opcional al extremo derecho del label (p. ej. "¿Olvidaste tu contraseña?"). */
  labelEnd?: React.ReactNode;
  name: string;
  type?: string;
  placeholder?: string;
  autoComplete?: string;
  defaultValue?: string;
  error?: string;
  required?: boolean;
}) {
  const [showPw, setShowPw] = useState(false);
  const isPassword = type === "password";

  const input = (
    <input
      id={name}
      name={name}
      type={isPassword && showPw ? "text" : type}
      className="inp"
      placeholder={placeholder}
      autoComplete={autoComplete}
      defaultValue={defaultValue}
      required={required}
      aria-invalid={error ? true : undefined}
    />
  );

  return (
    <div className="fld">
      <label className="fld-label" htmlFor={name}>
        <span>{label}</span>
        {labelEnd}
      </label>
      {isPassword ? (
        <div className="pw-wrap">
          {input}
          <button
            type="button"
            className="pw-toggle"
            onClick={() => setShowPw((v) => !v)}
            aria-label={showPw ? "Ocultar contraseña" : "Mostrar contraseña"}
          >
            {showPw ? (
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.9"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="M2 12s3.5-7 10-7c2.1 0 3.9.7 5.4 1.7M22 12s-3.5 7-10 7c-2.1 0-3.9-.7-5.4-1.7" />
                <circle cx="12" cy="12" r="3" />
                <path d="M3 3l18 18" />
              </svg>
            ) : (
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.9"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z" />
                <circle cx="12" cy="12" r="3" />
              </svg>
            )}
          </button>
        </div>
      ) : (
        input
      )}
      {error ? <span className="auth-err">{error}</span> : null}
    </div>
  );
}
