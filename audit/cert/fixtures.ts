/**
 * Test fixtures for the journeys: pick the Web/Mobile POM by the project's `surface`
 * metadata, expose the run context + a service-role admin client for confirmation
 * reads, and hand each test an Evidence collector that auto-flushes its result on
 * teardown. The setup/cleanup specs use the base `@playwright/test`, not this.
 */
import { test as base, expect } from "@playwright/test";
import type { SupabaseClient } from "@supabase/supabase-js";
import { certAdmin } from "./lib/seed";
import { readContext, type CertContext } from "./lib/context";
import { Evidence } from "./lib/evidence";
import { WebJourney } from "./pods/web.pods";
import { MobileJourney } from "./pods/mobile.pods";
import type { Journey } from "./pods/journey";

type Fixtures = {
  run: CertContext;
  admin: SupabaseClient;
  journey: Journey;
  evidence: Evidence;
};

function surfaceOf(metadata: unknown): "web" | "mobile" {
  const s = (metadata as { surface?: string } | undefined)?.surface;
  return s === "mobile" ? "mobile" : "web";
}

// `provide` (not `use`) so the react-hooks lint rule doesn't mistake Playwright's
// fixture callback for a React Hook. The name is positional; Playwright doesn't care.
export const test = base.extend<Fixtures>({
  run: async ({}, provide) => {
    await provide(readContext());
  },
  admin: async ({}, provide) => {
    await provide(certAdmin());
  },
  journey: async ({ page }, provide, testInfo) => {
    const surface = surfaceOf(testInfo.project.metadata);
    const j: Journey = surface === "mobile" ? new MobileJourney(page) : new WebJourney(page);
    await provide(j);
  },
  evidence: async ({ run }, provide, testInfo) => {
    const ev = new Evidence(run.runId, testInfo.project.name, surfaceOf(testInfo.project.metadata), testInfo.title);
    await provide(ev);
    ev.flush(testInfo.status ?? "unknown");
  },
});

export { expect };
