/**
 * Invitación al hogar: quien se autentica desde el enlace vuelve con `auto=1` y la invitación
 * se acepta sola; quien entra directo con sesión sigue viendo el botón; un correo distinto
 * sigue viendo el aviso de siempre. Sin sesión, si el correo invitado ya tiene cuenta, el botón
 * principal es iniciar sesión.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

const TOKEN = "11111111-2222-4333-8444-555555555555";

const s = vi.hoisted(() => ({
  user: null as { id: string; email: string } | null,
  tieneCuenta: { data: false as boolean | null, error: null as { message: string } | null },
}));

vi.mock("@/lib/auth/session", () => ({
  isSupabaseConfigured: () => true,
  getUser: async () => s.user,
}));
vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: async () => ({
    rpc: async (fn: string) =>
      fn === "invitation_email_has_account"
        ? s.tieneCuenta
        : {
            data: [
              {
                email: "ana@example.com",
                status: "pending",
                expired: false,
                inviter_name: "José",
                household_name: "Casa Mora",
              },
            ],
          },
  }),
}));
vi.mock("@/components/auth/auth-shell", () => ({
  AuthShell: ({ subtitle, children }: { subtitle: string; children?: React.ReactNode }) => (
    <div>
      <p data-subtitle>{subtitle}</p>
      {children}
    </div>
  ),
}));
vi.mock("@/modules/personal-profile/components/accept-invitation", () => ({
  AcceptInvitation: () => <div data-boton-aceptar />,
}));
vi.mock("@/modules/personal-profile/api/actions", () => ({
  acceptInvitationAction: vi.fn(),
}));

import AcceptInvitationPage from "@/app/invitacion/aceptar/page";
import { intentarAceptar } from "@/modules/personal-profile/components/aceptar-al-volver";

async function pagina(params: { token?: string; auto?: string }) {
  return renderToStaticMarkup(
    await AcceptInvitationPage({ searchParams: Promise.resolve(params) }),
  );
}

const NEXT_AUTO = encodeURIComponent(`/invitacion/aceptar?token=${TOKEN}&auto=1`);

beforeEach(() => {
  s.user = null;
  s.tieneCuenta = { data: false, error: null };
});

/** Texto de los botones, en el orden en que aparecen. */
const botones = (html: string) =>
  [...html.matchAll(/class="btn (btn-\w+)"[^>]*>([^<]+)</g)].map((m) => `${m[1]}:${m[2]}`);

describe("/invitacion/aceptar", () => {
  it("sin sesión: crear cuenta e iniciar sesión vuelven con auto=1", async () => {
    const html = await pagina({ token: TOKEN });
    expect(html).toContain(`/signup?email=ana%40example.com&amp;next=${NEXT_AUTO}`);
    expect(html).toContain(`/login?next=${NEXT_AUTO}`);
  });

  it("sin sesión y el correo ya tiene cuenta: iniciar sesión primero", async () => {
    s.tieneCuenta = { data: true, error: null };
    const html = await pagina({ token: TOKEN });
    expect(botones(html)).toEqual([
      "btn-primary:Iniciar sesión y unirme",
      "btn-secondary:Crear cuenta",
    ]);
    expect(html).toContain(`/login?next=${NEXT_AUTO}`);
    expect(html).toContain(`/signup?email=ana%40example.com&amp;next=${NEXT_AUTO}`);
  });

  it("sin sesión y el correo sin cuenta: registrarse primero, como hoy", async () => {
    const html = await pagina({ token: TOKEN });
    expect(botones(html)).toEqual([
      "btn-primary:Crear cuenta y unirme",
      "btn-secondary:Iniciar sesión",
    ]);
  });

  it("sin sesión y la RPC falla: el orden de siempre", async () => {
    s.tieneCuenta = { data: null, error: { message: "function does not exist" } };
    const html = await pagina({ token: TOKEN });
    expect(botones(html)[0]).toBe("btn-primary:Crear cuenta y unirme");
  });

  it("de vuelta con auto=1 y el correo invitado: se acepta sola", async () => {
    s.user = { id: "u1", email: "Ana@Example.com" };
    const html = await pagina({ token: TOKEN, auto: "1" });
    expect(html).toContain("Uniéndote al hogar…");
    expect(html).not.toContain("data-boton-aceptar");
  });

  it("con sesión pero sin auto (entró directo por el enlace): el botón de siempre", async () => {
    s.user = { id: "u1", email: "ana@example.com" };
    const html = await pagina({ token: TOKEN });
    expect(html).toContain("data-boton-aceptar");
    expect(html).not.toContain("Uniéndote al hogar");
  });

  it("de vuelta con otro correo: el aviso de hoy, sin aceptar nada", async () => {
    s.user = { id: "u2", email: "otra@example.com" };
    const html = await pagina({ token: TOKEN, auto: "1" });
    expect(html).toContain("Esta invitación es para ana@example.com");
    expect(html).toContain(`/login?next=${NEXT_AUTO}`);
    expect(html).not.toContain("Uniéndote al hogar");
    expect(html).not.toContain("data-boton-aceptar");
  });
});

describe("intentarAceptar", () => {
  it("la RPC acepta → lista", async () => {
    const accion = vi.fn(async () => ({ ok: true }));
    await expect(intentarAceptar(TOKEN, accion)).resolves.toEqual({
      estado: "lista",
      mensaje: null,
    });
    expect(accion).toHaveBeenCalledWith(TOKEN);
  });

  it("la RPC falla → error con el mensaje de la acción (para reintentar)", async () => {
    const accion = async () => ({ ok: false, message: "La invitación expiró." });
    await expect(intentarAceptar(TOKEN, accion)).resolves.toEqual({
      estado: "error",
      mensaje: "La invitación expiró.",
    });
  });

  it("la acción lanza → error genérico, nunca una excepción", async () => {
    const accion = async () => {
      throw new Error("red");
    };
    await expect(intentarAceptar(TOKEN, accion)).resolves.toEqual({
      estado: "error",
      mensaje: "No pudimos unirte al hogar. Intentá de nuevo.",
    });
  });
});
