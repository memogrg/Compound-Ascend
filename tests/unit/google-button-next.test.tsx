/**
 * El botón de Google conserva `next`: quien abre una invitación al hogar
 * (/signup?next=/invitacion/aceptar?token=…) y entra con Google tiene que volver a aceptar la
 * invitación, no caer en /dashboard (y de ahí al muro de /empezar).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

const oauth = vi.hoisted(() =>
  vi.fn(async (_o: { provider: string; options: { redirectTo: string } }) => ({
    data: { url: "https://accounts.google.test/auth" },
    error: null,
  })),
);
const redirect = vi.hoisted(() =>
  vi.fn((url: string) => {
    throw new Error(`REDIRECT:${url}`);
  }),
);

vi.mock("server-only", () => ({}));
vi.mock("next/navigation", () => ({ redirect }));
vi.mock("next/headers", () => ({ headers: async () => new Headers() }));
vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: async () => ({ auth: { signInWithOAuth: oauth } }),
}));
vi.mock("@/lib/supabase/service-role", () => ({ createServiceRoleClient: () => ({}) }));
vi.mock("@/lib/logger", () => ({ logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn() } }));
vi.mock("@/lib/legal/aceptacion", () => ({ registrarAceptacionConServicio: vi.fn() }));

import { GoogleButton } from "@/components/auth/google-button";
import { signInWithGoogleAction } from "@/lib/auth/actions";

const INVITACION = "/invitacion/aceptar?token=abc123";

beforeEach(() => {
  oauth.mockClear();
  redirect.mockClear();
  vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://app.test");
});

describe("GoogleButton", () => {
  it("con next: manda el hidden con ese destino", () => {
    const html = renderToStaticMarkup(<GoogleButton next={INVITACION} />);
    expect(html).toContain('type="hidden"');
    expect(html).toContain('name="next"');
    expect(html).toContain('value="/invitacion/aceptar?token=abc123"');
  });

  it("sin next: no hay hidden", () => {
    const html = renderToStaticMarkup(<GoogleButton />);
    expect(html).not.toContain('name="next"');
  });
});

describe("signInWithGoogleAction", () => {
  async function redirectToCon(next: string | null): Promise<string> {
    const fd = new FormData();
    if (next !== null) fd.set("next", next);
    await signInWithGoogleAction(fd).catch(() => {});
    return oauth.mock.calls[0]![0].options.redirectTo;
  }

  it("con la invitación: el callback lleva ese next codificado", async () => {
    expect(await redirectToCon(INVITACION)).toBe(
      `https://app.test/auth/callback?next=${encodeURIComponent(INVITACION)}`,
    );
    expect(redirect).toHaveBeenCalledWith("https://accounts.google.test/auth");
  });

  it("sin next: vuelve a /dashboard, como siempre", async () => {
    expect(await redirectToCon(null)).toBe(
      `https://app.test/auth/callback?next=${encodeURIComponent("/dashboard")}`,
    );
  });

  it("un next externo no pasa: cae a /dashboard", async () => {
    expect(await redirectToCon("https://evil.test/robo")).toBe(
      `https://app.test/auth/callback?next=${encodeURIComponent("/dashboard")}`,
    );
  });
});
