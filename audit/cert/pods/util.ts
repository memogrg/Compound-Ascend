import type { Page } from "@playwright/test";

export const VISIBLE_TIMEOUT = 15_000;

/** True if the text becomes visible within the timeout; false instead of throwing. */
export async function isVisibleSoon(page: Page, text: string): Promise<boolean> {
  return page
    .getByText(text, { exact: false })
    .first()
    .waitFor({ state: "visible", timeout: VISIBLE_TIMEOUT })
    .then(() => true)
    .catch(() => false);
}
