import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: vi.fn(),
}));

import { createSupabaseServerClient } from "@/lib/supabase/server";
import * as callbackRoute from "@/app/auth/callback/route";

function createRequest(code: string | null, next = "/dashboard") {
  const url = new URL("https://example.com/auth/callback");
  if (code !== null) url.searchParams.set("code", code);
  url.searchParams.set("next", next);
  return new Request(url.toString());
}

describe("auth callback route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("deduplicates concurrent callback exchanges for the same code", async () => {
    let resolveExchange: (value: unknown) => void;
    const exchangeDeferred = new Promise((resolve) => {
      resolveExchange = resolve;
    });

    const exchangeCodeForSession = vi.fn(() => exchangeDeferred);
    const mockCreateServerClient = vi.mocked(createSupabaseServerClient);
    mockCreateServerClient.mockReturnValue({
      auth: { exchangeCodeForSession },
    } as any);

    const request = createRequest("abc123", "/dashboard");

    const first = callbackRoute.GET(request);
    await Promise.resolve();
    const second = callbackRoute.GET(request);

    expect(exchangeCodeForSession).toHaveBeenCalledTimes(1);

    resolveExchange!({ error: null });
    const [result1, result2] = await Promise.all([first, second]);

    expect(result1.status).toBe(307);
    expect(result2.status).toBe(307);
    expect(result1.headers.get("location")).toBe("https://example.com/dashboard");
    expect(result2.headers.get("location")).toBe("https://example.com/dashboard");
  });

  /**
   * Un `code` ya consumido tiene dos lecturas, y antes se trataban igual: se redirigía
   * a `next` sin comprobar nada. Eso convertía el callback en un trampolín — bastaba
   * un `code` inventado y un `next` hostil para tener un enlace con nuestra pinta que
   * termina en otro sitio. Ahora el pase lo da la SESIÓN.
   */
  function clienteConCodigoUsado(user: unknown) {
    const exchangeCodeForSession = vi.fn().mockResolvedValue({
      error: { status: 400, message: "This authorization code has already been used" },
    });
    const getUser = vi.fn().mockResolvedValue({ data: { user } });
    vi.mocked(createSupabaseServerClient).mockReturnValue({
      auth: { exchangeCodeForSession, getUser },
    } as any);
    return { exchangeCodeForSession, getUser };
  }

  it("código ya usado CON sesión viva: sigue a next (abrir el enlace dos veces)", async () => {
    clienteConCodigoUsado({ id: "u-1" });

    const response = await callbackRoute.GET(createRequest("used-code", "/dashboard"));

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe("https://example.com/dashboard");
  });

  it("código ya usado SIN sesión: a la pantalla de error, NUNCA a next", async () => {
    clienteConCodigoUsado(null);

    const response = await callbackRoute.GET(createRequest("used-code", "/dashboard"));

    expect(response.headers.get("location")).toBe("https://example.com/login?error=auth");
  });

  it("un next hostil no sale del sitio ni siquiera con la sesión viva", async () => {
    clienteConCodigoUsado({ id: "u-1" });

    // `/\evil.com` pasaba el validador viejo y resolvía a https://evil.com/.
    const response = await callbackRoute.GET(createRequest("used-code", "/\\evil.com"));

    const destino = new URL(response.headers.get("location")!);
    expect(destino.origin).toBe("https://example.com");
    expect(destino.pathname).toBe("/dashboard");
  });

  it("el móvil cae en SU pantalla de entrada, no en la web", async () => {
    clienteConCodigoUsado(null);

    const response = await callbackRoute.GET(createRequest("used-code", "/m/gastos"));

    expect(response.headers.get("location")).toBe("https://example.com/m/login?error=auth");
  });
});
