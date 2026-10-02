import { expect, test } from "@playwright/test";
import { L } from "./helpers/data";
import { FIXTURE } from "./helpers/servers";

const isDesktop = (width: number | undefined): boolean => (width ?? 0) >= 1024;
const ITEMS = [
  ["home", "Home"],
  ["lineup", "Lineup"],
  ["matchup", "Matchup"],
  ["waivers", "Waivers"],
  ["players", "Players"],
  ["league", "League"],
  ["team", "My Team"],
  ["settings", "Settings"],
] as const;

test.describe("Navigation (PLAN 6.3)", () => {
  test("NAV-1: desktop sidebar has all 8 items and marks only the current one", async ({
    page,
  }) => {
    await page.goto(`${L}/league`);
    if (!isDesktop(page.viewportSize()?.width)) {
      await expect(page.getByTestId("nav-sidebar")).toBeHidden();
      return;
    }
    const nav = page.getByRole("navigation", { name: "Main" });
    for (const [key, label] of ITEMS) {
      await expect(nav.getByTestId(`nav-link-${key}`)).toHaveText(label);
    }
    await expect(nav.locator("a")).toHaveCount(8);
    await expect(nav.locator('[aria-current="page"]')).toHaveCount(1);
    await expect(nav.getByTestId("nav-link-league")).toHaveAttribute("aria-current", "page");
    await expect(page.getByTestId("nav-bottom-tabs")).toBeHidden();
  });

  test("NAV-2: mobile bottom tabs plus the More sheet reach every section", async ({ page }) => {
    await page.goto(L);
    if (isDesktop(page.viewportSize()?.width)) {
      await expect(page.getByTestId("nav-bottom-tabs")).toBeHidden();
      return;
    }
    const tabs = page.getByRole("navigation", { name: "Primary" });
    for (const key of ["home", "lineup", "matchup", "waivers"]) {
      await expect(tabs.getByTestId(`nav-tab-${key}`)).toBeVisible();
    }
    await expect(tabs.getByTestId("nav-tab-home")).toHaveAttribute("aria-current", "page");
    await tabs.getByTestId("nav-tab-more").click();
    const sheet = page.getByTestId("nav-more-sheet");
    await expect(sheet).toBeVisible();
    for (const [key, label] of [
      ["players", "Players"],
      ["league", "League"],
      ["team", "My Team"],
      ["settings", "Settings"],
    ] as const) {
      await expect(sheet.getByTestId(`nav-more-${key}`)).toHaveText(label);
    }
    await sheet.getByTestId("nav-more-settings").click();
    await expect(page).toHaveURL(new RegExp(`${L}/settings`));
    await expect(page.getByTestId("settings-page")).toBeVisible();
    // On a More page the More tab is the current one.
    await expect(tabs.getByTestId("nav-tab-more")).toHaveAttribute("aria-current", "page");
  });

  test("NAV-3: week selector next and previous update ?week= and keep other params", async ({
    page,
  }) => {
    await page.goto(`${L}/team?week=5&highlight=9221`);
    const sel = page.getByTestId("week-selector");
    await expect(sel).toContainText("Week 5");
    await page.getByTestId("week-next").click();
    await expect(page).toHaveURL(/week=6/);
    await expect(page).toHaveURL(/highlight=9221/);
    await expect(sel).toContainText("Week 6");
    await page.getByTestId("week-prev").click();
    await expect(page).toHaveURL(/week=5/);
    await expect(sel).toContainText("Week 5");
    await page.getByTestId("week-prev").click();
    await expect(page).toHaveURL(/week=4/);
    await expect(page).toHaveURL(/highlight=9221/);
    await expect(sel).toContainText("Week 4");
  });

  test("NAV-4: week selector disables Previous at week 1 and Next at week 18", async ({ page }) => {
    await page.goto(`${L}/team?week=1`);
    await expect(page.getByTestId("week-prev")).toBeDisabled();
    await page.goto(`${L}/team?week=18`);
    await expect(page.getByTestId("week-next")).toBeDisabled();
  });

  test("NAV-5: nav links keep an explicit ?week=", async ({ page }) => {
    await page.goto(`${L}/league?week=7`);
    const desktop = isDesktop(page.viewportSize()?.width);
    const link = desktop
      ? page.getByTestId("nav-link-waivers")
      : page.getByTestId("nav-tab-waivers");
    await expect(link).toHaveAttribute("href", `${L}/waivers?week=7`);
    await link.click();
    await expect(page).toHaveURL(new RegExp(`${L}/waivers\\?week=7`));
  });

  test("NAV-6: switching league keeps the section (ADR-009 item 3)", async ({ page }) => {
    // The real endpoint would change the stored active league for every parallel test, so the POST
    // is answered here and the navigation the client does with it is what is checked.
    let posted: unknown = null;
    await page.route("**/api/onboarding/league", async (route) => {
      posted = route.request().postDataJSON();
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          activeLeagueId: FIXTURE.syntheticLeagueId,
          sync: "queued",
          syncSince: null,
        }),
      });
    });
    await page.goto(`${L}/league?week=5`);
    const desktop = isDesktop(page.viewportSize()?.width);
    await page.getByTestId(desktop ? "league-switcher-desktop" : "league-switcher-mobile").click();
    const options = page.getByTestId("league-switcher-option");
    await expect(options).toHaveCount(2);
    await expect(options.filter({ hasText: "Example League 2" })).toHaveCount(1);
    await options.filter({ hasText: "Example League 2" }).click();
    await expect(page).toHaveURL(new RegExp(`/l/${FIXTURE.syntheticLeagueId}/league`));
    expect(posted).toEqual({ leagueId: FIXTURE.syntheticLeagueId });
    // The league is only a choice (no stored data) and the mocked call left the active league
    // unchanged, so the server answers not-found. The real switch lands on "Still syncing".
    await expect(
      page
        .getByTestId("league-syncing")
        .or(page.getByTestId("league-page"))
        .or(page.getByRole("heading", { name: "We could not find that page" })),
    ).toBeVisible();
  });

  test("NAV-7: the current league option is marked and choosing it only closes the menu", async ({
    page,
  }) => {
    await page.goto(L);
    const desktop = isDesktop(page.viewportSize()?.width);
    await page.getByTestId(desktop ? "league-switcher-desktop" : "league-switcher-mobile").click();
    const current = page
      .getByTestId("league-switcher-option")
      .filter({ hasText: "Example League" })
      .first();
    await expect(current).toHaveAttribute("aria-current", "true");
    await current.click();
    await expect(page).toHaveURL(new RegExp(`${L}$`));
    await expect(page.getByTestId("league-switcher-option")).toHaveCount(0);
  });
});
