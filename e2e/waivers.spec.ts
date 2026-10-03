import { expect, test, type Page } from "@playwright/test";
import { L } from "./helpers/data";

const isDesktop = (width: number | undefined): boolean => (width ?? 0) >= 1024;

/** The one row list that is actually visible at the current viewport (house pattern: see
 * `search.spec.ts`'s `isDesktop` branch; `waiver-board.tsx` renders both a card list and a table
 * unconditionally and hides one of them with CSS, so both exist in the DOM at every viewport). */
function visibleRows(page: Page) {
  return isDesktop(page.viewportSize()?.width)
    ? page.getByTestId("waivers-table").getByTestId("waivers-row")
    : page.getByTestId("waivers-cards").getByTestId("waivers-row");
}

/**
 * Waivers page (PLAN 6.4 Waivers, WAIVER-1..6d, T4.7). The seeded league is Steph's real league
 * shape (ADR-003: rolling, non-FAAB waivers), so the priority advisor is applicable and the waiver
 * order section always renders.
 */
test.describe("Waivers (WAIVER-4/6)", () => {
  test("WAIVERS-FLOW-1: defaults to 'For my team', and the view toggle switches to 'Best available'", async ({
    page,
  }) => {
    await page.goto(`${L}/waivers`);
    await expect(page.getByTestId("waivers-page")).toBeVisible();
    await expect(page.getByRole("heading", { level: 1, name: "Waivers" })).toBeVisible();
    await expect(page.getByTestId("waivers-view-toggle-mine")).toHaveAttribute(
      "aria-current",
      "true",
    );
    await expect(page.getByTestId("waivers-view-toggle-available")).not.toHaveAttribute(
      "aria-current",
    );

    await page.getByTestId("waivers-view-toggle-available").click();
    await expect(page).toHaveURL(new RegExp(`${L}/waivers\\?week=\\d+&view=available$`));
    await expect(page.getByTestId("waivers-view-toggle-available")).toHaveAttribute(
      "aria-current",
      "true",
    );
    await expect(page.getByTestId("waivers-view-toggle-mine")).not.toHaveAttribute("aria-current");

    await page.getByTestId("waivers-view-toggle-mine").click();
    await expect(page).toHaveURL(new RegExp(`${L}/waivers\\?week=\\d+$`));
    await expect(page.getByTestId("waivers-view-toggle-mine")).toHaveAttribute(
      "aria-current",
      "true",
    );
  });

  test("WAIVERS-FLOW-2: a position filter narrows the candidate list and updates the URL", async ({
    page,
  }) => {
    await page.goto(`${L}/waivers`);
    const rows = visibleRows(page);
    // The position filter refetches (`waiver-board.tsx`'s module doc): while `status === "loading"`
    // the OLD (unfiltered) candidates stay rendered, dimmed, until the fetch resolves. Waiting for
    // the "Updating" status text to clear before snapshotting avoids reading a list that is still
    // being replaced mid-assertion.
    const status = page.locator('[aria-label="Waiver candidates"]').getByRole("status");
    await expect(status).not.toContainText("Updating");
    const beforeNames = await rows.allTextContents();
    expect(beforeNames.length).toBeGreaterThan(0);

    await page.getByTestId("waivers-position-filter-RB").click();
    await expect(page).toHaveURL(new RegExp(`${L}/waivers\\?week=\\d+&positions=RB$`));
    await expect(status).not.toContainText("Updating");
    // Every remaining row is RB-only (position badge text), and the count never exceeds the
    // unfiltered total. `allTextContents()` snapshots the whole list in one call, so there is no
    // window for the list to change again between measuring the count and reading each row's text.
    const filteredNames = await rows.allTextContents();
    expect(filteredNames.length).toBeLessThanOrEqual(beforeNames.length);
    for (const name of filteredNames) expect(name).toContain("RB");

    // Clearing the toggle (click again) removes the filter and restores the full list.
    await page.getByTestId("waivers-position-filter-RB").click();
    await expect(page).toHaveURL(new RegExp(`${L}/waivers\\?week=\\d+$`));
    await expect(status).not.toContainText("Updating");
    await expect.poll(async () => rows.count()).toBe(beforeNames.length);
  });

  test("WAIVERS-FLOW-3: opening a candidate's Why? sheet shows the Waiver Score breakdown chips", async ({
    page,
  }) => {
    await page.goto(`${L}/waivers`);
    const rows = visibleRows(page);
    await expect(rows.first()).toBeVisible();
    await rows.first().getByTestId("why-trigger").click();

    const sheet = page.getByRole("dialog");
    await expect(sheet).toBeVisible();
    await expect(sheet).toContainText("Waiver Score");
    // WAIVER-3's five weighted components, shown as reason chips inside the sheet body.
    await expect(sheet.getByTestId("why-body")).toContainText("Lineup Impact");
    await expect(sheet.getByTestId("why-body")).toContainText("Rest-of-season value");
    await expect(sheet.getByTestId("why-body")).toContainText("Usage trend");
    await expect(sheet.getByTestId("why-body")).toContainText("Sleeper momentum");
    await expect(sheet.getByTestId("why-body")).toContainText("Schedule");

    await page.keyboard.press("Escape");
    await expect(sheet).toBeHidden();
  });

  test("WAIVERS-FLOW-4: WAIVER-6a's waiver order section renders my position in a rolling-waiver league", async ({
    page,
  }) => {
    await page.goto(`${L}/waivers`);
    const advisor = page.getByTestId("waivers-priority-advisor");
    await expect(advisor).toBeVisible();
    // Rolling waivers (ADR-003): the FAAB note must never render for this league.
    await expect(page.getByTestId("waivers-faab-note")).toHaveCount(0);
    await expect(page.getByTestId("waivers-priority-order")).toBeVisible();
    await expect(page.getByTestId("waivers-order-you")).toBeVisible();
    await expect(page.getByTestId("waivers-clear-time")).toBeVisible();
  });
});
