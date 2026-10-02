import { expect, test } from "@playwright/test";
import { expectNoSeriousA11yViolations } from "./helpers/axe";
import { expectNoHorizontalScroll } from "./helpers/no-hscroll";
import { setTheme } from "./helpers/theme";

/**
 * Self-tests for the e2e helpers. They use page.setContent, so no app is needed. A helper that
 * cannot fail is worthless, so each helper is shown to pass on clean pages and to reject bad ones.
 */

// Mobile emulation lays out at ~980px without this tag, which would hide horizontal overflow.
const VIEWPORT = '<meta name="viewport" content="width=device-width, initial-scale=1">';

const CLEAN = `<!doctype html><html lang="en"><head>${VIEWPORT}<title>Clean</title></head>
<body><main><h1>Clean page</h1>
<label for="n">Name</label><input id="n" type="text">
<button type="button">Save</button></main></body></html>`;

const WIDE = `<!doctype html><html lang="en"><head>${VIEWPORT}<title>Wide</title></head>
<body><main><h1>Wide page</h1><div style="width: 2000px; height: 20px; background: #036">wide</div></main></body></html>`;

// Input with no label and light grey text on white (contrast about 1.6:1).
const VIOLATIONS = `<!doctype html><html lang="en"><head>${VIEWPORT}<title>Bad</title></head>
<body><main><h1>Bad page</h1>
<p style="color: #cccccc; background: #ffffff">Low contrast text</p>
<input type="text"></main></body></html>`;

test.describe("helpers: no-hscroll", () => {
  test("UI5: passes on a page that fits the viewport", async ({ page }) => {
    await page.setContent(CLEAN);
    await expectNoHorizontalScroll(page);
    await expectNoHorizontalScroll(page, { width: 390 });
  });

  test("UI5: fails on a page with a wide element", async ({ page }) => {
    await page.setContent(WIDE);
    await expect(expectNoHorizontalScroll(page)).rejects.toThrow(/horizontal scroll/);
    await expect(expectNoHorizontalScroll(page, { width: 390 })).rejects.toThrow(
      /exceeds viewport 390px/,
    );
  });
});

test.describe("helpers: no-hscroll (moderate overflow)", () => {
  // Mobile Chromium inflates window.innerWidth to fit overflowing content, so a plain
  // scrollWidth <= innerWidth check would pass here. The helper must still catch it.
  test("UI5: fails on a 1000px element at a 390px viewport", async ({ page }) => {
    await page.setContent(
      `<!doctype html><html lang="en"><head>${VIEWPORT}<title>Moderate</title></head><body><main><h1>Moderate</h1><div style="width: 1000px; height: 20px">wide</div></main></body></html>`,
    );
    await expect(expectNoHorizontalScroll(page, { width: 390 })).rejects.toThrow(
      /exceeds viewport 390px/,
    );
  });
});

test.describe("helpers: axe", () => {
  test("UI2: passes on a clean page in both themes", async ({ page }) => {
    await page.setContent(CLEAN);
    await expectNoSeriousA11yViolations(page, { theme: "light" });
    await expectNoSeriousA11yViolations(page, { theme: "dark" });
  });

  test("UI2: fails on missing label and low contrast, naming the rules", async ({ page }) => {
    await page.setContent(VIOLATIONS);
    const failure = expectNoSeriousA11yViolations(page);
    await expect(failure).rejects.toThrow(/serious\/critical violation/);
    await expect(failure).rejects.toThrow(/color-contrast/);
    await expect(failure).rejects.toThrow(/label/);
  });
});

test.describe("helpers: theme", () => {
  test("setTheme switches prefers-color-scheme", async ({ page }) => {
    await page.setContent(CLEAN);
    // String expression: the root tsconfig has no DOM lib.
    const isDark = () =>
      page.evaluate<unknown>('window.matchMedia("(prefers-color-scheme: dark)").matches');
    await setTheme(page, "dark");
    expect(await isDark()).toBe(true);
    await setTheme(page, "light");
    expect(await isDark()).toBe(false);
  });
});
