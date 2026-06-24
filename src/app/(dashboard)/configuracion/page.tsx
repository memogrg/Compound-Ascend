import { getAccountInfo } from "@/modules/account/services/account-service";
import { CurrencySelector } from "@/modules/account/components/currency-selector";
import { NotificationPrefs } from "@/modules/account/components/notification-prefs";
import { EmailTester } from "@/modules/account/components/email-tester";
import { WhatsAppLink } from "@/modules/account/components/whatsapp-link";
import { UpgradePrompt } from "@/components/shared/upgrade-prompt";
import { SignOutButton } from "@/components/auth/sign-out-button";
import { isSupabaseConfigured } from "@/lib/auth/session";
import { getMyLink } from "@/lib/whatsapp/links-service";
import { isWhatsAppConfigured } from "@/lib/whatsapp";
import { PLAN_LABEL, isPremium } from "@/lib/plan";

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

  return (
    <div className="grid">
      <section className="cols-2">
        <div className="card card-pad">
          <div className="card-title">Tu cuenta</div>
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 14 }}>
            <div className="avatar" style={{ width: 44, height: 44, fontSize: 16 }}>
              {(acc.name ?? acc.email ?? "CA").slice(0, 2).toUpperCase()}
            </div>
            <div>
              <div style={{ fontSize: 15, fontWeight: 600 }}>{acc.name ?? "Invitado"}</div>
              <div className="muted" style={{ fontSize: 12.5 }}>
                {acc.email ?? "Sin sesión"}
              </div>
            </div>
          </div>
          <div style={{ marginTop: 18 }}>
            <SignOutButton />
          </div>
        </div>

        <div className="card card-pad">
          <div className="row" style={{ justifyContent: "space-between" }}>
            <div className="card-title">Tu plan</div>
            <span
              className="chip"
              style={
                isPremium(acc.plan)
                  ? {
                      background: "color-mix(in srgb,var(--gold) 18%, transparent)",
                      color: "var(--gold)",
                    }
                  : undefined
              }
            >
              {PLAN_LABEL[acc.plan]}
            </span>
          </div>
          <div style={{ marginTop: 16 }}>
            <div className="row" style={{ justifyContent: "space-between", fontSize: 12.5 }}>
              <span className="muted">Uso de IA este mes</span>
              <span className="tnum">
                {acc.tokensUsed.toLocaleString("es-CR")} / {acc.tokenLimit.toLocaleString("es-CR")}{" "}
                tokens
              </span>
            </div>
            <div className="bar-track" style={{ marginTop: 8 }}>
              <div
                className="bar-fill"
                style={{
                  width: `${usagePct}%`,
                  background: usagePct > 85 ? "var(--neg)" : "var(--pos)",
                }}
              />
            </div>
            <div className="muted" style={{ fontSize: 11.5, marginTop: 8 }}>
              El consumo se calcula en el servidor y no puede modificarse desde el cliente.
            </div>
          </div>
        </div>
      </section>

      <section className="cols-2">
        <CurrencySelector current={acc.currency} />
        <EmailTester />
      </section>

      <section className="cols-2">
        <WhatsAppLink initial={whatsappLink} configured={whatsappConfigured} />
      </section>

      <section className="cols-2">
        <NotificationPrefs prefs={acc.notifications} />
        <div className="card card-pad">
          <div className="card-title">Preferencias</div>
          <p className="muted" style={{ fontSize: 13, marginTop: 10, lineHeight: 1.5 }}>
            El idioma, el tono y la frecuencia de acompañamiento se configuran desde tu Perfil
            Financiero. El tema (claro/oscuro) se cambia en la barra superior.
          </p>
        </div>
      </section>

      {!isPremium(acc.plan) ? <UpgradePrompt /> : null}
    </div>
  );
}
