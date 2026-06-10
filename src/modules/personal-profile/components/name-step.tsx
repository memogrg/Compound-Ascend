"use client";

/**
 * Paso único del invitado tras unirse al hogar: "¿Cómo querés que te llamemos?".
 * Guarda el nombre y entra al panel. No hay wizard.
 */
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { updateDisplayNameAction } from "@/modules/personal-profile/api/actions";

export function NameStep({ defaultName }: { defaultName: string }) {
  const router = useRouter();
  const [name, setName] = useState(defaultName);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const save = () =>
    start(async () => {
      setError(null);
      const res = await updateDisplayNameAction(name);
      if (res.ok) {
        router.replace("/dashboard");
        router.refresh();
      } else {
        setError(res.message ?? "No pudimos guardar tu nombre.");
      }
    });

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        save();
      }}
    >
      <div className="fld">
        <label className="fld-label" htmlFor="display-name">
          ¿Cómo quieres que te llamemos?
        </label>
        <input
          id="display-name"
          className="inp"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Memo, Caro…"
          autoComplete="name"
          maxLength={60}
          required
          aria-invalid={error ? true : undefined}
        />
        {error ? (
          <span className="auth-err" role="alert">
            {error}
          </span>
        ) : null}
      </div>
      <button type="submit" className="btn btn-primary" disabled={pending} style={{ width: "100%" }}>
        {pending ? "Guardando…" : "Entrar al panel"}
      </button>
    </form>
  );
}
