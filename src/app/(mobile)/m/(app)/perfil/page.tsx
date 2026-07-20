import { getAccountInfo } from "@/modules/account/services/account-service";
import { MobileHeader } from "../../components/mobile-header";
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
import {
  MSectionHeader,
  MContentCard,
  MDataRow,
  MProgress,
} from "../../components/content-kit";
import { ConfiguracionManager } from "./configuracion-manager";
import { BuildIdentity } from "./build-identity";

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
        <MobileHeader variant="inner" home eyebrow="Cuenta" title="Configuración" />

        {/* Identidad — avatar + nombre + correo. Cabecera honesta de la cuenta (sin métricas
            inventadas): superficie del kit para igualar el resto del barrido. */}
        <MContentCard style={{ marginBottom: 14 }}>
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
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 700, fontSize: 16 }}>{acc.name ?? "Tu cuenta"}</div>
              <div
                className="muted"
                style={{ fontSize: 13, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
              >
                {acc.email ?? "Sesión activa"}
              </div>
            </div>
          </div>
        </MContentCard>

        {/* Cuenta: acceso al ADN financiero (navegación) + el uso de IA del plan (métrica real). */}
        <MSectionHeader title="Cuenta" />
        <MContentCard style={{ marginBottom: 14 }}>
          {/* Acceso a Mi Perfil Financiero: muestra resultados si está completo, o el wizard.
              `leading` = el glifo propio (no hay uno equivalente en el set de MIcon). */}
          <MDataRow
            href="/m/mi-perfil-financiero"
            leading={
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round" style={{ width: 19, height: 19 }}>
                <path d="M12 2a7 7 0 0 0-4 12.7V17a2 2 0 0 0 2 2h4a2 2 0 0 0 2-2v-2.3A7 7 0 0 0 12 2Z" />
                <path d="M9 22h6" />
              </svg>
            }
            title="Tu ADN financiero"
            subtitle="Completa o edita tu perfil"
            chevron
          />
          {/* Uso de IA: es una métrica de verdad → MDataRow + barra MProgress (no una rejilla inventada). */}
          <MDataRow
            title={`Plan ${PLAN_LABEL[acc.plan]}`}
            subtitle="Uso de IA este mes"
            value={`${tk(acc.tokensUsed)} / ${tk(acc.tokenLimit)}`}
            slot={<MProgress value={usePct} tone="success" height={8} />}
          />
        </MContentCard>

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

        {/* Identidad del build: en dos segundos sabes si esto es producción o un build raro. */}
        <BuildIdentity />
      </div>
    </div>
  );
}

