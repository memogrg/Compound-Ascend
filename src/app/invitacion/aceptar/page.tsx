/**
 * Aceptación de invitación a un hogar: /invitacion/aceptar?token=...
 * - Sin sesión: invita a registrarse con el correo prellenado y vuelve aquí.
 * - Con sesión y correo coincidente: muestra el botón para unirse al hogar.
 * - Con sesión y correo distinto: pide iniciar sesión con el correo invitado.
 */
import Link from "next/link";
import { AuthShell } from "@/components/auth/auth-shell";
import { getUser, isSupabaseConfigured } from "@/lib/auth/session";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { AcceptInvitation } from "@/modules/personal-profile/components/accept-invitation";

export const metadata = { title: "Aceptar invitación — Compound Ascend" };

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
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;

  if (!token || !UUID_RE.test(token)) {
    return <Shell subtitle="Este enlace de invitación no es válido o está incompleto." />;
  }
  if (!isSupabaseConfigured()) {
    return <Shell subtitle="El servicio no está disponible en este momento. Inténtalo más tarde." />;
  }

  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.rpc("get_invitation_by_token", { p_token: token });
  const invitation = data?.[0];

  if (!invitation) {
    return <Shell subtitle="No encontramos esta invitación. Es posible que se haya revocado." />;
  }
  if (invitation.status !== "pending" || invitation.expired) {
    return (
      <Shell subtitle="Esta invitación ya no está disponible (fue aceptada, revocada o expiró). Pide una nueva al administrador del hogar." />
    );
  }

  const user = await getUser();

  // Sin sesión: registrarse con el correo invitado y volver a este enlace.
  if (!user) {
    const next = `/invitacion/aceptar?token=${token}`;
    const signupHref = `/signup?email=${encodeURIComponent(invitation.email)}&next=${encodeURIComponent(next)}`;
    const loginHref = `/login?next=${encodeURIComponent(next)}`;
    return (
      <Shell
        subtitle={`${invitation.inviter_name} te invitó al hogar ${invitation.household_name}. Crea tu cuenta con ${invitation.email} para unirte.`}
      >
        <Link href={signupHref} className="btn btn-primary" style={{ width: "100%", textAlign: "center" }}>
          Crear cuenta y unirme
        </Link>
        <div className="auth-divider">¿ya tienes cuenta?</div>
        <Link href={loginHref} className="btn btn-secondary" style={{ width: "100%", textAlign: "center" }}>
          Iniciar sesión
        </Link>
      </Shell>
    );
  }

  // Con sesión pero correo distinto al invitado.
  if ((user.email ?? "").toLowerCase() !== invitation.email.toLowerCase()) {
    const next = `/invitacion/aceptar?token=${token}`;
    return (
      <Shell
        subtitle={`Esta invitación es para ${invitation.email}, pero tu sesión usa otro correo. Inicia sesión con el correo invitado para aceptarla.`}
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

  // Con sesión y correo coincidente: aceptar.
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
