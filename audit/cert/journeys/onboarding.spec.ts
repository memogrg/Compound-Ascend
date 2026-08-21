/**
 * Onboarding journey (#1) — a FRESH, not-onboarded user goes through the DNA wizard and
 * reaches a usable dashboard. Runs on all 3 surfaces.
 *
 * This journey can't reuse the shared onboarded storageState (that user is already
 * onboarded), so it seeds its OWN not-onboarded user (`createCertUser onboarding:false`),
 * logs in through the real UI in-test, and tears the user down at the end.
 *
 * PRIMARY gates: the wizard's DATA persisted — profiles.display_name = the name we typed
 * (not just onboarding_completed=true) + profile_completion>0 + an active household — AND
 * the dashboard renders without bouncing back to the wizard. The DNA wizard captures a
 * BEHAVIORAL profile (no income/expense amounts), so displayName is the deterministic
 * datum we set and confirm.
 */
import { test, expect } from "../fixtures";
import { createCertUser, deleteCertUser, findProfile, resolveHouseholdId } from "../lib/seed";
import { loginFreshWeb, loginFreshMobile } from "../pods/login";

// Fresh unauthenticated context — the in-test login establishes the not-onboarded session.
test.use({ storageState: { cookies: [], origins: [] } });

// The nucleus OptionCard we click in step 1 and confirm in personal_profiles.
const NUCLEUS = { label: "Personal", value: "solo" } as const;

test("onboarding: wizard DNA → datos persistidos → dashboard usable", async (
  { page, journey, admin, evidence },
  testInfo,
) => {
  test.setTimeout(180_000);
  const surface = (testInfo.project.metadata as { surface?: string }).surface === "mobile" ? "mobile" : "web";
  const tag = testInfo.project.name;
  const runId = `onb-${tag}-${Date.now()}`;
  const displayName = `Cert DNA ${tag}`;

  const user = await createCertUser(runId, { onboarding: false });
  try {
    if (surface === "mobile") await loginFreshMobile(page, { email: user.email, password: user.password });
    else await loginFreshWeb(page, { email: user.email, password: user.password });
    await evidence.shot(page, "post-login");

    // The app's gate routes a not-onboarded user into the wizard.
    const gate = await journey.onboardingGateReached();
    evidence.check("Usuario nuevo llega al wizard de onboarding", gate);
    await evidence.shot(page, "onboarding-wizard");
    expect(gate, "El usuario nuevo no llegó al wizard de onboarding").toBeTruthy();

    await journey.completeOnboarding({ displayName, nucleusLabel: NUCLEUS.label });
    await evidence.shot(page, "onboarding-finished");

    // ── PRIMARY 1 · the DNA the wizard wrote (real capture, not just the flag) ───
    let profile = await findProfile(admin, user.userId);
    for (let i = 0; i < 20 && !(profile?.onboardingCompleted && profile?.displayName === displayName); i++) {
      await new Promise((r) => setTimeout(r, 500));
      profile = await findProfile(admin, user.userId);
    }
    evidence.check("Perfil DNA persistido", Boolean(profile), JSON.stringify(profile));
    expect(profile, "No se encontró el perfil (profiles)").not.toBeNull();
    expect(profile?.onboardingCompleted, "onboarding_completed no quedó en true").toBeTruthy();
    expect(profile?.displayName, "El displayName cargado en el wizard no persistió").toBe(displayName);
    expect(profile?.profileCompletion ?? 0, "profile_completion quedó en 0").toBeGreaterThan(0);
    // DNA conductual: el OptionCard "Personal" (paso 1) → personal_profiles.financial_nucleus.
    evidence.check("financial_nucleus capturado por el wizard", profile?.financialNucleus === NUCLEUS.value, profile?.financialNucleus ?? "null");
    expect(profile?.financialNucleus, "El financial_nucleus elegido en el wizard no persistió").toBe(NUCLEUS.value);

    const householdId = await resolveHouseholdId(admin, user.userId);
    evidence.check("Household activo presente", Boolean(householdId), householdId ?? "");
    expect(householdId, "El usuario no quedó con un household").not.toBeNull();

    // ── PRIMARY 2 · dashboard usable, no re-redirect al wizard ──────────────────
    const dash = await journey.dashboardRenders();
    evidence.check("Dashboard renderiza sin rebotar a onboarding", dash);
    await evidence.shot(page, "dashboard");
    expect(dash, "El dashboard no renderizó (o rebotó a onboarding)").toBeTruthy();
  } finally {
    await deleteCertUser(user.userId);
  }
});
