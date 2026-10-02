import { readFileSync, existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { gzipSync } from "node:zlib";

export const FIXTURES_DIR = resolve(import.meta.dirname, "../../../tests/fixtures");

export interface FixtureManifest {
  leagueId: string;
  season: string;
  currentWeek: number;
  recordedAt: string;
}

export function readManifest(dir: string = FIXTURES_DIR): FixtureManifest {
  const m = JSON.parse(readFileSync(join(dir, "sleeper", "manifest.json"), "utf8")) as Partial<
    Record<keyof FixtureManifest, unknown>
  >;
  if (
    typeof m.leagueId !== "string" ||
    typeof m.season !== "string" ||
    typeof m.currentWeek !== "number" ||
    typeof m.recordedAt !== "string"
  ) {
    throw new Error(
      "tests/fixtures/sleeper/manifest.json is missing leagueId/season/currentWeek/recordedAt",
    );
  }
  return {
    leagueId: m.leagueId,
    season: m.season,
    currentWeek: m.currentWeek,
    recordedAt: m.recordedAt,
  };
}

/** Relative fixture path for a URL, or null when the URL is not one we have a recording for. */
export function fixturePathFor(rawUrl: string): { path: string; gzip: boolean } | null {
  const url = new URL(rawUrl);
  if (url.hostname === "api.sleeper.app") {
    const p = url.pathname.replace(/\/+$/, "");
    // Usernames are case-insensitive on Sleeper; recorded files use the lowercase form.
    const user = /^\/v1\/user\/([^/]+)$/.exec(p);
    if (user?.[1] !== undefined && !/^\d+$/.test(user[1]))
      return { path: `sleeper/v1/user/${user[1].toLowerCase()}.json`, gzip: false };
    if (p.startsWith("/v1/")) return { path: `sleeper/v1/${p.slice(4)}.json`, gzip: false };
    const m = /^\/(projections|stats)\/nfl\/(\d{4})\/(\d{1,2})$/.exec(p);
    if (m) return { path: `sleeper/${m[1]}/${m[2]}/${m[3]}.json`, gzip: false };
    return null;
  }
  if (url.hostname === "github.com") {
    const m =
      /^\/nflverse\/nflverse-data\/releases\/download\/([a-z_]+)\/([A-Za-z0-9_]+)\.csv\.gz$/.exec(
        url.pathname,
      );
    if (m) return { path: `nflverse/${m[1]}/${m[2]}.csv`, gzip: true };
  }
  return null;
}

/**
 * A fetch that serves only the recorded files under tests/fixtures/ and never touches the network.
 * Any other URL (or a missing file) throws with the URL.
 */
export function createFixtureFetch(
  dir: string = FIXTURES_DIR,
  onRequest?: (url: string) => void,
): typeof fetch {
  return (input) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    onRequest?.(url);
    const hit = fixturePathFor(url);
    const file = hit ? join(dir, hit.path) : null;
    if (!hit || file === null || !existsSync(file)) {
      return Promise.reject(new Error(`fixture fetch: no recorded fixture for ${url}`));
    }
    const raw = readFileSync(file);
    const body = hit.gzip ? gzipSync(raw) : raw;
    return Promise.resolve(
      new Response(new Uint8Array(body), {
        status: 200,
        headers: { "content-type": hit.gzip ? "application/gzip" : "application/json" },
      }),
    );
  };
}
