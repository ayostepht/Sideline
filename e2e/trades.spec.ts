import { expect, test, type Page } from "@playwright/test";
import { expectNoSeriousA11yViolations } from "./helpers/axe";
import { L } from "./helpers/data";
import { openInfoPopover } from "./helpers/info";
import { expectNoHorizontalScroll, PHONE_WIDTH } from "./helpers/no-hscroll";
import { settleAnimations } from "./helpers/settle";
import { themes, useTheme } from "./helpers/theme";

/**
 * Trades (TRADE-1..5, ADR-022). Runs on all three projects against the fixture league. Specific
 * players are not asserted (the finder's picks depend on the engine); structure and invariants are.
 */
const isDesktop = (width: number | undefined): boolean => (width ?? 0) >= 1024;

async function openFinder(page: Page): Promise<void> {
  await page.goto(`${L}/trades`);
  await expect(page.getByTestId("trades-page")).toBeVisible();
  await expect(page.getByTestId("trades-finder-list")).toBeVisible();
}

test.describe("Trades (TRADE-1..5)", () => {
  test("TRADE-5: Trades is reachable from navigation and lands on the Finder tab", async ({
    page,
  }) => {
    await page.goto(L);
    if (isDesktop(page.viewportSize()?.width)) {
      await page.getByTestId("nav-link-trades").click();
    } else {
      await page.getByTestId("nav-tab-more").click();
      await page.getByTestId("nav-more-sheet").getByTestId("nav-more-trades").click();
    }
    await expect(page).toHaveURL(new RegExp(`${L}/trades`));
    await expect(page.getByRole("heading", { level: 1, name: "Trades" })).toBeVisible();
    await expect(page.getByTestId("trades-tab-finder")).toHaveAttribute("aria-current", "page");
    await expect(page.getByTestId("trades-tab-analyzer")).not.toHaveAttribute("aria-current");
  });

  test("TRADE-1: Finder lists suggestions with a top pick, none of them lopsided", async ({
    page,
  }) => {
    await openFinder(page);
    await expect(page.getByTestId("trades-empty")).toHaveCount(0);
    const cards = page.getByTestId("trade-suggestion");
    await expect.poll(() => cards.count()).toBeGreaterThan(0);
    // Never lopsided anywhere in the list.
    await expect(
      page.locator('[data-testid="trade-fairness"][data-fairness="lopsided"]'),
    ).toHaveCount(0);
    // Exactly one top pick, it is the first card, and it is not lopsided.
    await expect(page.getByTestId("trade-top-pick")).toHaveCount(1);
    const first = cards.first();
    await expect(first).toHaveAttribute("data-top", "true");
    await expect(first.getByTestId("trade-top-pick")).toBeVisible();
    await expect(first.getByTestId("trade-fairness")).not.toHaveAttribute(
      "data-fairness",
      "lopsided",
    );
    // Each card shows both sides and both teams' best-lineup impact.
    for (const id of ["trade-give", "trade-get", "trade-mine", "trade-theirs"]) {
      await expect(first.getByTestId(id)).toBeVisible();
    }
    await expect(first.getByTestId("trade-fairness")).toHaveText(/\S/);
  });

  test("TRADE-2: Open in Analyzer carries the trade over and evaluates it on arrival", async ({
    page,
  }) => {
    await openFinder(page);
    const first = page.getByTestId("trade-suggestion").first();
    const giveCount = await first.getByTestId("trade-give").getByRole("listitem").count();
    await first.getByTestId("trade-open-analyzer").click();
    await expect(page).toHaveURL(/tab=analyzer/);
    await expect(page.getByTestId("trades-tab-analyzer")).toHaveAttribute("aria-current", "page");
    await expect(page.getByTestId("analyzer")).toBeVisible();
    const result = page.getByTestId("analyzer-result");
    await expect(result).toBeVisible();
    await expect(result.getByTestId("analyzer-mine")).toBeVisible();
    await expect(result.getByTestId("analyzer-theirs")).toBeVisible();
    await expect(result.getByTestId("trade-fairness")).toHaveText(/\S/);
    // The pre-selected give side matches the suggestion.
    await expect(page.getByTestId("analyzer-give").getByTestId("analyzer-chip")).toHaveCount(
      giveCount,
    );
    await expect(page.getByTestId("analyzer-live")).toHaveText(/\S/);
  });

  test("TRADE-2b: the page keeps a document title after Open in Analyzer (WCAG 2.4.2)", async ({
    page,
  }) => {
    await openFinder(page);
    await page.getByTestId("trade-open-analyzer").first().click();
    await expect(page.getByTestId("analyzer-result")).toBeVisible();
    await expect.poll(() => page.title()).not.toBe("");
  });

  test("TRADE-3: manual Analyzer flow evaluates a 1 for 1 and announces the result", async ({
    page,
  }) => {
    await page.goto(`${L}/trades?tab=analyzer`);
    await expect(page.getByTestId("analyzer")).toBeVisible();
    const evaluate = page.getByTestId("analyzer-evaluate");
    await expect(evaluate).toBeDisabled();
    await page.getByTestId("analyzer-team-select").selectOption({ index: 1 });
    await page.getByTestId("analyzer-give").getByTestId("analyzer-player").first().check();
    await expect(evaluate).toBeDisabled();
    await page.getByTestId("analyzer-get").getByTestId("analyzer-player").first().check();
    await expect(evaluate).toBeEnabled();
    await evaluate.click();
    const result = page.getByTestId("analyzer-result");
    await expect(result).toBeVisible();
    await expect(result.getByTestId("analyzer-mine")).toBeVisible();
    await expect(result.getByTestId("analyzer-theirs")).toBeVisible();
    await expect(page.getByTestId("analyzer-error")).toHaveCount(0);
    // Live region announces the outcome (not the transient "Evaluating trade.").
    await expect(page.getByTestId("analyzer-live")).not.toHaveText("Evaluating trade.");
    await expect(page.getByTestId("analyzer-live")).toHaveText(/\S/);
    // Changing the selection clears the stale result.
    await page.getByTestId("analyzer-give").getByTestId("analyzer-chip").first().click();
    await expect(page.getByTestId("analyzer-result")).toHaveCount(0);
  });

  test("TRADE-3b: a 4th player on a side cannot be selected", async ({ page }) => {
    await page.goto(`${L}/trades?tab=analyzer`);
    await expect(page.getByTestId("analyzer")).toBeVisible();
    await page.getByTestId("analyzer-team-select").selectOption({ index: 1 });
    for (const side of ["analyzer-give", "analyzer-get"]) {
      const boxes = page.getByTestId(side).getByTestId("analyzer-player");
      for (let i = 0; i < 3; i += 1) await boxes.nth(i).check();
      await expect(page.getByTestId(side).getByTestId("analyzer-chip")).toHaveCount(3);
      await expect(boxes.nth(3)).toBeDisabled();
      // Selected boxes stay enabled so they can be removed.
      await expect(boxes.nth(0)).toBeEnabled();
      await boxes.nth(0).uncheck();
      await expect(boxes.nth(3)).toBeEnabled();
      await expect(page.getByTestId(side).getByTestId("analyzer-chip")).toHaveCount(2);
    }
  });

  test("TRADE-4: the fairness explanation opens on tap and closes with Escape", async ({
    page,
  }) => {
    await openFinder(page);
    const trigger = page.getByTestId("trade-fairness-info").first();
    const content = await openInfoPopover(page, trigger, "trade-fairness-info");
    await expect(content).toContainText("not a prediction");
    await page.keyboard.press("Escape");
    await expect(content).toBeHidden();
    await expect(trigger).toBeFocused();
  });

  test("UI5: Trades Finder and Analyzer have no horizontal scroll at 390px", async ({ page }) => {
    await openFinder(page);
    await expectNoHorizontalScroll(page, { width: PHONE_WIDTH });
    await page.goto(`${L}/trades?tab=analyzer`);
    await expect(page.getByTestId("analyzer")).toBeVisible();
    await expectNoHorizontalScroll(page, { width: PHONE_WIDTH });
    // Also with a result rendered (the widest state).
    await page.goto(`${L}/trades`);
    await page.getByTestId("trade-open-analyzer").first().click();
    await expect(page.getByTestId("analyzer-result")).toBeVisible();
    await expectNoHorizontalScroll(page, { width: PHONE_WIDTH });
  });

  for (const theme of themes) {
    test(`UI2: Trades Finder has no serious axe violations (${theme})`, async ({ page }) => {
      await useTheme(page, theme);
      await openFinder(page);
      await settleAnimations(page);
      await expectNoSeriousA11yViolations(page, { theme });
    });

    test(`UI2: Trades Analyzer with a result has no serious axe violations (${theme})`, async ({
      page,
    }) => {
      await useTheme(page, theme);
      await page.goto(`${L}/trades`);
      await expect(page.getByTestId("trades-finder-list")).toBeVisible();
      // Load the Open in Analyzer URL directly (a hard load). The soft navigation from the Finder
      // currently drops <title>; that is checked on its own in TRADE-2b so it is not hidden here.
      const href = await page.getByTestId("trade-open-analyzer").first().getAttribute("href");
      expect(href).toContain("tab=analyzer");
      await page.goto(href ?? "");
      await expect(page.getByTestId("analyzer-result")).toBeVisible();
      await settleAnimations(page);
      await expectNoSeriousA11yViolations(page, { theme });
    });
  }
});
