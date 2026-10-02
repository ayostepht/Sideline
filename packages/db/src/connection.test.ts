import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { EXPECTED_MIGRATIONS } from "./migrations-manifest.js";
import { dbPathFromDataDir, isMigrated, migrate, openDb, type DbHandle } from "./connection.js";

const dirs: string[] = [];
const handles: DbHandle[] = [];
afterEach(() => {
  for (const h of handles.splice(0)) if (h.sqlite.open) h.sqlite.close();
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});
function tmp(): string {
  const d = mkdtempSync(join(tmpdir(), "sideline-db-"));
  dirs.push(d);
  return d;
}
function open(path: string, opts?: { readonly?: boolean }): DbHandle {
  const h = openDb(path, opts);
  handles.push(h);
  return h;
}

const TABLES = [
  "app_settings",
  "leagues",
  "league_users",
  "rosters",
  "players",
  "player_week_stats",
  "player_week_projections",
  "player_week_projection_snapshots",
  "league_player_week_points",
  "defense_vs_position",
  "matchups",
  "transactions",
  "schedule",
  "usage_week",
  "trending",
  "sync_runs",
  "computed_cache",
  "nfl_state",
  "http_cache",
  "sync_requests",
];

describe("T1.3a migrations", () => {
  it("creates every PLAN 4.5 and ADR-005 table; second migrate is a no-op; isMigrated flips", () => {
    const h = open(dbPathFromDataDir(tmp()));
    expect(isMigrated(h)).toBe(false);
    migrate(h);
    expect(isMigrated(h)).toBe(true);
    const names = (
      h.sqlite.prepare("SELECT name FROM sqlite_master WHERE type='table'").all() as {
        name: string;
      }[]
    ).map((r) => r.name);
    for (const t of TABLES) expect(names, t).toContain(t);
    const before = (
      h.sqlite.prepare("SELECT count(*) AS n FROM __drizzle_migrations").get() as { n: number }
    ).n;
    migrate(h);
    const after = (
      h.sqlite.prepare("SELECT count(*) AS n FROM __drizzle_migrations").get() as { n: number }
    ).n;
    expect(after).toBe(before);
    expect(isMigrated(h)).toBe(true);
  });

  it("isMigrated is false for an empty db, an older db, and true for a migrated one", () => {
    const h = open(dbPathFromDataDir(tmp()));
    expect(isMigrated(h)).toBe(false);
    migrate(h);
    expect(isMigrated(h)).toBe(true);
    // Simulate a db one migration behind the application.
    const last = EXPECTED_MIGRATIONS[EXPECTED_MIGRATIONS.length - 1];
    if (last === undefined) throw new Error("no migrations");
    h.sqlite.prepare("DELETE FROM __drizzle_migrations WHERE created_at = ?").run(last.when);
    expect(isMigrated(h)).toBe(false);
    // A db with a migrations table but no rows is also unmigrated.
    h.sqlite.prepare("DELETE FROM __drizzle_migrations").run();
    expect(isMigrated(h)).toBe(false);
    // Table dropped entirely: never throws.
    h.sqlite.exec("DROP TABLE __drizzle_migrations");
    expect(isMigrated(h)).toBe(false);
  });

  it("nfl_state accepts only the single row id 1", () => {
    const h = open(dbPathFromDataDir(tmp()));
    migrate(h);
    const ins = (id: number): void => {
      h.sqlite
        .prepare(
          "INSERT INTO nfl_state (id, season, week, season_type, display_week, leg, fetched_at) VALUES (?, 2026, 1, 'regular', 1, 1, 'x')",
        )
        .run(id);
    };
    ins(1);
    expect(() => ins(2)).toThrow();
  });
});

describe("T1.3a openDb", () => {
  it("sets WAL, busy_timeout 5000, foreign_keys on, creating the parent directory", () => {
    const path = join(tmp(), "nested", "deeper", "sideline.sqlite");
    const h = open(path);
    expect(existsSync(path)).toBe(true);
    expect(h.sqlite.pragma("journal_mode", { simple: true })).toBe("wal");
    expect(h.sqlite.pragma("busy_timeout", { simple: true })).toBe(5000);
    expect(h.sqlite.pragma("foreign_keys", { simple: true })).toBe(1);
    expect(h.sqlite.pragma("synchronous", { simple: true })).toBe(1);
  });

  it("opens readonly without creating directories and rejects writes", () => {
    const path = dbPathFromDataDir(tmp());
    const w = open(path);
    migrate(w);
    const r = open(path, { readonly: true });
    expect(r.sqlite.pragma("busy_timeout", { simple: true })).toBe(5000);
    expect(isMigrated(r)).toBe(true);
    expect(() => r.sqlite.prepare("DELETE FROM app_settings").run()).toThrow();
    expect(() => openDb(join(tmp(), "nope", "x.sqlite"), { readonly: true })).toThrow();
  });

  it("dbPathFromDataDir appends sideline.sqlite", () => {
    expect(dbPathFromDataDir("/data")).toBe(join("/data", "sideline.sqlite"));
  });
});
