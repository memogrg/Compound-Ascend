/**
 * Las dos pantallas de cuenta (web /configuracion y móvil /m/perfil) muestran el plan EFECTIVO
 * (B-2). Corre el getAccountInfo REAL sobre una sesión y un Supabase falsos:
 *  · miembro que hereda Max+ → chip «Max+», el «?» con «Incluido en tu hogar» y ningún
 *    UpgradePrompt;
 *  · titular Max+ → igual que antes: chip «Max+», sin «?», sin UpgradePrompt;
 *  · la suscripción de /m/perfil sigue leyendo el origen con el plan PROPIO.
 *
 * HelpTip pinta su texto solo al abrirse, así que acá se reemplaza por un marcador que lo expone.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

const db = vi.hoisted(() => ({
  propio: "ninguno" as string,
  efectivo: "ninguno" as string,
  stripe: null as string | null,
}));

const nada = vi.hoisted(() => () => null);

vi.mock("@/lib/auth/session", () => ({
  isSupabaseConfigured: () => true,
  getUser: async () => ({ id: "u1", email: "ana@example.com", user_metadata: {} }),
  requireUser: async () => ({ id: "u1" }),
}));
vi.mock("@/lib/auth/feature-gate", () => ({ getEffectivePlan: async () => db.efectivo }));
vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: async () => ({
    from: (tabla: string) => {
      const q = {
        select: () => q,
        eq: () => q,
        neq: () => q,
        limit: () => q,
        maybeSingle: async () => ({
          data:
            tabla === "profiles"
              ? {
                  plan: db.propio,
                  display_name: "Ana",
                  stripe_subscription_id: db.stripe,
                  store_subscription_active: false,
                }
              : tabla === "ai_usage_ledger"
                ? { tokens_used: 0 }
                : tabla === "user_settings"
                  ? { primary_currency: "USD", notifications: null }
                  : null,
        }),
      };
      return q;
    },
  }),
}));
vi.mock("@/lib/notifications/preferences", () => ({
  mergeNotificationPrefs: () => ({}),
  setNotificationChannel: async () => {},
}));
vi.mock("@/lib/time/user-time", () => ({
  getUserTimezone: async () => null,
  isValidTimeZone: () => true,
}));
vi.mock("@/components/shared/help-tip", () => ({
  HelpTip: ({ text }: { text: string }) => <span data-helptip={text}>?</span>,
}));

// Resto de cada pantalla: fuera del alcance de este test.
vi.mock("@/modules/account/components/delete-account-button", () => ({
  DeleteAccountButton: nada,
}));
vi.mock("@/modules/account/components/export-data-button", () => ({ ExportDataButton: nada }));
vi.mock("@/modules/account/components/currency-selector", () => ({ CurrencySelector: nada }));
vi.mock("@/modules/account/components/timezone-selector", () => ({ TimezoneSelector: nada }));
vi.mock("@/modules/account/components/notification-prefs", () => ({ NotificationPrefs: nada }));
vi.mock("@/modules/account/components/email-tester", () => ({ EmailTester: nada }));
vi.mock("@/modules/account/components/ingest-address-card", () => ({ IngestAddressCard: nada }));
vi.mock("@/modules/account/components/ingest-notices", () => ({ IngestNotices: nada }));
vi.mock("@/modules/account/services/ingest-address-service", () => ({
  getOrCreateIngestAddress: async () => null,
}));
vi.mock("@/modules/account/services/ingest-notices-service", () => ({
  listMyIngestNotices: async () => ({}),
  EMPTY_NOTICES: {},
}));
vi.mock("@/components/referrals/referral-card", () => ({ ReferralCard: nada }));
vi.mock("@/components/memory/memory-panel", () => ({ MemoryPanel: nada }));
vi.mock("@/modules/assistant", () => ({ listMyMemoryAction: async () => [] }));
vi.mock("@/lib/referrals/service", () => ({ getMyReferral: async () => null }));
vi.mock("@/components/auth/sign-out-button", () => ({ SignOutButton: nada }));
vi.mock("@/modules/personal-profile", () => ({
  HouseholdMembers: nada,
  listHouseholdMembers: async () => null,
}));
vi.mock("@/lib/email/send", () => ({ isEmailConfigured: () => false }));
vi.mock("@/app/(mobile)/m/components/mobile-header", () => ({ MobileHeader: nada }));
vi.mock("@/app/(mobile)/m/components/cerrar-sesion-form", () => ({ CerrarSesionForm: nada }));
vi.mock("@/app/(mobile)/m/(app)/perfil/configuracion-manager", () => ({
  ConfiguracionManager: nada,
}));
vi.mock("@/app/(mobile)/m/(app)/perfil/build-identity", () => ({ BuildIdentity: nada }));
vi.mock("@/app/(mobile)/m/(app)/perfil/suscripcion-tienda", () => ({
  SuscripcionTienda: ({ origen }: { origen: string }) => <div data-origen={origen} />,
}));

import ConfiguracionPage from "@/app/(dashboard)/configuracion/page";
import MobilePerfil from "@/app/(mobile)/m/(app)/perfil/page";

const UPSELL = "Llevá tu acompañamiento más lejos";

beforeEach(() => {
  db.propio = "ninguno";
  db.efectivo = "ninguno";
  db.stripe = null;
});

describe("/configuracion · sección del plan", () => {
  it("miembro que hereda Max+: chip Max+, «?» con el hogar y sin UpgradePrompt", async () => {
    db.efectivo = "max";
    const html = renderToStaticMarkup(await ConfiguracionPage());
    expect(html).toMatch(/class="plan-chip prem"[^>]*>Max\+</);
    expect(html).toContain('data-helptip="Incluido en tu hogar"');
    expect(html).not.toContain(UPSELL);
  });

  it("titular Max+: chip Max+, sin «?», sin UpgradePrompt (igual que hoy)", async () => {
    db.propio = "max";
    db.efectivo = "max";
    const html = renderToStaticMarkup(await ConfiguracionPage());
    expect(html).toMatch(/class="plan-chip prem"[^>]*>Max\+</);
    expect(html).not.toContain("data-helptip");
    expect(html).not.toContain(UPSELL);
  });

  it("sin plan heredado y sin max: el UpgradePrompt sigue apareciendo", async () => {
    db.propio = "pro";
    db.efectivo = "pro";
    const html = renderToStaticMarkup(await ConfiguracionPage());
    expect(html).toContain(UPSELL);
    expect(html).not.toContain("data-helptip");
  });
});

describe("/m/perfil · plan", () => {
  it("miembro que hereda Max+: «Plan Max+» con «?», y la suscripción sigue siendo la propia", async () => {
    db.efectivo = "max";
    const html = renderToStaticMarkup(await MobilePerfil());
    expect(html).toContain("Plan Max+<span data-helptip");
    expect(html).toContain('data-helptip="Incluido en tu hogar"');
    expect(html).toContain('data-origen="ninguna"');
  });

  it("titular Max+ por Stripe: «Plan Max+» sin «?», origen stripe (igual que hoy)", async () => {
    db.propio = "max";
    db.efectivo = "max";
    db.stripe = "sub_123";
    const html = renderToStaticMarkup(await MobilePerfil());
    expect(html).toContain("Plan Max+");
    expect(html).not.toContain("data-helptip");
    expect(html).toContain('data-origen="stripe"');
  });
});
