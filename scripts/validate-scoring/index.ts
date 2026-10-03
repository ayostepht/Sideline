#!/usr/bin/env node
/**
 * SCORE-2 CLI (`pnpm run validate:scoring`): runs {@link validateScoring} against the already
 * synced database at `DATA_DIR` and prints a report. Read-only; makes no network calls.
 *
 * Usage: validate-scoring [--league-id=<id> | --league-id <id>]
 *                          [--through-week=<n> | --through-week <n>]
 *
 * `--league-id` defaults to `DEFAULT_LEAGUE_ID` from the environment when omitted.
 * `--through-week` overrides the "current week minus one" default (see validate.ts); pass it for
 * fixture or backfilled databases where `nfl_state` does not reflect the league's own season.
 *
 * Exit codes: 0 match rate >= 99%, 1 match rate < 99%, 2 usage or configuration error.
 */
import { pathToFileURL } from "node:url";
import { dbPathFromDataDir, openDb } from "../../packages/db/src/index.js";
import { loadConfig, ConfigError } from "../../packages/shared/src/index.js";
import { renderReport } from "./report.js";
import { validateScoring } from "./validate.js";

/** Below this match rate the CLI exits 1 (SCORE-2 is meant to catch real regressions). */
export const MIN_MATCH_RATE = 0.99;

interface ParsedArgs {
  leagueId?: string;
  throughWeek?: number;
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
    } else if (raw.startsWith("--through-week=")) {
      const value = raw.slice("--through-week=".length);
      const n = Number(value);
      if (!Number.isInteger(n) || n < 1) {
        return { ok: false, message: `--through-week must be a positive integer, got "${value}"` };
      }
      args.throughWeek = n;
    } else if (raw === "--through-week") {
      const value = argv[i + 1];
      const n = value === undefined ? Number.NaN : Number(value);
      if (!Number.isInteger(n) || n < 1) {
        return {
          ok: false,
          message: `--through-week must be a positive integer, got "${value ?? ""}"`,
        };
      }
      args.throughWeek = n;
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
}

export function run(deps: RunDeps): number {
  const parsed = parseArgs(deps.argv);
  if (!parsed.ok) {
    deps.out(`validate-scoring: ${parsed.message}`);
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
    deps.out("validate-scoring: no league id; pass --league-id or set DEFAULT_LEAGUE_ID");
    return 2;
  }

  const dbPath = dbPathFromDataDir(config.dataDir);
  let handle;
  try {
    handle = openDb(dbPath, { readonly: true });
  } catch (e) {
    deps.out(`validate-scoring: could not open database at ${dbPath}: ${String(e)}`);
    return 2;
  }

  try {
    const options =
      parsed.args.throughWeek === undefined ? {} : { throughWeek: parsed.args.throughWeek };
    const report = validateScoring(handle, leagueId, options);
    deps.out(renderReport(report));
    return report.matchRate >= MIN_MATCH_RATE ? 0 : 1;
  } catch (e) {
    deps.out(`validate-scoring: ${e instanceof Error ? e.message : String(e)}`);
    return 2;
  } finally {
    handle.sqlite.close();
  }
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const code = run({ env: process.env, argv: process.argv.slice(2), out: (l) => console.log(l) });
  process.exit(code);
}
