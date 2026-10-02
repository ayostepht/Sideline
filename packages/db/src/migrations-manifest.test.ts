import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { EXPECTED_MIGRATIONS } from "./migrations-manifest.js";

const Journal = z.object({ entries: z.array(z.object({ tag: z.string(), when: z.number() })) });

describe("migrations manifest", () => {
  it("matches drizzle/meta/_journal.json (update migrations-manifest.ts after db:generate)", () => {
    const path = fileURLToPath(new URL("../drizzle/meta/_journal.json", import.meta.url));
    const journal = Journal.parse(JSON.parse(readFileSync(path, "utf8")));
    expect(EXPECTED_MIGRATIONS.map((m) => ({ tag: m.tag, when: m.when }))).toEqual(
      journal.entries.map((e) => ({ tag: e.tag, when: e.when })),
    );
  });
});
