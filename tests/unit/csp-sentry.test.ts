/**
 * La CSP tiene que dejar pasar los reportes de Sentry del navegador.
 *
 * Este test existe por un fallo real: el host de ingesta de Sentry no estaba en
 * `connect-src`, así que el navegador descartaba cada reporte. **La CSP no
 * rompe la página cuando bloquea algo** —solo tira la petición y sigue— así que
 * no se notó hasta que alguien miró la consola: los errores del cliente en
 * producción llevaban tiempo sin llegar a ninguna parte.
 *
 * Es el peor tipo de fallo: la herramienta con la que se diagnostican los demás
 * fallos, apagada y sin avisar.
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";

const DSN_ORIGINAL = process.env.NEXT_PUBLIC_SENTRY_DSN;

async function csp(): Promise<string> {
  // Import fresco: el módulo lee process.env al evaluarse.
  const mod = await import("@/lib/security/headers?" + Date.now());
  const headers = (
    mod as { buildSecurityHeaders: () => { key: string; value: string }[] }
  ).buildSecurityHeaders();
  return headers.find((h) => h.key === "Content-Security-Policy")?.value ?? "";
}

beforeEach(() => {
  delete process.env.NEXT_PUBLIC_SENTRY_DSN;
});

afterEach(() => {
  if (DSN_ORIGINAL) process.env.NEXT_PUBLIC_SENTRY_DSN = DSN_ORIGINAL;
  else delete process.env.NEXT_PUBLIC_SENTRY_DSN;
});

describe("CSP · connect-src", () => {
  it("con DSN configurado, el host de Sentry aparece en connect-src", async () => {
    process.env.NEXT_PUBLIC_SENTRY_DSN =
      "https://abc123@o4511626569121792.ingest.us.sentry.io/4511626581901312";
    const valor = await csp();
    expect(valor).toContain("https://o4511626569121792.ingest.us.sentry.io");
  });

  it("el host sale del DSN, no de una constante: si cambia el proyecto, la CSP lo sigue", async () => {
    process.env.NEXT_PUBLIC_SENTRY_DSN = "https://k@o999.ingest.de.sentry.io/1";
    expect(await csp()).toContain("https://o999.ingest.de.sentry.io");
  });

  it("sin DSN no se agrega nada: Sentry ya es inerte ahí", async () => {
    const valor = await csp();
    expect(valor).not.toContain("sentry.io");
  });

  it("un DSN mal formado no rompe la CSP", async () => {
    process.env.NEXT_PUBLIC_SENTRY_DSN = "esto-no-es-una-url";
    const valor = await csp();
    expect(valor).toContain("connect-src");
    expect(valor).not.toContain("esto-no-es-una-url");
  });
});
