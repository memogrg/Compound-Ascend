import Link from "next/link";
import { getAccountInfo } from "@/modules/account/services/account-service";
import { MobileMenu } from "../../components/mobile-menu";
import { getMyLink } from "@/lib/whatsapp/links-service";
import { isWhatsAppConfigured } from "@/lib/whatsapp";
import { signOutAction } from "@/lib/auth/actions";
import { PLAN_LABEL } from "@/lib/plan";
import { isSupabaseConfigured, getUser } from "@/lib/auth/session";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { isActiveHouseholdEditor } from "@/lib/household/active";
import {
  listMyIngestEmails,
  type IngestEmailRow,
} from "@/modules/account/services/ingest-email-service";
import { ConfiguracionManager } from "./configuracion-manager";

/**
 * /m/perfil — identidad + ajustes agrupados (plan, moneda, WhatsApp, hogar, cuenta).
 * Reutiliza la MISMA lógica de la web: getAccountInfo (identidad/plan/uso IA/moneda),
 * getMyLink (WhatsApp) y la Server Action signOutAction (cerrar sesión).
 * Piel del diseño (data-screen="configuracion"), es-MX tono "tú", tema claro.
 */
export const dynamic = "force-dynamic"; // datos por sesión

/** Compacta enteros grandes tipo "128k" (para el uso de tokens de IA). */
function tk(n: number): string {
  return n >= 1000 ? `${(n / 1000).toFixed(n % 1000 === 0 ? 0 : 1)}k` : String(Math.round(n));
}

export default async function MobilePerfil() {
  const acc = await getAccountInfo();
  const wa = await getMyLink().catch(() => null);
  const whatsappConfigured = isWhatsAppConfigured();

  // Datos extra para la gestión (best-effort: si algo falla, degradamos sin romper).
  let ingestEmails: IngestEmailRow[] = [];
  let isEditor = true; // en modo solo, el usuario es dueño de sus datos → puede invitar (crea hogar)
  if (isSupabaseConfigured()) {
    try {
      ingestEmails = await listMyIngestEmails();
    } catch {
      ingestEmails = [];
    }
    try {
      const user = await getUser();
      if (user) {
        const supabase = await createSupabaseServerClient();
        isEditor = await isActiveHouseholdEditor(supabase, user.id);
      }
    } catch {
      isEditor = true;
    }
  }

  const initials = (acc.name || acc.email || "CA").slice(0, 2).toUpperCase();
  const usePct = acc.tokenLimit > 0 ? Math.min(1, acc.tokensUsed / acc.tokenLimit) : 0;

  return (
    <div className="m-scroll">
      <div className="m-pad">
        <div className="between" style={{ marginBottom: 16 }}>
          <div>
            <div className="ov">Cuenta</div>
            <div className="h-title" style={{ marginTop: 6 }}>
              Configuración
            </div>
          </div>
          <MobileMenu />
        </div>

        {/* Identidad */}
        <div className="card card-p" style={{ marginBottom: 14 }}>
          <div className="row" style={{ gap: 14 }}>
            <span
              style={{
                width: 52,
                height: 52,
                borderRadius: "50%",
                background: "var(--accent)",
                color: "var(--accent-ink)",
                display: "grid",
                placeItems: "center",
                fontFamily: "var(--font-display)",
                fontWeight: 700,
                fontSize: 19,
                flex: "none",
              }}
            >
              {initials}
            </span>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 700, fontSize: 16 }}>{acc.name ?? "Tu cuenta"}</div>
              <div className="muted" style={{ fontSize: 13 }}>
                {acc.email ?? "Sesión activa"}
              </div>
            </div>
          </div>
        </div>

        {/* Acceso a Mi Perfil Financiero: muestra resultados si está completo, o el wizard */}
        <Link
          href="/m/mi-perfil-financiero"
          className="card card-p srow"
          style={{ marginBottom: 14, textDecoration: "none", color: "inherit" }}
        >
          <span className="lic" style={{ background: "var(--accent-soft)", color: "var(--accent)" }} aria-hidden>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round" style={{ width: 18, height: 18 }}>
              <path d="M12 2a7 7 0 0 0-4 12.7V17a2 2 0 0 0 2 2h4a2 2 0 0 0 2-2v-2.3A7 7 0 0 0 12 2Z" />
              <path d="M9 22h6" />
            </svg>
          </span>
          <div style={{ flex: 1 }}>
            <div className="st">Tu ADN financiero</div>
            <div className="ss">Completa o edita tu perfil financiero</div>
          </div>
          <Chevron />
        </Link>

        {/* Plan + uso de IA */}
        <div className="card card-p" style={{ marginBottom: 14 }}>
          <div className="between" style={{ marginBottom: 12 }}>
            <span className="badge neutral">Plan {PLAN_LABEL[acc.plan]}</span>
            <span className="mono" style={{ fontSize: 11.5, color: "var(--text-muted)" }}>
              {tk(acc.tokensUsed)} / {tk(acc.tokenLimit)} tokens
            </span>
          </div>
          <div className="bar" style={{ height: 8 }}>
            <i style={{ width: `${Math.round(usePct * 100)}%` }} />
          </div>
          <div className="muted" style={{ fontSize: 11, marginTop: 9 }}>
            Uso de IA este mes. El consumo se calcula en el servidor.
          </div>
        </div>

        {/* Ajustes gestionables (moneda · WhatsApp · hogar · notificaciones · ingesta · borrar) */}
        <ConfiguracionManager
          currency={acc.currency}
          notifications={acc.notifications}
          wa={wa}
          whatsappConfigured={whatsappConfigured}
          ingestEmails={ingestEmails}
          isEditor={isEditor}
        />

        {/* Cerrar sesión (Server Action reutilizada de la web) */}
        <form action={signOutAction.bind(null, "/m/login")}>
          <button className="m-btn m-btn-block m-btn-secondary" type="submit" style={{ color: "var(--danger)" }}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} style={{ width: 18, height: 18 }}>
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            Cerrar sesión
          </button>
        </form>
      </div>
    </div>
  );
}

function Chevron() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="var(--text-dim)" strokeWidth={2} className="sr" style={{ width: 18, height: 18 }} aria-hidden>
      <path d="M9 6l6 6-6 6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

