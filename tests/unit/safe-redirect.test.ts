/**
 * Open redirect en el callback de autenticación.
 *
 * El validador viejo —repetido en tres archivos— era
 * `startsWith("/") && !startsWith("//")`, y deja pasar `/\evil.com`, que el parser de
 * URL resuelve a `https://evil.com/`. Los navegadores tratan `\` como `/`, así que un
 * `Location: /\evil.com` saca a la persona del sitio. En un callback de auth eso
 * entrega a alguien recién autenticado a una página de phishing.
 *
 * Estos casos son la red. Cada uno que salga del sitio es una vulnerabilidad, no un
 * detalle de formato: por eso el test comprueba el ORIGEN resuelto y no solo la cadena.
 */
import { describe, it, expect } from "vitest";
import { safeInternalPath } from "@/lib/security/safe-redirect";

const FALLBACK = "/dashboard";

/** El sitio real, para comprobar a dónde llevaría de verdad lo que devolvemos. */
const SITIO = "https://carteraplus.vercel.app";

describe("safeInternalPath", () => {
  describe("deja pasar rutas internas", () => {
    it("una ruta simple", () => {
      expect(safeInternalPath("/dashboard", FALLBACK)).toBe("/dashboard");
    });

    it("conserva query y hash", () => {
      expect(safeInternalPath("/m?x=1#y", FALLBACK)).toBe("/m?x=1#y");
    });

    it("normaliza, pero sigue adentro", () => {
      expect(safeInternalPath("/a/./b", FALLBACK)).toBe("/a/b");
    });
  });

  describe("rechaza todo lo que sale del sitio", () => {
    const HOSTILES: [string, unknown][] = [
      ["protocol-relative", "//evil.com"],
      ["contrabarra (el bug)", "/\\evil.com"],
      ["contrabarra codificada", "/%5Cevil.com"],
      ["contrabarra codificada en minúscula", "/%5cevil.com"],
      ["contrabarra al medio", "/algo\\evil.com"],
      ["origen absoluto", "https://evil.com"],
      ["otro protocolo", "javascript:alert(1)"],
      ["datos embebidos", "data:text/html,<script>alert(1)</script>"],
      ["ruta relativa", "dashboard"],
      ["cadena vacía", ""],
      ["solo espacios", "   "],
      ["null", null],
      ["undefined", undefined],
      ["número", 42],
      ["objeto", { toString: () => "/dashboard" }],
      ["inyección de cabecera", "/a\r\nLocation: https://evil.com"],
      ["tab, que el parser ignora", "/\tevil.com"],
      ["nul", "/a\u0000b"],
    ];

    for (const [nombre, entrada] of HOSTILES) {
      it(`${nombre} → fallback`, () => {
        expect(safeInternalPath(entrada, FALLBACK)).toBe(FALLBACK);
      });
    }

    it("una cadena enorme → fallback", () => {
      expect(safeInternalPath("/" + "a".repeat(5000), FALLBACK)).toBe(FALLBACK);
    });
  });

  it("lo que devuelve NUNCA sale del sitio, sea cual sea la entrada", () => {
    const entradas = [
      "/dashboard",
      "//evil.com",
      "/\\evil.com",
      "/%5Cevil.com",
      "https://evil.com",
      "javascript:alert(1)",
      "/a\r\nLocation: x",
      "/\tevil.com",
      "",
      null,
      "/" + "a".repeat(5000),
    ];
    for (const entrada of entradas) {
      const salida = safeInternalPath(entrada, FALLBACK);
      expect(new URL(salida, SITIO).origin).toBe(SITIO);
    }
  });

  it("respeta el fallback que le den (cada llamador tiene el suyo)", () => {
    expect(safeInternalPath("//evil.com", "/m")).toBe("/m");
    expect(safeInternalPath(null, "/bienvenida")).toBe("/bienvenida");
    expect(safeInternalPath("https://evil.com", "/")).toBe("/");
  });

  it("el validador VIEJO habría dejado pasar el ataque (por eso existe este cambio)", () => {
    const viejo = (n: string) => (!n || !n.startsWith("/") || n.startsWith("//") ? FALLBACK : n);
    const ataque = "/\\evil.com";

    // Así estaba: pasaba el filtro y resolvía a otro dominio.
    expect(viejo(ataque)).toBe(ataque);
    expect(new URL(viejo(ataque), SITIO).origin).toBe("https://evil.com");

    // Así queda.
    expect(safeInternalPath(ataque, FALLBACK)).toBe(FALLBACK);
  });
});
