import { expect, test } from "@playwright/test";
import { expectNoSeriousA11yViolations } from "./helpers/axe";
import { DATA, L } from "./helpers/data";
import { openInfoPopover } from "./helpers/info";
import { expectNoHorizontalScroll, PHONE_WIDTH } from "./helpers/no-hscroll";
import { settleAnimations } from "./helpers/settle";
import { themes, useTheme } from "./helpers/theme";

/**
 * Auto lineup mode (AUTO-1) and game weather (WX-4, WX-5). Fixture facts, with the game clock
 * pinned to 2026-10-02 (roster 1, week 4): NYJ players 11576, 12517, 13330 show "Wind 21 mph";
 * BUF 4983 "Rain likely (80%)"; JAX/CIN 12490, 9224 "Cold: 21°F"; MIN 11792, 5849 and DEF "MIN"
 * are indoors (no chip); DAL 3294, 8137 and DET 11646, 7547 have a calm forecast (no chip).
 */

/** The row of one player on the lineup page: the closest list item holding the player link. */
const rowOf = (page: import("@playwright/test").Page, id: string) =>
  page
    .locator(`[data-testid="player-link"][href$="/players/${id}"]`)
    .locator("visible=true")
    .first()
    .locator(
      "xpath=ancestor::*[starts-with(@data-testid,'lineup-') and substring(@data-testid, string-length(@data-testid) - 3) = '-row'][1]",
    );

test.describe("Auto lineup (AUTO-1)", () => {
  test("AUTO-1: Lineup opens in Auto with a reason, and the other modes switch and return", async ({
    page,
  }) => {
    await page.goto(`${L}/lineup`);
    const auto = page.getByTestId("lineup-mode-toggle-auto");
    await expect(auto).toHaveAttribute("aria-current", "true");
    await expect(page.getByTestId("lineup-auto-reason")).toContainText("Auto picked");
    for (const mode of ["projected", "safe", "upside"] as const) {
      await page.getByTestId(`lineup-mode-toggle-${mode}`).click();
      await expect(page).toHaveURL(new RegExp(`mode=${mode}`));
      await expect(page.getByTestId(`lineup-mode-toggle-${mode}`)).toHaveAttribute(
        "aria-current",
        "true",
      );
      await expect(auto).not.toHaveAttribute("aria-current");
      await expect(page.getByTestId("lineup-auto-reason")).toHaveCount(0);
    }
    await auto.click();
    // Auto is the default, so its link carries no explicit mode.
    await expect(page).not.toHaveURL(/mode=/);
    await expect(auto).toHaveAttribute("aria-current", "true");
    await expect(page.getByTestId("lineup-auto-reason")).toContainText("Auto picked");
  });

  test("AUTO-1b: the Auto explanation opens and closes with Escape", async ({ page }) => {
    await page.goto(`${L}/lineup`);
    const trigger = page.getByTestId("lineup-auto-info");
    const content = await openInfoPopover(page, trigger, "lineup-auto-info");
    await expect(content).toHaveText(/\S/);
    await page.keyboard.press("Escape");
    await expect(content).toBeHidden();
  });

  test("AUTO-1c: the Home lineup card loads", async ({ page }) => {
    await page.goto(L);
    await expect(page.getByTestId("home-page")).toBeVisible();
    const insight = page.getByTestId("home-lineup-insight");
    await expect(insight).toBeVisible();
    await expect(page.getByTestId("home-issues")).toBeVisible();
    // The card links to the Lineup, which opens in Auto.
    await insight.click();
    await expect(page.getByTestId("lineup-page")).toBeVisible();
    await expect(page.getByTestId("lineup-mode-toggle-auto")).toHaveAttribute(
      "aria-current",
      "true",
    );
  });
});

test.describe("Weather (WX-4, WX-5)", () => {
  test("WX-4: Lineup shows weather chips with text for flagged starters and none when calm or indoors", async ({
    page,
  }) => {
    await page.goto(`${L}/lineup?roster=1&week=4`);
    await expect(page.getByTestId("lineup-page")).toBeVisible();
    const chips = page.getByTestId("weather-chip").locator("visible=true");
    await expect(chips.first()).toBeVisible();
    const texts = (await chips.allInnerTexts()).map((t) => t.trim());
    // Every chip carries readable text (color and icon are never the only signal).
    for (const t of texts) expect(t).toMatch(/Wind|Gusts|Rain|Snow|Mixed|Cold/);
    expect(texts.join("|")).toMatch(/Wind 21 mph|Rain likely \(80%\)|Cold: 21°F/);
  });

  test("WX-4b: specific fixture games map to the expected chip text on the Lineup", async ({
    page,
  }) => {
    // Roster 1 may bench some of these players; assert on whichever are on the page, and require
    // that at least one of each flagged family is found overall so the check cannot pass vacuously.
    await page.goto(`${L}/lineup?roster=1&week=4`);
    await expect(page.getByTestId("lineup-page")).toBeVisible();
    const expectations: Array<[string[], RegExp]> = [
      [["11576", "12517", "13330"], /Wind 21 mph/],
      [["4983"], /Rain likely \(80%\)/],
      [["12490", "9224"], /Cold: 21°F/],
    ];
    for (const [ids, re] of expectations) {
      let seen = 0;
      for (const id of ids) {
        const link = page
          .locator(`[data-testid="player-link"][href$="/players/${id}"]`)
          .locator("visible=true");
        if ((await link.count()) === 0) continue;
        seen += 1;
        const row = rowOf(page, id);
        await expect(row.getByTestId("weather-chip").first()).toHaveText(re);
      }
      expect(seen, `none of players ${ids.join(", ")} are on the roster 1 lineup`).toBeGreaterThan(
        0,
      );
    }
    for (const id of ["11792", "5849", "3294", "8137", "11646", "7547"]) {
      const link = page
        .locator(`[data-testid="player-link"][href$="/players/${id}"]`)
        .locator("visible=true");
      if ((await link.count()) === 0) continue;
      await expect(rowOf(page, id).getByTestId("weather-chip")).toHaveCount(0);
    }
  });

  test("WX-5: the weather explanation opens on the Lineup and closes with Escape", async ({
    page,
  }) => {
    await page.goto(`${L}/lineup?roster=1&week=4`);
    const trigger = page.getByTestId("weather-info").first();
    const content = await openInfoPopover(page, trigger, "weather-info");
    await expect(content).toContainText("Weather is for context");
    await page.keyboard.press("Escape");
    await expect(content).toBeHidden();
  });

  test("WX-4c: Matchup shows weather chips on flagged starters", async ({ page }) => {
    await page.goto(`${L}/matchup?roster=1`);
    await expect(page.getByTestId("matchup-page")).toBeVisible();
    await expect(page.getByTestId("matchup-swing-list")).toBeVisible();
    const chips = page.getByTestId("weather-chip");
    await expect(chips.first()).toBeVisible();
    const texts = await chips.allInnerTexts();
    for (const t of texts) expect(t).toMatch(/Wind|Gusts|Rain|Snow|Mixed|Cold/);
    // Chips live inside swing rows only.
    await expect(
      page.getByTestId("matchup-swing-list").getByTestId("weather-chip").first(),
    ).toBeVisible();
  });

  test("WX-4d: the player card shows Indoors for a dome game", async ({ page }) => {
    await page.goto(`${L}/players/${DATA.otherPlayerId}`);
    const lines = page.getByTestId("weather-line");
    await expect(lines.first()).toBeVisible();
    await expect(page.getByText("Indoors", { exact: true }).first()).toBeVisible();
  });

  test("WX-4e: the player card shows a forecast line with degrees for an outdoor game", async ({
    page,
  }) => {
    // 12490 is JAX/CIN (Cold: 21°F in week 4).
    await page.goto(`${L}/players/12490`);
    const lines = page.getByTestId("weather-line");
    await expect(lines.first()).toBeVisible();
    await expect(lines.filter({ hasText: "21°F" }).first()).toBeVisible();
  });

  test("WX-5b: the plain weather note on the player card opens and states the rule", async ({
    page,
  }) => {
    await page.goto(`${L}/players/12490`);
    const info = page.getByTestId("weather-info");
    await expect(info).toBeVisible();
    await info.locator("summary").click();
    await expect(info).toContainText("Weather is for context");
  });

  test("UI5: Lineup with weather chips has no horizontal scroll at 390px", async ({ page }) => {
    await page.goto(`${L}/lineup?roster=1&week=4`);
    await expect(page.getByTestId("weather-chip").first()).toBeVisible();
    await expectNoHorizontalScroll(page, { width: PHONE_WIDTH });
    await page.goto(`${L}/lineup`);
    await expect(page.getByTestId("lineup-auto-reason")).toBeVisible();
    await expectNoHorizontalScroll(page, { width: PHONE_WIDTH });
  });

  for (const theme of themes) {
    test(`UI2: Lineup in Auto with weather chips has no serious axe violations (${theme})`, async ({
      page,
    }) => {
      await useTheme(page, theme);
      await page.goto(`${L}/lineup?roster=1&week=4&mode=auto`);
      await expect(page.getByTestId("weather-chip").first()).toBeVisible();
      await expect(page.getByTestId("lineup-auto-reason")).toBeVisible();
      await settleAnimations(page);
      await expectNoSeriousA11yViolations(page, { theme });
    });

    test(`UI2: Matchup with weather chips has no serious axe violations (${theme})`, async ({
      page,
    }) => {
      await useTheme(page, theme);
      await page.goto(`${L}/matchup?roster=1`);
      await expect(page.getByTestId("weather-chip").first()).toBeVisible();
      await settleAnimations(page);
      await expectNoSeriousA11yViolations(page, { theme });
    });

    test(`UI2: the player card with the forecast line has no serious axe violations (${theme})`, async ({
      page,
    }) => {
      await useTheme(page, theme);
      await page.goto(`${L}/players/12490`);
      await expect(page.getByTestId("weather-line").first()).toBeVisible();
      await settleAnimations(page);
      await expectNoSeriousA11yViolations(page, { theme });
    });
  }
});
