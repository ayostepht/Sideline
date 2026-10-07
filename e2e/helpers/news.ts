import { openDb, recordPlayerNewsFetch, upsertPlayerNews } from "@sideline/db";

/**
 * The seeded e2e DATA_DIR has no ESPN news (the fixture seed does not run the news job, and only
 * the player whose espn id is 3139477 gets per-player news in worker fixture mode). Specs that
 * need a news item write one straight into the seeded database, like the worker would.
 * Idempotent: safe to call from every project and every worker.
 */
export const NEWS_FIXTURE = {
  headline: "Fixture Back logs a big workload in practice",
  url: "https://www.espn.com/nfl/story/_/id/1/fixture-news",
  source: "Rotowire",
} as const;

export function seedPlayerNews(playerId: string): void {
  const dir = process.env["E2E_DATA_DIR"];
  if (!dir) throw new Error("E2E_DATA_DIR is not set; start the e2e run through playwright.config");
  const h = openDb(`${dir}/sideline.sqlite`);
  try {
    const now = new Date().toISOString();
    upsertPlayerNews(h, [
      {
        id: `espn:e2e-1:${playerId}`,
        playerId,
        headline: NEWS_FIXTURE.headline,
        summary: "Fixture summary text.",
        url: NEWS_FIXTURE.url,
        source: NEWS_FIXTURE.source,
        publishedAt: now,
        fetchedAt: now,
      },
    ]);
    // A fresh fetch record keeps this player out of the on-demand refresh path.
    recordPlayerNewsFetch(h, { playerId, attemptedAt: now, ok: true, itemCount: 1 });
  } finally {
    h.sqlite.close();
  }
}
