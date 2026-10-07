import { expect, test, type Locator, type Page } from "@playwright/test";
import { expectNoSeriousA11yViolations } from "./helpers/axe";
import { DATA, L } from "./helpers/data";
import { expectNoHorizontalScroll, PHONE_WIDTH } from "./helpers/no-hscroll";
import { searchPlayers } from "./helpers/players-search";
import { NEWS_FIXTURE, seedPlayerNews } from "./helpers/news";
import { settleAnimations } from "./helpers/settle";
import { themes, useTheme } from "./helpers/theme";

/**
 * Player pop-up and player card (ADR-020, P7.3 to P7.6). Runs on all three projects.
 * Fixture facts (seeded league): Gibbs 9221 DET on my roster, Stroud 9758 HOU a free agent shown on
 * Home and Waivers, Mahomes 4046 KC on roster 3 (no news), Jeudy 6783 CLE free agent.
 */
const isDesktop = (width: number | undefined): boolean => (width ?? 0) >= 1024;
const NEWSLESS_ID = DATA.otherPlayerId;
const NEWSLESS_NAME = DATA.otherPlayerName;
const UNKNOWN_ID = "99999999";

const playerUrl = (id: string): RegExp => new RegExp(`${L}/players/${id}$`);
const linkTo = (page: Page, id: string): Locator =>
  // Some pages render a desktop table and a mobile card list; take the one shown at this viewport.
  page
    .locator(`[data-testid="player-link"][href$="/players/${id}"]`)
    .locator("visible=true")
    .first();

/** The smallest list/table/card container that holds a name link, to read its subline. */
const containerOf = (link: Locator): Locator =>
  link.locator(
    "xpath=ancestor::*[self::li or self::tr or @data-testid='player-row' or @data-testid='players-row' or @data-testid='waiver-card'][1]",
  );

interface Entry {
  label: string;
  path: string;
  id: string;
  name: string;
  team: string;
  ready: string;
}

const ENTRIES: readonly Entry[] = [
  { label: "Home", path: L, id: "9758", name: "C.J. Stroud", team: "HOU", ready: "home-page" },
  {
    label: "Lineup",
    path: `${L}/lineup`,
    id: DATA.myPlayerId,
    name: DATA.myPlayerName,
    team: DATA.myPlayerNflTeam,
    ready: "lineup-page",
  },
  {
    label: "Matchup",
    path: `${L}/matchup`,
    id: DATA.myPlayerId,
    name: DATA.myPlayerName,
    team: DATA.myPlayerNflTeam,
    ready: "matchup-page",
  },
  {
    label: "Waivers",
    path: `${L}/waivers`,
    id: "9758",
    name: "C.J. Stroud",
    team: "HOU",
    ready: "waivers-page",
  },
  {
    label: "Team",
    path: `${L}/team`,
    id: DATA.myPlayerId,
    name: DATA.myPlayerName,
    team: DATA.myPlayerNflTeam,
    ready: "team-view",
  },
];

async function openFrom(page: Page, e: Entry): Promise<Locator> {
  await page.goto(e.path);
  await expect(page.getByTestId(e.ready)).toBeVisible();
  const link = linkTo(page, e.id);
  await expect(link).toBeVisible();
  await link.click();
  await expect(page).toHaveURL(playerUrl(e.id));
  await expect(page.getByTestId("player-modal")).toBeVisible();
  return link;
}

test.describe("Player pop-up opens from every page (ADR-020)", () => {
  for (const e of ENTRIES) {
    test(`PLAYERCARD-1: ${e.label}: the name opens the pop-up with its own URL and shows the team`, async ({
      page,
    }) => {
      await page.goto(e.path);
      await expect(page.getByTestId(e.ready)).toBeVisible();
      const link = linkTo(page, e.id);
      await expect(link).toBeVisible();
      // Team subline under the name (smaller text), not only on the card.
      await expect(containerOf(link)).toContainText(e.team);
      await link.click();
      await expect(page).toHaveURL(playerUrl(e.id));
      const modal = page.getByTestId("player-modal");
      await expect(modal).toBeVisible();
      await expect(page.getByRole("dialog", { name: e.name })).toBeVisible();
      await expect(modal.getByRole("heading", { level: 1, name: e.name })).toBeVisible();
    });
  }

  test("PLAYERCARD-1: Players: a row opens the pop-up and shows the team", async ({ page }) => {
    await page.goto(`${L}/players`);
    await searchPlayers(page, DATA.otherPlayerQuery);
    const desktop = isDesktop(page.viewportSize()?.width);
    const rows = page.getByTestId(desktop ? "players-table-row" : "players-row");
    await expect.poll(async () => rows.count()).toBe(1);
    await expect(rows.first()).toContainText(DATA.otherPlayerNflTeam);
    await (desktop ? rows.first().getByRole("link") : rows.first()).click();
    await expect(page).toHaveURL(playerUrl(DATA.otherPlayerId));
    await expect(page.getByRole("dialog", { name: DATA.otherPlayerName })).toBeVisible();
  });
});

test.describe("Player pop-up behavior (ADR-020)", () => {
  const e = ENTRIES[1] as Entry; // Lineup

  test("PLAYERCARD-2: Back closes the pop-up and returns to the page", async ({ page }) => {
    await openFrom(page, e);
    await page.goBack();
    await expect(page.getByTestId("player-modal")).toHaveCount(0);
    await expect(page).toHaveURL(new RegExp(`${L}/lineup$`));
    await expect(page.getByTestId("lineup-page")).toBeVisible();
  });

  test("PLAYERCARD-3: Escape closes and focus returns to the clicked name", async ({ page }) => {
    const link = await openFrom(page, e);
    await page.keyboard.press("Escape");
    await expect(page.getByTestId("player-modal")).toHaveCount(0);
    await expect(page).toHaveURL(new RegExp(`${L}/lineup$`));
    await expect(link).toBeFocused();
  });

  test("PLAYERCARD-4: reloading the player URL renders the full page, no pop-up", async ({
    page,
  }) => {
    await openFrom(page, e);
    await page.reload();
    await expect(page.getByTestId("player-detail")).toBeVisible();
    await expect(page.getByTestId("player-modal")).toHaveCount(0);
    await expect(page.getByRole("heading", { level: 1, name: DATA.myPlayerName })).toBeVisible();
    await expect(page.getByTestId("player-weekly-table")).toBeVisible();
  });

  test("PLAYERCARD-5: navigating to another page while open closes the pop-up", async ({
    page,
  }) => {
    await openFrom(page, e);
    // The overlay blocks pointer clicks on the nav (modal), so trigger the link's own click handler:
    // a real soft navigation through next/link.
    await page.evaluate(
      `(() => { const a = document.querySelector('a[href="${L}/matchup"]'); if (!a) throw new Error("no matchup link"); a.click(); })()`,
    );
    await expect(page).toHaveURL(new RegExp(`${L}/matchup$`));
    await expect(page.getByTestId("matchup-page")).toBeVisible();
    await expect(page.getByTestId("player-modal")).toHaveCount(0);
    await expect(page.getByRole("dialog")).toHaveCount(0);
  });

  test("PLAYERCARD-6: with the pop-up open over Lineup, Lineup stays the current nav item", async ({
    page,
  }) => {
    await openFrom(page, e);
    // The rest of the page is inert while the dialog is open, so include hidden elements.
    const current = page.locator(`a[href="${L}/lineup"][aria-current="page"]`);
    await expect(current.first()).toBeAttached();
    await expect(page.locator(`a[href="${L}"][aria-current="page"]`)).toHaveCount(0);
    await expect(page.locator(`a[href="${L}/players"][aria-current="page"]`)).toHaveCount(0);
  });

  test("PLAYERCARD-7: an unknown player id opened by soft navigation says Player not found", async ({
    page,
  }) => {
    await page.goto(`${L}/lineup`);
    await expect(page.getByTestId("lineup-page")).toBeVisible();
    // next/link soft navigation to a player URL that has no player: the app router is exposed as
    // window.next.router in the browser.
    await page.evaluate(
      `(() => { const r = window.next && window.next.router; if (!r) throw new Error("window.next.router is missing"); r.push("${L}/players/${UNKNOWN_ID}"); })()`,
    );
    await expect(page).toHaveURL(playerUrl(UNKNOWN_ID));
    await expect(page.getByTestId("player-modal")).toBeVisible();
    await expect(page.getByTestId("player-modal")).toContainText("Player not found");
  });
});

test.describe("Player pop-up navigation sequences (ADR-020 amendment, P7.9)", () => {
  const e = ENTRIES[1] as Entry; // Lineup

  // Pop-up soft navigation to another player id: next/link behavior, the card has no player links.
  const softPush = (page: Page, href: string): Promise<unknown> =>
    page.evaluate(
      `(() => { const r = window.next && window.next.router; if (!r) throw new Error("window.next.router is missing"); r.push(${JSON.stringify(href)}); })()`,
    );

  test("PLAYERCARD-15: Back then Forward re-opens the same player as a pop-up, Lineup stays current", async ({
    page,
  }) => {
    await openFrom(page, e);
    await page.goBack();
    await expect(page.getByTestId("player-modal")).toHaveCount(0);
    await expect(page.getByTestId("lineup-page")).toBeVisible();
    await page.goForward();
    await expect(page).toHaveURL(playerUrl(e.id));
    // Recorded behavior: Forward restores the intercepted pop-up (not the full page).
    await expect(page.getByRole("dialog", { name: e.name })).toBeVisible();
    await expect(page.getByTestId("player-modal")).toHaveCount(1);
    await expect(page.getByTestId("lineup-page")).toBeAttached();
    await expect(page.locator(`a[href="${L}/lineup"][aria-current="page"]`).first()).toBeAttached();
    await expect(page.locator(`a[href="${L}/players"][aria-current="page"]`)).toHaveCount(0);
  });

  test("PLAYERCARD-16: the card has no player links; history A to B and back switches the dialog", async ({
    page,
  }) => {
    await openFrom(page, e);
    // Documented: the pop-up has no in-app links to other players or teams, only the close button.
    // External ESPN news links (target=_blank) may appear when another test seeded news for e.
    await expect(page.getByTestId("player-modal").locator(`a[href^="/l/"]`)).toHaveCount(0);
    await softPush(page, `${L}/players/${NEWSLESS_ID}`);
    await expect(page).toHaveURL(playerUrl(NEWSLESS_ID));
    await expect(page.getByRole("dialog", { name: NEWSLESS_NAME })).toBeVisible();
    await expect(page.getByRole("dialog", { name: e.name })).toHaveCount(0);
    await page.goBack();
    await expect(page).toHaveURL(playerUrl(e.id));
    await expect(page.getByRole("dialog", { name: e.name })).toBeVisible();
    await page.goForward();
    await expect(page.getByRole("dialog", { name: NEWSLESS_NAME })).toBeVisible();
    await page.goBack();
    await page.goBack();
    await expect(page).toHaveURL(new RegExp(`${L}/lineup$`));
    await expect(page.getByTestId("player-modal")).toHaveCount(0);
    await expect(page.getByTestId("lineup-page")).toBeVisible();
  });

  test("PLAYERCARD-17: open A, Back, open B, Back, Forward twice ends on B then stays on B", async ({
    page,
  }) => {
    await openFrom(page, e);
    await page.goBack();
    await expect(page.getByTestId("player-modal")).toHaveCount(0);
    // A second player linked on the Lineup page.
    const links = await page.locator('[data-testid="player-link"]').locator("visible=true").all();
    const hrefs = await Promise.all(links.map(async (l) => (await l.getAttribute("href")) ?? ""));
    const other = hrefs.find((h) => !h.endsWith(`/players/${e.id}`));
    if (other === undefined) throw new Error("no second player on Lineup");
    const otherId = other.split("/").pop() ?? "";
    await linkTo(page, otherId).click();
    await expect(page).toHaveURL(playerUrl(otherId));
    await expect(page.getByTestId("player-modal")).toBeVisible();
    await page.goBack();
    await expect(page.getByTestId("player-modal")).toHaveCount(0);
    await page.goForward();
    await expect(page).toHaveURL(playerUrl(otherId));
    await expect(page.getByTestId("player-modal")).toBeVisible();
    // Second Forward has nowhere to go: still on B.
    await page.goForward();
    await expect(page).toHaveURL(playerUrl(otherId));
    await expect(page.getByTestId("player-modal")).toHaveCount(1);
  });

  test("PLAYERCARD-18: leaving the pop-up for another page puts focus on #main-content", async ({
    page,
  }) => {
    const link = await openFrom(page, e);
    // No links inside the card, and the nav is behind the overlay: Escape, then use the nav.
    await page.keyboard.press("Escape");
    await expect(page.getByTestId("player-modal")).toHaveCount(0);
    await expect(link).toBeFocused();
    await page.locator(`a[href="${L}/matchup"]:visible`).first().click();
    await expect(page).toHaveURL(new RegExp(`${L}/matchup$`));
    await expect(page.getByTestId("matchup-page")).toBeVisible();
    await expect(page.locator("#main-content")).toBeFocused();
  });

  test("PLAYERCARD-19: soft navigation away with the pop-up open lands focus on #main-content, not a stale trigger", async ({
    page,
  }) => {
    const link = await openFrom(page, e);
    await page.evaluate(
      `(() => { const a = document.querySelector('a[href="${L}/matchup"]'); if (!a) throw new Error("no matchup link"); a.click(); })()`,
    );
    await expect(page).toHaveURL(new RegExp(`${L}/matchup$`));
    await expect(page.getByTestId("matchup-page")).toBeVisible();
    await expect(page.getByTestId("player-modal")).toHaveCount(0);
    await expect(page.locator("#main-content")).toBeFocused();
    await expect(link).not.toBeFocused();
  });

  test("PLAYERCARD-20: right after opening, focus is inside the dialog, not on #main-content", async ({
    page,
  }) => {
    await openFrom(page, e);
    const modal = page.getByTestId("player-modal");
    await expect.poll(() => modal.locator(":focus").count()).toBeGreaterThan(0);
    await expect(page.locator("#main-content")).not.toBeFocused();
  });
});

test.describe("Player card content (ADR-020)", () => {
  test("PLAYERCARD-8: headshot loads from the CDN, weekly table has caption, headers and rows", async ({
    page,
  }) => {
    // 1x1 gif so the test needs no network and still proves the CSP lets sleepercdn.com images in.
    const gif = Buffer.from("R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7", "base64");
    await page.route("https://sleepercdn.com/**", (r) =>
      r.fulfill({ status: 200, contentType: "image/gif", body: gif }),
    );
    await page.goto(`${L}/lineup`);
    await expect(page.getByTestId("lineup-page")).toBeVisible();
    await linkTo(page, DATA.myPlayerId).click();
    const modal = page.getByTestId("player-modal");
    await expect(modal).toBeVisible();

    const img = modal.getByTestId("player-avatar").locator("img");
    await expect(img).toHaveAttribute("src", new RegExp(`sleepercdn\\.com/.*${DATA.myPlayerId}`));
    await expect
      .poll(() => img.evaluate((el) => (el as unknown as { naturalWidth: number }).naturalWidth))
      .toBeGreaterThan(0);

    await expect(modal.getByRole("heading", { name: "Week by week" })).toBeVisible();
    const table = modal.getByTestId("player-weekly-table").getByRole("table");
    await expect(table.locator("caption")).toHaveText("Weekly results, newest week first");
    for (const h of ["Week", "Opp", "Pts", "Rank", "Result"]) {
      await expect(table.getByRole("columnheader", { name: h, exact: true })).toBeVisible();
    }
    // One row per week, newest first with no gaps: the first row's week number equals the count.
    const rows = table.getByTestId("player-weekly-row");
    const n = await rows.count();
    expect(n).toBeGreaterThan(0);
    const weeks = (await rows.locator("th[scope=row]").allTextContents()).map(Number);
    expect(weeks).toEqual(Array.from({ length: n }, (_, i) => n - i));
    // Boom and Bust are words, never only a color. Gibbs has Boom weeks in the fixture.
    const results = await rows.locator("td:last-child").allTextContents();
    for (const r of results) expect(["", "Boom", "Bust"]).toContain(r.trim());
    expect(results.some((r) => r.trim() === "Boom")).toBe(true);
  });

  test("PLAYERCARD-9: headshot falls back to initials when the image fails", async ({ page }) => {
    await page.route("https://sleepercdn.com/**", (r) => r.abort());
    await page.goto(`${L}/lineup`);
    await expect(page.getByTestId("lineup-page")).toBeVisible();
    await linkTo(page, DATA.myPlayerId).click();
    const avatar = page.getByTestId("player-modal").getByTestId("player-avatar");
    await expect(avatar).toHaveText("JG");
    await expect(avatar.locator("img")).toHaveCount(0);
  });

  test("PLAYERCARD-10: no horizontal scroll at 390px with the pop-up open and on the full page", async ({
    page,
  }) => {
    await page.setViewportSize({ width: PHONE_WIDTH, height: 800 });
    await page.goto(`${L}/lineup`);
    await expect(page.getByTestId("lineup-page")).toBeVisible();
    await linkTo(page, DATA.myPlayerId).click();
    await expect(page.getByTestId("player-modal")).toBeVisible();
    await expect(page.getByTestId("player-weekly-table")).toBeVisible();
    await settleAnimations(page);
    await expectNoHorizontalScroll(page);
    await page.goto(`${L}/players/${DATA.myPlayerId}`);
    await expect(page.getByTestId("player-detail")).toBeVisible();
    await expectNoHorizontalScroll(page);
  });
});

test.describe("Player news (ADR-020 item 4)", () => {
  test("PLAYERCARD-11: news headline opens ESPN in a new tab safely, with attribution", async ({
    page,
  }) => {
    seedPlayerNews(DATA.myPlayerId);
    await page.goto(`${L}/players/${DATA.myPlayerId}`);
    const section = page.getByTestId("player-section-news");
    const link = section.getByRole("link", { name: new RegExp(NEWS_FIXTURE.headline) });
    await expect(link).toBeVisible();
    await expect(link).toHaveAttribute("href", NEWS_FIXTURE.url);
    await expect(link).toHaveAttribute("target", "_blank");
    expect(await link.getAttribute("rel")).toContain("noopener");
    await expect(section).toContainText("News from ESPN");
    await expect(section.getByTestId("player-news-empty")).toHaveCount(0);
  });

  test("PLAYERCARD-12: a player without news shows No recent news.", async ({ page }) => {
    await page.goto(`${L}/players/${NEWSLESS_ID}`);
    const section = page.getByTestId("player-section-news");
    await expect(section.getByTestId("player-news-empty")).toHaveText("No recent news.");
    await expect(section).toContainText("News from ESPN");
  });

  test("PLAYERCARD-13: the news refresh POST is sent at most once per open", async ({ page }) => {
    const posts: string[] = [];
    page.on("request", (r) => {
      if (r.method() === "POST" && r.url().includes("/news/refresh")) posts.push(r.url());
    });
    await page.goto(`${L}/lineup`);
    await expect(page.getByTestId("lineup-page")).toBeVisible();
    // Mahomes has no stored news and no fetch record, so the card asks for a refresh.
    await page.goto(`${L}/players`);
    await searchPlayers(page, DATA.otherPlayerQuery);
    const desktop = isDesktop(page.viewportSize()?.width);
    const rows = page.getByTestId(desktop ? "players-table-row" : "players-row");
    await expect.poll(async () => rows.count()).toBe(1);
    const first = page.waitForRequest(
      (r) => r.method() === "POST" && r.url().includes("/news/refresh"),
    );
    await (desktop ? rows.first().getByRole("link") : rows.first()).click();
    await expect(page.getByRole("dialog", { name: NEWSLESS_NAME })).toBeVisible();
    await first;
    expect(posts[0]).toContain(`/players/${NEWSLESS_ID}/news/refresh`);
    // If the server queued it, "Checking for news..." shows for a while and then the page refreshes.
    // Wait for that to settle, then for the network to go quiet, before counting.
    await expect(page.getByTestId("player-news-checking")).toBeHidden({ timeout: 15_000 });
    await page.waitForLoadState("networkidle");
    expect(posts).toHaveLength(1);
  });
});

test.describe("No request loops (P7.8c prefetch fix)", () => {
  for (const [label, path, ready] of [
    ["Home", L, "home-page"],
    ["Lineup", `${L}/lineup`, "lineup-page"],
  ] as const) {
    test(`PLAYERCARD-14: ${label} reaches network idle`, async ({ page }) => {
      await page.goto(path);
      await expect(page.getByTestId(ready)).toBeVisible();
      // networkidle never arrives if the page keeps re-prefetching routes; the default 30s test
      // timeout is the budget.
      await page.waitForLoadState("networkidle");
    });
  }
});

test.describe("Player pop-up accessibility", () => {
  for (const theme of themes) {
    test(`UI2: the open player pop-up has no serious axe violations (${theme})`, async ({
      page,
    }) => {
      await useTheme(page, theme);
      seedPlayerNews(DATA.myPlayerId);
      await page.goto(`${L}/lineup`);
      await expect(page.getByTestId("lineup-page")).toBeVisible();
      await linkTo(page, DATA.myPlayerId).click();
      await expect(page.getByTestId("player-modal")).toBeVisible();
      await expect(page.getByTestId("player-weekly-table")).toBeVisible();
      await expect(page.getByTestId("player-news-list")).toBeVisible();
      await settleAnimations(page);
      await expectNoSeriousA11yViolations(page, { theme });
    });
  }
});
