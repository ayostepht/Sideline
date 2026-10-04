import { expect, test } from "@playwright/test";
import { expectNoSeriousA11yViolations } from "./helpers/axe";
import { expectNoHorizontalScroll, PHONE_WIDTH } from "./helpers/no-hscroll";
import { expectThemeApplied, themes, useTheme } from "./helpers/theme";
import { settleAnimations } from "./helpers/settle";
import { existingRoutes, overlayRoutes } from "./routes";

/** UI2 (axe, both themes) and UI5 (no horizontal scroll at 390px) for every existing route. */
for (const route of existingRoutes) {
  test.describe(`route ${route}`, () => {
    for (const theme of themes) {
      test(`UI2: ${route} has no serious axe violations (${theme})`, async ({ page }) => {
        await useTheme(page, theme);
        const response = await page.goto(route);
        expect(response?.ok()).toBe(true);
        await expectThemeApplied(page, theme);
        if (overlayRoutes.has(route)) {
          // Scan the overlay itself, not the page behind it.
          await expect(page.getByRole("dialog")).toBeVisible();
        }
        // Contrast is computed from live colors: let any finite animation/transition finish
        // first, not just on overlay routes. Found by the G5 gate: a lazily-hydrated client-only
        // toggle (Settings theme switch) can still be mid color-transition into its "on" state
        // right after navigation, which axe can catch on WebKit (mobile-iphone) as a transient
        // contrast violation that is not present once the toggle settles.
        await settleAnimations(page);
        await expectNoSeriousA11yViolations(page, { theme });
      });
    }

    test(`UI5: ${route} has no horizontal scroll at ${PHONE_WIDTH}px`, async ({ page }) => {
      const response = await page.goto(route);
      expect(response?.ok()).toBe(true);
      if (overlayRoutes.has(route)) await expect(page.getByRole("dialog")).toBeVisible();
      await expectNoHorizontalScroll(page, { width: PHONE_WIDTH });
    });
  });
}
