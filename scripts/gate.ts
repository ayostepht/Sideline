import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { CHECKS, flagSkipReason } from "./gate/checks.js";
import { GateContext, type Outcome } from "./gate/context.js";
import { FlagError, GATE_HELP, parseGateArgs, selectChecks } from "./gate/flags.js";
import {
  disallowedSkips,
  gateExitCode,
  parsePreviousReport,
  summarize,
  type CheckResult,
  type GateReport,
} from "./gate/report.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function git(args: string[]): string {
  try {
    return execFileSync("git", args, { cwd: root, encoding: "utf8" }).trim();
  } catch {
    return "unknown";
  }
}

function fmtSeconds(ms: number): string {
  return `${(ms / 1000).toFixed(1)}s`;
}

async function main(): Promise<number> {
  let flags;
  let selected;
  try {
    flags = parseGateArgs(process.argv.slice(2));
    if (flags.help) {
      process.stdout.write(GATE_HELP);
      return 0;
    }
    selected = selectChecks(CHECKS, flags.only);
  } catch (err) {
    if (err instanceof FlagError) {
      process.stderr.write(`gate: ${err.message}\n`);
      return 1;
    }
    throw err;
  }

  const latestFile = path.join(root, "docs/gates/latest.json");
  let previousText = "";
  try {
    previousText = readFileSync(latestFile, "utf8");
  } catch {
    // First run: no previous report, so there is no lint-warning baseline yet.
  }
  const previous = parsePreviousReport(previousText);
  const ctx = new GateContext(root, flags, previous);
  rmSync(ctx.logsDir, { recursive: true, force: true });
  mkdirSync(ctx.logsDir, { recursive: true });

  const startedAt = new Date();
  const gitCommit = git(["rev-parse", "HEAD"]);
  const gitBranch = git(["rev-parse", "--abbrev-ref", "HEAD"]);
  const dirty = git(["status", "--porcelain"]) !== "";

  const results: CheckResult[] = [];
  try {
    for (const check of selected) {
      const logFile = path.relative(root, ctx.logFile(check.id));
      const started = Date.now();
      const skipReason = flagSkipReason(check, flags);
      let outcome: Outcome;
      if (skipReason !== undefined) {
        outcome = { status: "SKIPPED", reason: skipReason };
      } else {
        process.stdout.write(`[${check.id}] ${check.name} ...\n`);
        try {
          outcome = await check.run(ctx);
        } catch (err) {
          outcome = {
            status: "FAIL",
            reason: `gate error: ${err instanceof Error ? err.message : String(err)}`,
          };
        }
      }
      const result: CheckResult = {
        id: check.id,
        name: check.name,
        status: outcome.status,
        durationMs: Date.now() - started,
        logFile,
        ...(outcome.reason === undefined ? {} : { reason: outcome.reason }),
        ...(outcome.metrics === undefined ? {} : { metrics: outcome.metrics }),
      };
      results.push(result);
      const why = result.reason === undefined ? "" : ` (${result.reason})`;
      process.stdout.write(
        `[${check.id}] ${result.status} in ${fmtSeconds(result.durationMs)}${why}\n`,
      );
    }
  } finally {
    await ctx.stopServer();
  }

  const summary = summarize(results);
  const baselineWarnings = ctx.newEslintBaseline ?? previous.eslintWarnings;
  const report: GateReport = {
    startedAt: startedAt.toISOString(),
    finishedAt: new Date().toISOString(),
    gitCommit,
    gitBranch,
    dirty,
    partial: flags.only !== undefined,
    baselines: baselineWarnings === undefined ? {} : { eslintWarnings: baselineWarnings },
    checks: results,
    summary,
  };
  // A partial (--only) run must not overwrite the full report other tooling relies on.
  const outFile =
    flags.only === undefined ? latestFile : path.join(root, "docs/gates/latest.partial.json");
  const outName = path.relative(root, outFile);
  mkdirSync(path.dirname(outFile), { recursive: true });
  writeFileSync(outFile, `${JSON.stringify(report, null, 2)}\n`);

  const idWidth = Math.max(...results.map((r) => r.id.length), 2);
  process.stdout.write("\nGate summary\n");
  for (const r of results) {
    const why = r.reason === undefined ? "" : `  ${r.reason}`;
    process.stdout.write(
      `  ${r.id.padEnd(idWidth)}  ${r.status.padEnd(7)}  ${fmtSeconds(r.durationMs).padStart(7)}${why}\n`,
    );
  }
  process.stdout.write(
    `\n${summary.pass} passed, ${summary.fail} failed, ${summary.skipped} skipped. Report: ${outName}\n`,
  );
  if (flags.strict) {
    const blocked = disallowedSkips(results, flags.allowSkip);
    if (blocked.length > 0 && summary.fail === 0) {
      process.stdout.write(
        `--strict: skipped check(s) not allowed: ${blocked.join(", ")}. Fix them or pass --allow-skip=${blocked.join(",")}.\n`,
      );
    }
    return gateExitCode(summary, { checks: results, allowSkip: flags.allowSkip });
  }
  return gateExitCode(summary);
}

main().then(
  (code) => process.exit(code),
  (err: unknown) => {
    process.stderr.write(
      `gate crashed: ${err instanceof Error ? (err.stack ?? err.message) : String(err)}\n`,
    );
    process.exit(1);
  },
);
