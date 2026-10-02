import type { Page } from "@playwright/test";

/**
 * Waits until every finite CSS/Web animation has finished (infinite ones such as spinners and
 * skeleton pulses never finish and are ignored) (overlay open transitions), so axe
 * measures final colors instead of mid-fade ones. Not a sleep: it resolves when the browser
 * reports the animations finished.
 */
export async function settleAnimations(page: Page): Promise<void> {
  await page.evaluate(
    "Promise.all(document.getAnimations().filter((a) => Number.isFinite(a.effect.getComputedTiming().endTime)).map((a) => a.finished.catch(() => undefined))).then(() => undefined)",
  );
}
