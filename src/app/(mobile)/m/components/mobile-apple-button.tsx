"use client";

/**
 * Botón "Continuar con Apple" del móvil.
 *
 * Existe por obligación: Apple 4.8 exige ofrecer Sign in with Apple en cuanto la app ofrece
 * otro login social, y ofrecemos Google.
 *
 * Solo se renderiza dentro de la app en iOS. En web devuelve null porque el flujo web de
 * Apple necesita Services ID y un redirect a nuestro backend, que no está montado; en
 * Android, porque ahí Apple no es obligatorio y el plugin haría ese mismo flujo web. Un
 * botón que no funciona es peor que ninguno.
 *
 * Arranca devolviendo null también en el primer render: `isCapacitor()` lee
 * `window.Capacitor`, que no existe en el servidor, y pintar el botón en SSR para quitarlo
 * al hidratar daría un salto.
 */
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import { isCapacitor, capacitorPlatform } from "@/lib/capacitor/native";
import { initSocialLogin } from "@/lib/capacitor/social-login-init";
import { nativeAppleLogin } from "@/lib/capacitor/apple-native";

/** Glifo de Apple, trazado a mano (sin dependencias). Hereda el color del botón. */
function AppleFace() {
  return (
    <>
      <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true" fill="currentColor">
        <path d="M17.05 12.54c-.02-2.2 1.8-3.26 1.88-3.31-1.02-1.5-2.61-1.7-3.18-1.73-1.35-.14-2.64.8-3.33.8-.69 0-1.75-.78-2.87-.76-1.48.02-2.84.86-3.6 2.18-1.53 2.66-.39 6.6 1.1 8.76.73 1.06 1.6 2.25 2.74 2.2 1.1-.04 1.52-.71 2.85-.71 1.33 0 1.7.71 2.87.69 1.18-.02 1.93-1.08 2.65-2.14.84-1.23 1.18-2.42 1.2-2.48-.03-.01-2.3-.88-2.32-3.5ZM14.9 5.9c.6-.74 1.01-1.75.9-2.76-.87.04-1.93.58-2.56 1.31-.56.65-1.05 1.69-.92 2.68.97.08 1.96-.49 2.58-1.23Z" />
      </svg>
      Continuar con Apple
    </>
  );
}

export function MobileAppleButton() {
  const router = useRouter();
  const [visible, setVisible] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isCapacitor() || capacitorPlatform() !== "ios") return;
    setVisible(true);
    void initSocialLogin(); // idempotente: comparte la del botón de Google
  }, []);

  if (!visible) return null;

  async function handleClick() {
    if (loading) return;
    setError(null);
    setLoading(true);
    const res = await nativeAppleLogin();
    if (res.ok) {
      // replace y no push: volver atrás desde /m no debe devolver a la pantalla de login.
      // refresh() para que el RSC se re-renderice ya con la sesión en las cookies.
      router.replace("/m");
      router.refresh();
      return;
    }
    // Cancelar no es un error: la persona decidió no seguir y ya lo sabe.
    if (!res.cancelled) setError(res.error || "No pudimos iniciar sesión con Apple.");
    setLoading(false);
  }

  return (
    <>
      <button
        type="button"
        className="m-oauth m-oauth-apple"
        onClick={handleClick}
        disabled={loading}
        aria-busy={loading}
      >
        <AppleFace />
      </button>
      {error && (
        <p
          role="alert"
          style={{ marginTop: 8, fontSize: 12.5, color: "var(--danger)", textAlign: "center" }}
        >
          {error}
        </p>
      )}
    </>
  );
}
