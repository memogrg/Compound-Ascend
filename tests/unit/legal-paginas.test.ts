/**
 * Las tres páginas legales tienen que abrir SIN sesión.
 *
 * Play Console y App Store las revisan desde fuera de la app: si el middleware las
 * manda a /login, la revisión se rechaza y el motivo ni siquiera menciona el login —
 * dice que la URL de privacidad no es válida. Por eso el test mira lo que decide de
 * verdad: la lista de prefijos públicos.
 *
 * Se lee el fuente del middleware en vez de importarlo porque `updateSession` arrastra
 * `@supabase/ssr` y el entorno de Next; acá solo interesa la tabla.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const RAIZ = fileURLToPath(new URL("../..", import.meta.url));

function leer(rel: string): string {
  return readFileSync(RAIZ + rel, "utf8");
}

const RUTAS = ["/privacidad", "/terminos", "/eliminar-cuenta"] as const;

describe("páginas legales", () => {
  const middleware = leer("src/lib/supabase/middleware.ts");

  it("las tres son públicas en el middleware", () => {
    const bloque = middleware.slice(
      middleware.indexOf("const PUBLIC_PREFIXES"),
      middleware.indexOf("];", middleware.indexOf("const PUBLIC_PREFIXES")),
    );
    for (const r of RUTAS) expect(bloque).toContain(`"${r}"`);
  });

  it("cada ruta existe como página", () => {
    for (const r of RUTAS) {
      expect(() => leer(`src/app${r}/page.tsx`)).not.toThrow();
    }
  });

  it("cada página declara metadata con título propio", () => {
    for (const r of RUTAS) {
      const src = leer(`src/app${r}/page.tsx`);
      expect(src).toContain("export const metadata");
      expect(src).toMatch(/title:\s*"[^"]*CARTERA\+"/);
      expect(src).toMatch(/description:/);
    }
  });

  it("las tres muestran «Última actualización» y la versión, desde la constante única", () => {
    // El shell las pinta una sola vez para las tres: si alguien las escribiera a mano
    // en cada página, tarde o temprano dirían fechas distintas.
    const shell = leer("src/components/marketing/v3/legal-shell.tsx");
    expect(shell).toContain("Última actualización");
    expect(shell).toContain("LEGAL_VERSION");
    for (const r of RUTAS) expect(leer(`src/app${r}/page.tsx`)).toContain("LegalShell");
  });

  it("la versión tiene forma de fecha ISO (la usará el registro de aceptación)", () => {
    const version = leer("src/lib/legal/version.ts");
    expect(version).toMatch(/LEGAL_VERSION = "\d{4}-\d{2}-\d{2}"/);
  });

  it("el correo de privacidad NO es el buzón de ingesta", () => {
    // communications@ lo lee el poller IMAP: un mensaje de una persona quedaría
    // mezclado con los avisos bancarios reenviados, y probablemente sin respuesta.
    const version = leer("src/lib/legal/version.ts");
    expect(version).toContain("privacidad@aitechumbrella.com");
    expect(version).not.toContain("communications@aitechumbrella.com");
  });

  it("se llega a privacidad y términos desde los pies de marketing", () => {
    for (const f of [
      "src/components/marketing/v3/faqs.tsx",
      "src/components/marketing/v3/landing.tsx",
    ]) {
      const src = leer(f);
      expect(src).toContain('href="/privacidad"');
      expect(src).toContain('href="/terminos"');
    }
  });

  it("las pantallas de entrada y registro llevan el pie de aceptación", () => {
    for (const f of [
      "src/app/(auth)/login/page.tsx",
      "src/app/(auth)/signup/page.tsx",
      "src/app/(mobile)/m/login/page.tsx",
      "src/app/(mobile)/m/signup/page.tsx",
    ]) {
      expect(leer(f)).toContain("PieLegal");
    }
  });

  it("el móvil usa «tú» y la web voseo, como el resto de cada plataforma", () => {
    for (const f of ["src/app/(mobile)/m/login/page.tsx", "src/app/(mobile)/m/signup/page.tsx"]) {
      expect(leer(f)).toContain('voz="tu"');
    }
    for (const f of ["src/app/(auth)/login/page.tsx", "src/app/(auth)/signup/page.tsx"]) {
      expect(leer(f)).not.toContain('voz="tu"');
    }
  });

  it("ajustes ofrece la sección Legal en las dos plataformas", () => {
    for (const f of [
      "src/app/(dashboard)/configuracion/page.tsx",
      "src/app/(mobile)/m/(app)/perfil/configuracion-manager.tsx",
    ]) {
      const src = leer(f);
      expect(src).toContain('"/privacidad"');
      expect(src).toContain('"/terminos"');
    }
  });
});
