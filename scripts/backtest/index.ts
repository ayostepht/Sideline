#!/usr/bin/env node
/**
 * MATCH-3 CLI (`pnpm backtest`): runs {@link runBacktest} against the already synced database at
 * `DATA_DIR` and writes a report to `docs/backtests/{today's date}.md`. Read-only; makes no
 * network calls.
 *
 * Usage: backtest [--league-id=<id> | --league-id <id>]
 *
 * `--league-id` defaults to `DEFAULT_LEAGUE_ID` from the environment when omitted. The weeks
 * tested are whatever {@link discoverAvailableWeeks} finds already synced into the database
 * (weeks with both a `player_week_stats` row and a `player_week_projections` row); `runBacktest`
 * applies the regular-season / `MIN_BACKTEST_WEEK` eligibility filter on top of that.
 *
 * This is a report, not a pass/fail gate: a config or database error exits 2 (usage/configuration
 * error, matching `scripts/validate-scoring`'s convention); a successful run always exits 0,
 * regardless of whether the decision is `"ship"` or `"raw_only"`.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { dbPathFromDataDir, openDb } from "../../packages/db/src/index.js";
import { loadConfig, ConfigError } from "../../packages/shared/src/index.js";
import { discoverAvailableWeeks, runBacktest } from "./backtest.js";
import { renderReport } from "./report.js";

interface ParsedArgs {
  leagueId?: string;
}

type ArgsResult = { ok: true; args: ParsedArgs } | { ok: false; message: string };

export function parseArgs(argv: readonly string[]): ArgsResult {
  const args: ParsedArgs = {};
  for (let i = 0; i < argv.length; i += 1) {
    const raw = argv[i];
    if (raw === undefined) continue;
    if (raw.startsWith("--league-id=")) {
      args.leagueId = raw.slice("--league-id=".length);
    } else if (raw === "--league-id") {
      const value = argv[i + 1];
      if (value === undefined) return { ok: false, message: "--league-id needs a value" };
      args.leagueId = value;
      i += 1;
    } else {
      return { ok: false, message: `unknown argument: ${raw}` };
    }
  }
  return { ok: true, args };
}

export interface RunDeps {
  env: Record<string, string | undefined>;
  argv: readonly string[];
  out: (line: string) => void;
  /** ISO date (YYYY-MM-DD) used for the saved report's filename. Defaults to the system clock;
   * tests inject a fixed value to stay deterministic (the CLI wrapper is not pure core code). */
  today?: () => string;
}

function defaultToday(): string {
  return new Date().toISOString().slice(0, 10);
}

export function run(deps: RunDeps): number {
  const parsed = parseArgs(deps.argv);
  if (!parsed.ok) {
    deps.out(`backtest: ${parsed.message}`);
    return 2;
  }

  let config;
  try {
    config = loadConfig(deps.env);
  } catch (e) {
    deps.out(e instanceof ConfigError ? e.message : String(e));
    return 2;
  }

  const leagueId = parsed.args.leagueId ?? config.defaultLeagueId ?? undefined;
  if (leagueId === undefined) {
    deps.out("backtest: no league id; pass --league-id or set DEFAULT_LEAGUE_ID");
    return 2;
  }

  const dbPath = dbPathFromDataDir(config.dataDir);
  let handle;
  try {
    handle = openDb(dbPath, { readonly: true });
  } catch (e) {
    deps.out(`backtest: could not open database at ${dbPath}: ${String(e)}`);
    return 2;
  }

  try {
    const weeks = discoverAvailableWeeks(handle);
    const report = runBacktest(handle, leagueId, { weeks });
    const rendered = renderReport(report);
    deps.out(rendered);

    const today = (deps.today ?? defaultToday)();
    const outDir = path.resolve(import.meta.dirname, "../../docs/backtests");
    mkdirSync(outDir, { recursive: true });
    const outPath = path.join(outDir, `${today}.md`);
    writeFileSync(outPath, rendered, "utf8");
    deps.out(`\nSaved report to ${outPath}`);

    return 0;
  } catch (e) {
    deps.out(`backtest: ${e instanceof Error ? e.message : String(e)}`);
    return 2;
  } finally {
    handle.sqlite.close();
  }
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const code = run({ env: process.env, argv: process.argv.slice(2), out: (l) => console.log(l) });
  process.exit(code);
}
