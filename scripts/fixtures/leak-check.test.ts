import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { buildFixtureFiles } from "./build.js";
import { findLeaks } from "./leak-check.js";
import { collectIdentifiers } from "./sanitize.js";
import { REAL, syntheticInput, syntheticRaw } from "./test-data.js";

const identifiers = collectIdentifiers(syntheticRaw(), REAL.leagueId, { names: [REAL.username] });
const idx = (list: readonly string[], value: string): number => list.indexOf(value);

describe("findLeaks", () => {
  it("passes clean files", () => {
    const files = [{ path: "v1/league/1.json", text: JSON.stringify({ name: "Example League" }) }];
    expect(findLeaks(files, identifiers)).toEqual([]);
  });

  it("finds a planted display name (case-insensitive) and reports file and index, not the value", () => {
    const planted = [
      {
        path: "v1/x.json",
        text: JSON.stringify({ team: `Fan of ${REAL.displayB.toUpperCase()}` }),
      },
    ];
    const leaks = findLeaks(planted, identifiers);
    expect(leaks).toEqual([
      { file: "v1/x.json", category: "name", index: idx(identifiers.names, REAL.displayB) },
    ]);
    expect(JSON.stringify(leaks)).not.toContain(REAL.displayB);
  });

  it("finds planted ids and avatars anywhere in the text, and ids in file paths", () => {
    const leaks = findLeaks(
      [
        { path: "a.json", text: `{"k":"x${REAL.userA}y"}` },
        { path: `v1/user/${REAL.userB}/leagues.json`, text: "[]" },
        { path: "b.json", text: `{"avatar":"${REAL.avatarA}"}` },
      ],
      identifiers,
    );
    expect(leaks.map((l) => `${l.file}:${l.category}`).sort()).toEqual([
      "a.json:id",
      "b.json:avatar",
      `v1/user/${REAL.userB}/leagues.json:id`,
    ]);
  });

  it("matches short names as whole words inside text files (3 characters, .md)", () => {
    const ids = collectIdentifiers(syntheticRaw(), REAL.leagueId, { names: ["Zed"] });
    const files = [
      { path: "docs/a.md", text: "Notes: thanks to zed for the help." },
      { path: "docs/b.md", text: "Zedong and Hazed are different words." },
    ];
    expect(findLeaks(files, ids)).toEqual([
      { file: "docs/a.md", category: "name", index: ids.names.indexOf("Zed") },
    ]);
    const json = [{ path: "x.json", text: JSON.stringify({ note: "ask Zed." }) }];
    expect(findLeaks(json, ids)).toHaveLength(1);
  });

  it("matches short names only as whole words", () => {
    const hit = findLeaks(
      [{ path: "a.json", text: JSON.stringify({ v: REAL.displayC }) }],
      identifiers,
    );
    const miss = findLeaks([{ path: "a.json", text: JSON.stringify({ v: "Quick" }) }], identifiers);
    expect(hit).toHaveLength(1);
    expect(miss).toEqual([]);
  });

  it("ignores names under public player name keys but still flags other keys", () => {
    const players = { "1": { full_name: "Gridiron Goblins", note: "ok" } };
    expect(findLeaks([{ path: "p.json", text: JSON.stringify(players) }], identifiers)).toEqual([]);
    const note = { "1": { full_name: "x", note: "Gridiron Goblins" } };
    expect(findLeaks([{ path: "p.json", text: JSON.stringify(note) }], identifiers)).toHaveLength(
      1,
    );
  });

  it("falls back to a raw text scan for non-JSON files", () => {
    const leaks = findLeaks([{ path: "notes.txt", text: `hello ${REAL.teamB}` }], identifiers);
    expect(leaks).toHaveLength(1);
  });
});

describe("whole pipeline output", () => {
  it("contains no original identifier", () => {
    const { files, identifiers: found } = buildFixtureFiles(syntheticInput());
    expect(
      findLeaks(
        [...files].map(([path, text]) => ({ path, text })),
        found,
      ),
    ).toEqual([]);
  });

  it("detects a leak planted into a temp copy of an output file on disk", () => {
    const dir = mkdtempSync(join(tmpdir(), "fixture-check-"));
    try {
      const { files, identifiers: found } = buildFixtureFiles(syntheticInput());
      const read: { path: string; text: string }[] = [];
      for (const [path, text] of files) {
        const full = join(dir, path);
        mkdirSync(join(full, ".."), { recursive: true });
        const planted = path.endsWith("/users.json")
          ? text.replace("Team 02", REAL.displayA)
          : text;
        writeFileSync(full, planted);
        read.push({ path, text: planted });
      }
      const leaks = findLeaks(read, found);
      expect(leaks).toHaveLength(1);
      expect(leaks[0]?.file.endsWith("/users.json")).toBe(true);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("findLeaks ADR-018 URL handles and images", () => {
  const FAKE = "zed";
  const fakeIds = collectIdentifiers(syntheticRaw(), REAL.leagueId, { names: [FAKE] });
  const opts = { urlHandles: [FAKE] };

  it("allows the handle inside github, raw.githubusercontent and ghcr URLs", () => {
    const text = [
      "https://GitHub.com/zed/repo",
      "https://raw.githubusercontent.com/Zed/repo/main/x",
      "ghcr.io/ZED/sideline",
    ].join("\n");
    expect(findLeaks([{ path: "README.md", text }], fakeIds, opts)).toEqual([]);
  });

  it("flags the handle elsewhere in text, and without the option", () => {
    const text = "see github.com/zed/repo\nowner: zed";
    expect(findLeaks([{ path: "a.md", text }], fakeIds, opts)).toHaveLength(1);
    expect(findLeaks([{ path: "a.md", text: "github.com/zed/repo" }], fakeIds)).toHaveLength(1);
  });

  it("does not match image bytes, but still checks the image path", () => {
    const bytes = Buffer.from([0x89, 0x50, 0x20, 0x7a, 0x65, 0x64, 0x20, 0x01]).toString("utf8");
    expect(findLeaks([{ path: "s/shot.png", text: bytes }], fakeIds, opts)).toEqual([]);
    expect(findLeaks([{ path: "s/zed.png", text: bytes }], fakeIds, opts)).toHaveLength(1);
    expect(findLeaks([{ path: "s/shot.txt", text: bytes }], fakeIds, opts)).toHaveLength(1);
  });
});
