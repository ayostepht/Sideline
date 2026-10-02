import { describe, expect, it } from "vitest";
import { RawPlayerSchema } from "../../packages/sleeper/src/index.js";

/**
 * Opt-in live check: only collected when CONTRACT_PLAYERS=1 (see vitest.config.ts). Calls the
 * live Sleeper API directly with plain fetch (NOT the shared rate limiter). `/players/nfl` is a
 * multi-MB call allowed at most once per day (PLAN.md 3.1). Parsed in memory, never written.
 */
describe("contract: Sleeper players", () => {
  it("CONTRACT-3: /v1/players/nfl rows match RawPlayerSchema", async () => {
    const res = await fetch("https://api.sleeper.app/v1/players/nfl", {
      headers: { accept: "application/json" },
    });
    expect(res.status).toBe(200);
    const rows = Object.values((await res.json()) as Record<string, unknown>);
    expect(rows.length).toBeGreaterThan(1000);
    const bad = rows.filter((r) => !RawPlayerSchema.safeParse(r).success).length;
    expect(bad, "players failing schema").toBe(0);
  });
});
