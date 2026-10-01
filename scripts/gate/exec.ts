import { spawn } from "node:child_process";
import { appendFileSync, closeSync, openSync, readFileSync, statSync } from "node:fs";

export interface ExecResult {
  code: number | null;
  timedOut: boolean;
  durationMs: number;
  /** Set when the process could not be started at all (for example the tool is not installed). */
  spawnError?: string;
}

export interface ExecOptions {
  cwd: string;
  logFile: string;
  env?: Record<string, string | undefined>;
  timeoutMs?: number;
}

/** Runs a command with stdout and stderr streamed into `logFile` (appended). */
export function runLogged(
  command: string,
  args: readonly string[],
  options: ExecOptions,
): Promise<ExecResult> {
  appendFileSync(options.logFile, `\n$ ${[command, ...args].join(" ")}\n`);
  const fd = openSync(options.logFile, "a");
  const started = Date.now();
  return new Promise((resolve) => {
    let timedOut = false;
    let settled = false;
    const finish = (result: Omit<ExecResult, "durationMs">): void => {
      if (settled) return;
      settled = true;
      closeSync(fd);
      resolve({ ...result, durationMs: Date.now() - started });
    };
    const child = spawn(command, [...args], {
      cwd: options.cwd,
      stdio: ["ignore", fd, fd],
      env: { ...process.env, ...options.env },
    });
    const timer =
      options.timeoutMs === undefined
        ? undefined
        : setTimeout(() => {
            timedOut = true;
            child.kill("SIGTERM");
            setTimeout(() => child.kill("SIGKILL"), 5000).unref();
          }, options.timeoutMs);
    child.on("error", (err) => {
      if (timer !== undefined) clearTimeout(timer);
      appendFileSync(options.logFile, `failed to start: ${err.message}\n`);
      finish({ code: null, timedOut: false, spawnError: err.message });
    });
    child.on("close", (code) => {
      if (timer !== undefined) clearTimeout(timer);
      finish({ code, timedOut });
    });
  });
}

/** Runs a command and captures stdout (also copied to the log). For short queries only. */
export function runCapture(
  command: string,
  args: readonly string[],
  options: { cwd: string; logFile: string; timeoutMs?: number },
): Promise<{ code: number | null; stdout: string; stderr: string }> {
  appendFileSync(options.logFile, `\n$ ${[command, ...args].join(" ")}\n`);
  return new Promise((resolve) => {
    const child = spawn(command, [...args], {
      cwd: options.cwd,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => child.kill("SIGKILL"), options.timeoutMs ?? 60_000);
    child.stdout.on("data", (d: Buffer) => (stdout += d.toString()));
    child.stderr.on("data", (d: Buffer) => (stderr += d.toString()));
    const done = (code: number | null): void => {
      clearTimeout(timer);
      appendFileSync(options.logFile, `${stdout}${stderr}`);
      resolve({ code, stdout, stderr });
    };
    child.on("error", (err) => {
      stderr += `failed to start: ${err.message}\n`;
      done(null);
    });
    child.on("close", done);
  });
}

/** Last `bytes` bytes of a log file, to look for markers without loading huge logs. */
export function readTail(file: string, bytes = 4000): string {
  try {
    const size = statSync(file).size;
    const text = readFileSync(file, "utf8");
    return size <= bytes ? text : text.slice(-bytes);
  } catch {
    return "";
  }
}
