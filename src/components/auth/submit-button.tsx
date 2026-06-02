"use client";

import { useFormStatus } from "react-dom";

/** Botón de envío que muestra estado de carga (useFormStatus). */
export function SubmitButton({ children }: { children: React.ReactNode }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      className="btn btn-primary"
      style={{ width: "100%", justifyContent: "center" }}
      disabled={pending}
      aria-busy={pending}
    >
      {pending ? "Un momento…" : children}
    </button>
  );
}
