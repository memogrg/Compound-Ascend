"use client";

import { useEffect, useRef, useState } from "react";

import { signInWithGoogleAction } from "@/lib/auth/actions";
import {
  isCapacitor,
  capacitorApp,
  capacitorBrowser,
  capacitorSocialLogin,
  type PluginListenerHandle,
} from "@/lib/capacitor/native";
import { initSocialLogin, nativeGoogleLogin } from "@/lib/capacitor/google-native";

/** Cara del botón (SVG G de 4 colores + label), compartida por ambos caminos. */
function GoogleFace() {
  return (
    <>
      <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
        <path
          fill="#4285F4"
          d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.27-4.74 3.27-8.1Z"
        />
        <path
          fill="#34A853"
          d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A11 11 0 0 0 12 23Z"
        />
        <path
          fill="#FBBC05"
          d="M5.84 14.1a6.6 6.6 0 0 1 0-4.2V7.06H2.18a11 11 0 0 0 0 9.88l3.66-2.84Z"
        />
        <path
          fill="#EA4335"
          d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1A11 11 0 0 0 2.18 7.06l3.66 2.84C6.71 7.3 9.14 5.38 12 5.38Z"
        />
      </svg>
      Continuar con Google
    </>
  );
}

/**
 * Botón "Continuar con Google" del móvil.
 *
 * - En la app Capacitor (isCapacitor): login con Google NATIVO. Abre el selector de cuenta del
 *   sistema (@capgo/capacitor-social-login), obtiene un idToken y lo canjea con
 *   supabase.auth.signInWithIdToken; al terminar navega a /m (sesión ya en cookies → SSR).
 *   Si el plugin no está (app vieja), cae al flujo LEGACY por navegador.
 * - En web (o SSR/hidratación inicial): usa la Server Action existente SIN CAMBIOS.
 *
 * Por defecto renderiza el <form> web (funciona en todos lados). En useEffect detecta la app,
 * inicializa el plugin y cambia al handler nativo antes de que el usuario pueda tocar el botón.
 */
export function MobileGoogleButton() {
  const [native, setNative] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const listenerRef = useRef<PluginListenerHandle | null>(null);
  const nextRef = useRef("/m");

  useEffect(() => {
    const isNat = isCapacitor();
    setNative(isNat);
    if (isNat) void initSocialLogin(); // inicializa el plugin una sola vez
    return () => {
      listenerRef.current?.remove();
      listenerRef.current = null;
    };
  }, []);

  async function handleNative() {
    if (loading) return;
    setError(null);
    setLoading(true);

    // Camino principal: login nativo por idToken. Si el plugin @capgo no está presente
    // (build viejo del shell), cae al flujo legacy por navegador para no romper esas apps.
    if (capacitorSocialLogin()) {
      const res = await nativeGoogleLogin();
      if (res.ok) {
        window.location.href = "/m"; // sesión en cookies → SSR autenticado
        return;
      }
      if (!res.cancelled) setError(res.error || "No pudimos iniciar sesión con Google.");
      setLoading(false);
      return;
    }
    await handleNativeBrowserLegacy();
  }

  /**
   * LEGACY (fallback): flujo por navegador del sistema. Reemplazado por el login nativo por
   * idToken; se conserva para apps sin el plugin @capgo. Ver /api/auth/native/google-url.
   */
  async function handleNativeBrowserLegacy() {
    try {
      const app = capacitorApp();
      const browser = capacitorBrowser();
      if (!app || !browser) {
        setLoading(false);
        return;
      }
      if (!listenerRef.current) {
        listenerRef.current = await app.addListener("appUrlOpen", (event) => {
          browser.close().catch(() => {});
          let code: string | null = null;
          try {
            code = new URL(event.url).searchParams.get("code");
          } catch {
            code = null;
          }
          if (!code) {
            setLoading(false);
            return;
          }
          const cb = new URL("/auth/callback", window.location.origin);
          cb.searchParams.set("code", code);
          cb.searchParams.set("next", nextRef.current);
          window.location.href = cb.toString();
        });
      }
      const res = await fetch("/api/auth/native/google-url?next=/m", {
        headers: { accept: "application/json" },
      });
      const data: { url?: string; next?: string } = await res.json();
      if (!res.ok || !data.url) {
        setLoading(false);
        return;
      }
      nextRef.current = data.next ?? "/m";
      await browser.open({ url: data.url });
    } catch {
      setLoading(false);
    }
  }

  if (native) {
    return (
      <>
        <button
          type="button"
          className="m-oauth"
          onClick={handleNative}
          disabled={loading}
          aria-busy={loading}
        >
          <GoogleFace />
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

  return (
    <form action={signInWithGoogleAction}>
      <button type="submit" className="m-oauth">
        <GoogleFace />
      </button>
    </form>
  );
}
