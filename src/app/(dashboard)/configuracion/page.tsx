import { getAccountInfo } from "@/modules/account/services/account-service";
import { CurrencySelector } from "@/modules/account/components/currency-selector";
import { NotificationPrefs } from "@/modules/account/components/notification-prefs";
import { EmailTester } from "@/modules/account/components/email-tester";
import { WhatsAppLink } from "@/modules/account/components/whatsapp-link";
import { IngestEmails } from "@/modules/account/components/ingest-emails";
import { INGEST_TARGET, INGEST_HELP } from "@/modules/account/constants";
import {
  listMyIngestEmails,
  type IngestEmailRow,
} from "@/modules/account/services/ingest-email-service";
import { UpgradePrompt } from "@/components/shared/upgrade-prompt";
import { SignOutButton } from "@/components/auth/sign-out-button";
import { Icon } from "@/components/ui/icon";
import { isSupabaseConfigured } from "@/lib/auth/session";
import { getMyLink } from "@/lib/whatsapp/links-service";
import { isWhatsAppConfigured } from "@/lib/whatsapp";
import { PLAN_LABEL, isPremium } from "@/lib/plan";

/** Fila de la hoja de configuración: encabezado (título + descripción) | cuerpo. */
function SetRow({
  title,
  desc,
  children,
}: {
  title: React.ReactNode;
  desc: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="set-row">
      <div className="set-head">
        <h3>{title}</h3>
        <p>{desc}</p>
      </div>
      <div className="set-body">{children}</div>
    </div>
  );
}

/**
 * Configuración: cuenta, plan y consumo de IA del mes. La monetización es
 * transparente: se muestra el uso y el plan; el upsell no bloquea lo esencial.
 */
export default async function Page() {
  const acc = await getAccountInfo();
  const usagePct =
    acc.tokenLimit > 0 ? Math.min(100, Math.round((acc.tokensUsed / acc.tokenLimit) * 100)) : 0;
  const whatsappLink = isSupabaseConfigured() ? await getMyLink() : null;
  const whatsappConfigured = isWhatsAppConfigured();

  // Correos del banco (onboarding de ingesta). Best-effort: si falla, lista vacía.
  let ingestEmails: IngestEmailRow[] = [];
  if (isSupabaseConfigured()) {
    try {
      ingestEmails = await listMyIngestEmails();
    } catch {
      ingestEmails = [];
    }
  }

  return (
    <div className="set-sheet">
      <SetRow title="Tu cuenta" desc="Tu identidad en CARTERA+.">
        <div className="acct">
          <div className="av-lg">{(acc.name ?? acc.email ?? "CA").slice(0, 2).toUpperCase()}</div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="nm">{acc.name ?? "Invitado"}</div>
            <div className="em">{acc.email ?? "Sin sesión"}</div>
          </div>
          <SignOutButton />
        </div>
      </SetRow>

      <SetRow title="Tu plan" desc="Tu suscripción y consumo de IA del mes.">
        <span className={`plan-chip${isPremium(acc.plan) ? " prem" : ""}`}>
          {PLAN_LABEL[acc.plan]}
        </span>
        <div className="usage-lb">
          <span>Uso de IA este mes</span>
          <span className="tk">
            {acc.tokensUsed.toLocaleString("es-CR")} / {acc.tokenLimit.toLocaleString("es-CR")}{" "}
            tokens
          </span>
        </div>
        <div className="bar-track" style={{ height: 9 }}>
          <div
            className="bar-fill"
            style={{
              width: `${usagePct}%`,
              background: usagePct > 85 ? "var(--neg)" : "var(--accent)",
            }}
          />
        </div>
        <div className="srvnote">
          <Icon name="defense" width={2} />
          El consumo se calcula en el servidor y no puede modificarse desde el cliente.
        </div>
      </SetRow>

      <SetRow
        title="Moneda principal"
        desc="Se usa para mostrar tus cifras y como predeterminada al agregar ítems nuevos."
      >
        <CurrencySelector current={acc.currency} />
      </SetRow>

      <SetRow
        title="Correo (invitaciones)"
        desc="Comprueba que el envío de invitaciones de familia funcione. Verificamos la conexión y te enviamos un correo de prueba a tu propia dirección."
      >
        <EmailTester />
      </SetRow>

      <SetRow
        title="Asistente de WhatsApp"
        desc="Registra gastos por foto o texto y consulta tu presupuesto desde WhatsApp. Tu número se vincula a tu familia solo tras confirmar un código."
      >
        <WhatsAppLink initial={whatsappLink} configured={whatsappConfigured} />
      </SetRow>

      <SetRow
        title={
          <>
            Correos del banco{" "}
            <span
              className="tip"
              data-tip={INGEST_HELP}
              style={{ display: "inline-flex", color: "var(--muted)", verticalAlign: "middle" }}
            >
              <Icon name="info" style={{ width: 14, height: 14 }} />
            </span>
          </>
        }
        desc={
          <>
            Configurá en tu correo un reenvío de los avisos de tu banco a{" "}
            <strong className="tnum">{INGEST_TARGET}</strong>, y registrá acá el correo desde el
            que reenviás.
          </>
        }
      >
        <IngestEmails initial={ingestEmails} />
      </SetRow>

      <SetRow
        title="Notificaciones"
        desc="Elige por dónde quieres recibir tu acompañamiento. Puedes apagar lo que no quieras."
      >
        <NotificationPrefs prefs={acc.notifications} />
      </SetRow>

      <SetRow title="Preferencias" desc="Ajustes de personalización.">
        <p className="muted" style={{ fontSize: 13.5, margin: 0, lineHeight: 1.6 }}>
          El idioma, el tono y la frecuencia de acompañamiento se configuran desde tu Perfil
          Financiero. El tema (claro/oscuro) se cambia en la barra superior.
        </p>
      </SetRow>

      {!isPremium(acc.plan) ? (
        <div style={{ marginTop: 12 }}>
          <UpgradePrompt />
        </div>
      ) : null}
    </div>
  );
}
