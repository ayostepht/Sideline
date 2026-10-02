import path from "node:path";
import { appendFileSync } from "node:fs";
import { ServerStartError, startStandaloneServer, type RunningServer } from "../lib/server.js";
import { runLogged, readTail, type ExecResult } from "./exec.js";
import type { GateFlags } from "./flags.js";
import type { PreviousReport } from "./report.js";
import { mapExit, type StatusResult } from "./status.js";

/** What one check returns; the runner adds id, name, timing and the log path. */
export interface Outcome extends StatusResult {
  metrics?: Record<string, unknown>;
}

export interface Step {
  exec: ExecResult;
  mapped: StatusResult;
}

export class GateContext {
  readonly gateDir: string;
  readonly logsDir: string;
  build: "unknown" | "ok" | "failed" = "unknown";
  server: RunningServer | null = null;
  /** Set by U1 when it passes, so the report can carry the new lint-warning baseline forward. */
  newEslintBaseline: number | undefined;

  constructor(
    readonly root: string,
    readonly flags: GateFlags,
    readonly previous: PreviousReport,
  ) {
    this.gateDir = path.join(root, ".gate");
    this.logsDir = path.join(this.gateDir, "logs");
  }

  logFile(id: string): string {
    return path.join(this.logsDir, `${id}.log`);
  }

  /** Runs a command for a check, streaming output to that check's log. */
  async step(
    id: string,
    command: string,
    args: readonly string[],
    options: { env?: Record<string, string | undefined>; timeoutMs?: number } = {},
  ): Promise<Step> {
    const logFile = this.logFile(id);
    const exec = await runLogged(command, args, {
      cwd: this.root,
      logFile,
      timeoutMs: options.timeoutMs ?? 20 * 60_000,
      ...(options.env === undefined ? {} : { env: options.env }),
    });
    if (exec.spawnError !== undefined) {
      return {
        exec,
        mapped: { status: "SKIPPED", reason: `could not start ${command}: ${exec.spawnError}` },
      };
    }
    return { exec, mapped: mapExit(exec.code, readTail(logFile), { timedOut: exec.timedOut }) };
  }

  /** Builds the app unless U3a already did so in this run. Returns a failure reason or undefined. */
  async ensureBuild(id: string): Promise<string | undefined> {
    if (this.build === "ok") return undefined;
    if (this.build === "failed") return "the production build failed (see U3a)";
    const step = await this.step(id, "pnpm", ["build"]);
    this.build = step.mapped.status === "PASS" ? "ok" : "failed";
    return this.build === "ok"
      ? undefined
      : `pnpm build failed (${step.mapped.reason ?? "unknown"})`;
  }

  /** Starts (once) the standalone server shared by the e2e and a11y checks. */
  async ensureServer(id: string): Promise<RunningServer> {
    if (this.server !== null) return this.server;
    try {
      this.server = await startStandaloneServer({
        root: this.root,
        logFile: this.logFile("server"),
      });
    } catch (err) {
      if (err instanceof ServerStartError) {
        appendFileSync(
          this.logFile(id),
          `\n${err.message}\nserver output (last 100 lines):\n${err.tail}\n`,
        );
      }
      throw err;
    }
    return this.server;
  }

  async stopServer(): Promise<void> {
    if (this.server === null) return;
    const server = this.server;
    this.server = null;
    await server.stop();
  }
}
