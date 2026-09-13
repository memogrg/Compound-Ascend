"use client";

import Link from "next/link";

/**
 * La casilla de aceptación de los formularios de alta.
 *
 * `defaultChecked` no es opcional: React 19 resetea un formulario no controlado cuando
 * la acción termina, así que tras un error de validación la casilla vuelve vacía y hay
 * que volver a marcarla. Se re-siembra desde los `values` que devuelve la acción — la
 * misma lección que dejó el formulario de /empezar con el correo.
 *
 * El `<label htmlFor>` es real y envuelve solo el texto: así el área táctil incluye la
 * frase entera y no obliga a apuntarle a una caja de 16px. Los enlaces van dentro del
 * label pero se detiene la propagación del clic — si no, tocar «Términos» marcaría la
 * casilla además de navegar.
 */
export function CasillaTerminos({
  id = "acepta_terminos",
  defaultChecked,
  error,
  className,
  variant = "web",
}: {
  id?: string;
  defaultChecked?: boolean;
  error?: string;
  className?: string;
  /** Solo cambia de qué clase sale el error y el color del enlace. El TEXTO es el mismo. */
  variant?: "web" | "movil";
}) {
  const movil = variant === "movil";
  return (
    <div className={className} style={{ margin: "14px 0 4px" }}>
      <div style={{ display: "flex", alignItems: "flex-start", gap: 10, minHeight: 44 }}>
        <input
          id={id}
          name="acepta_terminos"
          type="checkbox"
          required
          defaultChecked={defaultChecked}
          aria-describedby={error ? `${id}-error` : undefined}
          style={{ width: 20, height: 20, marginTop: 11, flex: "none", accentColor: "#378451" }}
        />
        <label
          htmlFor={id}
          style={{ fontSize: 13, lineHeight: 1.5, paddingTop: 11, cursor: "pointer" }}
        >
          Tengo 18 años o más y acepto los{" "}
          <Link
            href="/terminos"
            className={movil ? "m-authlink" : undefined}
            onClick={(e) => e.stopPropagation()}
          >
            Términos y condiciones
          </Link>{" "}
          y la{" "}
          <Link
            href="/privacidad"
            className={movil ? "m-authlink" : undefined}
            onClick={(e) => e.stopPropagation()}
          >
            Política de privacidad
          </Link>
          .
        </label>
      </div>
      {error ? (
        <p
          id={`${id}-error`}
          role="alert"
          className={movil ? "m-field-err" : undefined}
          style={movil ? undefined : { fontSize: 12.5, color: "var(--neg, #c34f4b)" }}
        >
          {error}
        </p>
      ) : null}
    </div>
  );
}
