import { expect, type Page } from "@playwright/test";
import { z } from "zod";

// The root tsconfig has no DOM lib, so the browser-side code is a string expression.
const MEASURE = `({
  scrollWidth: document.documentElement.scrollWidth,
  clientWidth: document.documentElement.clientWidth,
  innerWidth: window.innerWidth,
})`;
const Measurement = z.object({
  scrollWidth: z.number(),
  clientWidth: z.number(),
  innerWidth: z.number(),
});

/** PLAN.md 6.6 / UI5: widest phone we guarantee. */
export const PHONE_WIDTH = 390;

/**
 * Asserts the page does not scroll horizontally (UI5).
 *
 * The PLAN check is `document.documentElement.scrollWidth <= window.innerWidth`. On mobile
 * Chromium (the mobile-pixel project) `window.innerWidth` grows to match overflowing content, so
 * that comparison passes falsely (measured: a 1000px element on a 412px viewport gives
 * innerWidth 1009). We therefore compare against `documentElement.clientWidth`, which stays at
 * the real viewport width on all three projects, and require it to equal the viewport size we
 * set. This is strictly stronger than the PLAN check.
 *
 * Pass `{ width }` to resize the viewport first (e.g. 390 on every project).
 */
export async function expectNoHorizontalScroll(
  page: Page,
  options: { width?: number } = {},
): Promise<void> {
  if (options.width !== undefined) {
    const current = page.viewportSize();
    await page.setViewportSize({ width: options.width, height: current?.height ?? 800 });
  }
  const { scrollWidth, clientWidth, innerWidth } = Measurement.parse(
    await page.evaluate<unknown>(MEASURE),
  );
  const viewportWidth = Math.min(
    clientWidth,
    innerWidth,
    page.viewportSize()?.width ?? clientWidth,
  );
  expect(
    scrollWidth,
    `horizontal scroll: document scrollWidth ${scrollWidth}px exceeds viewport ${viewportWidth}px`,
  ).toBeLessThanOrEqual(viewportWidth);
}
