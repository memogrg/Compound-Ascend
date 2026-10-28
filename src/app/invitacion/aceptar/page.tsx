/**
 * Aceptación de invitación a un hogar: /invitacion/aceptar?token=...
 * - Sin sesión: invita a registrarse con el correo prellenado (o a iniciar sesión primero, si
 *   ese correo ya tiene cuenta) y vuelve aquí.
 * - Con sesión y correo coincidente: muestra el botón para unirse al hogar; si vuelve del
 *   login o del registro (`auto=1`), la acepta sola.
 * - Con sesión y correo distinto: pide iniciar sesión con el correo invitado.
 */
import Link from "next/link";
import { AuthShell } from "@/components/auth/auth-shell";
import { getUser, isSupabaseConfigured } from "@/lib/auth/session";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { AcceptInvitation } from "@/modules/personal-profile/components/accept-invitation";
import { AceptarAlVolver } from "@/modules/personal-profile/components/aceptar-al-volver";

export const metadata = { title: "Aceptar invitación — CARTERA+" };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const TITLE_HTML = 'Invitación a tu <span class="it">hogar</span>';

function Shell({ subtitle, children }: { subtitle: string; children?: React.ReactNode }) {
  return (
    <AuthShell titleHTML={TITLE_HTML} subtitle={subtitle}>
      {children}
    </AuthShell>
  );
}

export default async function AcceptInvitationPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string; auto?: string }>;
}) {
  const { token, auto } = await searchParams;

  if (!token || !UUID_RE.test(token)) {
    return <Shell subtitle="Este enlace de invitación no es válido o está incompleto." />;
  }
  if (!isSupabaseConfigured()) {
    return <Shell subtitle="El servicio no está disponible en este momento. Intentá más tarde." />;
  }

  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.rpc("get_invitation_by_token", { p_token: token });
  const invitation = data?.[0];

  if (!invitation) {
    return <Shell subtitle="No encontramos esta invitación. Es posible que se haya revocado." />;
  }
  if (invitation.status !== "pending" || invitation.expired) {
    return (
      <Shell subtitle="Esta invitación ya no está disponible (fue aceptada, revocada o expiró). Pedí una nueva al administrador del hogar." />
    );
  }

  const user = await getUser();
  // A dónde se vuelve después de autenticarse. `auto=1` marca que ya eligió unirse: al volver,
  // la invitación se acepta sola.
  const next = `/invitacion/aceptar?token=${token}&auto=1`;

  // Sin sesión: autenticarse con el correo invitado y volver a este enlace.
  if (!user) {
    const signupHref = `/signup?email=${encodeURIComponent(invitation.email)}&next=${encodeURIComponent(next)}`;
    const loginHref = `/login?next=${encodeURIComponent(next)}`;
    // Si ese correo ya tiene cuenta, lo primero es iniciar sesión, no registrarse otra vez.
    // Ante cualquier fallo, el orden de siempre (registrarse primero).
    const { data: tieneCuenta } = await supabase.rpc("invitation_email_has_account", {
      p_token: token,
    });
    if (tieneCuenta === true) {
      return (
        <Shell
          subtitle={`${invitation.inviter_name} te invitó al hogar ${invitation.household_name}. Iniciá sesión con ${invitation.email} para unirte.`}
        >
          <Link
            href={loginHref}
            className="btn btn-primary"
            style={{ width: "100%", textAlign: "center" }}
          >
            Iniciar sesión y unirme
          </Link>
          <div className="auth-divider">o</div>
          <Link
            href={signupHref}
            className="btn btn-secondary"
            style={{ width: "100%", textAlign: "center" }}
          >
            Crear cuenta
          </Link>
        </Shell>
      );
    }
    return (
      <Shell
        subtitle={`${invitation.inviter_name} te invitó al hogar ${invitation.household_name}. Creá tu cuenta con ${invitation.email} para unirte.`}
      >
        <Link
          href={signupHref}
          className="btn btn-primary"
          style={{ width: "100%", textAlign: "center" }}
        >
          Crear cuenta y unirme
        </Link>
        <div className="auth-divider">¿ya tenés cuenta?</div>
        <Link
          href={loginHref}
          className="btn btn-secondary"
          style={{ width: "100%", textAlign: "center" }}
        >
          Iniciar sesión
        </Link>
      </Shell>
    );
  }

  // Con sesión pero correo distinto al invitado.
  if ((user.email ?? "").toLowerCase() !== invitation.email.toLowerCase()) {
    return (
      <Shell
        subtitle={`Esta invitación es para ${invitation.email}, pero tu sesión usa otro correo. Iniciá sesión con el correo invitado para aceptarla.`}
      >
        <Link
          href={`/login?next=${encodeURIComponent(next)}`}
          className="btn btn-secondary"
          style={{ width: "100%", textAlign: "center" }}
        >
          Cambiar de cuenta
        </Link>
      </Shell>
    );
  }

  // De vuelta del login o del registro con el correo invitado: se acepta sola.
  if (auto === "1") {
    return (
      <Shell
        subtitle={`${invitation.inviter_name} te invitó al hogar ${invitation.household_name}.`}
      >
        <AceptarAlVolver token={token} inviterName={invitation.inviter_name} />
      </Shell>
    );
  }

  // Con sesión y correo coincidente, entrando directo por el enlace: aceptar con un clic.
  return (
    <Shell subtitle="Estás a un paso de unirte.">
      <AcceptInvitation
        token={token}
        inviterName={invitation.inviter_name}
        householdName={invitation.household_name}
      />
    </Shell>
  );
}
