import { expect, test } from "@playwright/test";
import { expectThemeApplied } from "./helpers/theme";
import { FIXTURE } from "./helpers/servers";
import { L } from "./helpers/data";

test.describe("Settings v1 (PLAN 6.4)", () => {
  test("SET-1: shows the account, the active league, and the app version", async ({ page }) => {
    await page.goto(`${L}/settings`);
    await expect(page.getByTestId("settings-page")).toBeVisible();
    await expect(page.getByTestId("settings-account")).toBeVisible();
    await expect(page.getByTestId("settings-username")).toHaveText(FIXTURE.username);
    await expect(page.getByTestId("settings-league-name")).toContainText("Example League");
    await expect(page.getByTestId("settings-version")).toHaveText(/\S/);
  });

  test("SET-2: the theme toggle persists dark across reload", async ({ page }) => {
    await page.goto(`${L}/settings`);
    await page.getByTestId("theme-toggle-dark").click();
    await expectThemeApplied(page, "dark");
    await page.reload();
    await expectThemeApplied(page, "dark");
    await expect(page.getByTestId("theme-toggle-dark")).toHaveAttribute("aria-checked", "true");
    await page.getByTestId("theme-toggle-light").click();
    await expectThemeApplied(page, "light");
  });

  test("SET-3: Sync now queues, or shows the rate-limited message, and the page survives", async ({
    page,
  }) => {
    await page.goto(`${L}/settings`);
    const button = page.getByTestId("settings-sync-now");
    const message = page.getByTestId("settings-sync-message");
    await expect(button).toBeEnabled();
    await button.click();
    // Another project may have synced a moment ago: queued, already queued, or rate limited are all valid.
    await expect(message).toHaveText(/Sync queued|already queued|rate limited|in progress/);
    await expect(page.getByTestId("settings-sync-summary")).toBeVisible();
    await expect(page.getByTestId("settings-sync-cooldown")).toBeVisible();
    // Job rows live in a collapsed details element until opened.
    const details = page.getByTestId("settings-sync-details");
    await expect(details).not.toHaveAttribute("open", /.*/);
    await details.locator("summary").click();
    await expect(details).toHaveAttribute("open", /.*/);
    await expect(page.getByTestId("settings-sync-job").first()).toBeVisible();
    await expect(page.getByTestId("settings-page")).toBeVisible();
  });

  test("SET-4: the league picker offers the other fixture league", async ({ page }) => {
    await page.goto(`${L}/settings`);
    const select = page.getByTestId("settings-league-select");
    // Placeholder plus the one league that is not the current one.
    await expect(select.locator("option")).toHaveText([
      "Choose a league",
      "Example League 2 (2026)",
    ]);
    await expect(page.getByTestId("settings-league-switch")).toBeDisabled();
  });
});
