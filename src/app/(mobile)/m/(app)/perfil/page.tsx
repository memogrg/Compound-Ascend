import Link from "next/link";
import { getAccountInfo } from "@/modules/account/services/account-service";
import { MobileMenu } from "../../components/mobile-menu";
import { getMyLink } from "@/lib/whatsapp/links-service";
import { signOutAction } from "@/lib/auth/actions";
import { PLAN_LABEL } from "@/lib/plan";
import { currencySymbol } from "@/lib/format";

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

  const initials = (acc.name || acc.email || "CA").slice(0, 2).toUpperCase();
  const usePct = acc.tokenLimit > 0 ? Math.min(1, acc.tokensUsed / acc.tokenLimit) : 0;
  const waLinked = wa?.status === "active";
  const notif = acc.notifications;

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

        {/* Ajustes */}
        <div className="card card-p" style={{ marginBottom: 14 }}>
          <div className="srow">
            <span className="lic" style={{ background: "var(--surface-2)" }} aria-hidden>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.9} style={{ width: 18, height: 18 }}>
                <circle cx="12" cy="12" r="9" />
                <path d="M12 7v5l3 2" strokeLinecap="round" />
              </svg>
            </span>
            <div style={{ flex: 1 }}>
              <div className="st">Moneda principal</div>
              <div className="ss">
                {acc.currency} · {currencySymbol(acc.currency)}
              </div>
            </div>
            <Chevron />
          </div>
          <div className="srow">
            <span className="lic" style={{ background: "var(--accent-soft)", color: "var(--accent)" }} aria-hidden>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round" style={{ width: 18, height: 18 }}>
                <path d="M21 11.5a8.4 8.4 0 0 1-11.9 7.6L3 21l1.9-6A8.5 8.5 0 1 1 21 11.5Z" />
              </svg>
            </span>
            <div style={{ flex: 1 }}>
              <div className="st">WhatsApp</div>
              <div className={`ss ${waLinked ? "pos" : ""}`}>
                {waLinked ? `Vinculado · ${wa?.phone ?? ""}` : "No vinculado"}
              </div>
            </div>
            <Chevron />
          </div>
          <div className="srow">
            <span className="lic" style={{ background: "var(--surface-2)" }} aria-hidden>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round" style={{ width: 18, height: 18 }}>
                <path d="M4 11l8-6 8 6" />
                <path d="M6 10v9h12v-9" />
                <path d="M10 19v-5h4v5" />
              </svg>
            </span>
            <div style={{ flex: 1 }}>
              <div className="st">Hogar</div>
              <div className="ss">Miembros e invitaciones</div>
            </div>
            <Chevron />
          </div>
        </div>

        {/* Notificaciones (estado actual; se activan en un delta posterior) */}
        <div className="card card-p" style={{ marginBottom: 14 }}>
          <div className="ov" style={{ marginBottom: 6 }}>
            Notificaciones
          </div>
          <NotifRow label="En la app" desc='Avisos del día en "Qué noté".' on={notif.inApp} />
          <NotifRow label="Correo" desc="Resumen semanal." on={notif.email} />
          <NotifRow label="WhatsApp" desc="Resumen semanal por chat." on={notif.whatsapp} />
        </div>

        {/* Cerrar sesión (Server Action reutilizada de la web) */}
        <form action={signOutAction}>
          <button className="m-btn m-btn-secondary" type="submit" style={{ color: "var(--danger)" }}>
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

function NotifRow({ label, desc, on }: { label: string; desc: string; on: boolean }) {
  return (
    <div className="srow">
      <div style={{ flex: 1 }}>
        <div className="st">{label}</div>
        <div className="ss">{desc}</div>
      </div>
      {/* Estado actual (solo lectura por ahora): refleja tu preferencia guardada. */}
      <label className="sw sr" aria-label={`${label}: ${on ? "activado" : "desactivado"}`}>
        <input type="checkbox" defaultChecked={on} disabled />
        <span className="tr" />
      </label>
    </div>
  );
}
