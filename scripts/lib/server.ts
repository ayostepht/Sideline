import { spawn, type ChildProcess } from "node:child_process";
import { closeSync, existsSync, mkdtempSync, openSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { createServer } from "node:net";
import path from "node:path";

/** Where `next build` leaves the standalone server (see apps/web/scripts/start-standalone.mjs). */
export function standaloneServerJs(root: string): string {
  return path.join(root, "apps/web/.next/standalone/apps/web/server.js");
}

export function standaloneBuildExists(root: string): boolean {
  return existsSync(standaloneServerJs(root));
}

/** Asks the OS for a free TCP port on the loopback interface. */
export function findFreePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const srv = createServer();
    srv.unref();
    srv.on("error", reject);
    srv.listen(0, "127.0.0.1", () => {
      const address = srv.address();
      const port = typeof address === "object" && address !== null ? address.port : undefined;
      srv.close(() => {
        if (port === undefined) reject(new Error("could not determine a free port"));
        else resolve(port);
      });
    });
  });
}

/** True when nothing is listening on the given loopback port. */
export function isPortFree(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const srv = createServer();
    srv.unref();
    srv.on("error", () => resolve(false));
    srv.listen(port, "127.0.0.1", () => {
      srv.close(() => resolve(true));
    });
  });
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export interface WaitResult {
  ok: boolean;
  elapsedMs: number;
  /** Last HTTP status seen, if any request got a response. */
  status?: number;
}

/** Polls a URL until it answers with the expected status, or the timeout passes. */
export async function waitForStatus(
  url: string,
  options: {
    timeoutMs: number;
    intervalMs?: number;
    expectStatus?: number;
    /** Overrides expectStatus: any status for which this returns true counts as ready. */
    accept?: (status: number) => boolean;
  },
): Promise<WaitResult> {
  const expect = options.expectStatus ?? 200;
  const accept = options.accept ?? ((code: number) => code === expect);
  const interval = options.intervalMs ?? 250;
  const started = Date.now();
  let status: number | undefined;
  while (Date.now() - started < options.timeoutMs) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(2000), redirect: "manual" });
      status = res.status;
      await res.arrayBuffer();
      if (accept(res.status)) return { ok: true, elapsedMs: Date.now() - started, status };
    } catch {
      // Not up yet; keep polling.
    }
    await sleep(interval);
  }
  return status === undefined
    ? { ok: false, elapsedMs: Date.now() - started }
    : { ok: false, elapsedMs: Date.now() - started, status };
}

function groupAlive(pgid: number): boolean {
  try {
    process.kill(-pgid, 0);
    return true;
  } catch {
    return false;
  }
}

/**
 * Stops a process group led by `pgid` (spawned with `detached: true`): SIGTERM first, then
 * SIGKILL to the whole group if anything is still alive after `graceMs`. This also reaches
 * grandchildren such as the real server.js behind a wrapper script.
 */
export async function killProcessGroup(pgid: number, graceMs = 5000): Promise<void> {
  try {
    process.kill(-pgid, "SIGTERM");
  } catch {
    return; // group already gone
  }
  const deadline = Date.now() + graceMs;
  while (groupAlive(pgid) && Date.now() < deadline) await sleep(50);
  if (groupAlive(pgid)) {
    try {
      process.kill(-pgid, "SIGKILL");
    } catch {
      // Gone in the meantime.
    }
    while (groupAlive(pgid)) await sleep(20);
  }
}

/** Thrown when the server never answers; carries the last lines of its output. */
export class ServerStartError extends Error {
  constructor(
    message: string,
    readonly tail: string,
  ) {
    super(message);
    this.name = "ServerStartError";
  }
}

/** Last `lines` lines of a log file ("" when it cannot be read). */
export function tailLines(file: string, lines = 100): string {
  try {
    return readFileSync(file, "utf8").split("\n").slice(-lines).join("\n");
  } catch {
    return "";
  }
}

/** First line that looks like an error, else the first non-empty line. */
export function firstErrorLine(text: string): string | undefined {
  const all = text.split("\n").map((l) => l.trim());
  return (
    all.find((l) => /^(\w*Error\b|Error:)|cannot find|enoent|eaddrinuse/i.test(l)) ??
    all.find((l) => l)
  );
}

export interface RunningServer {
  baseUrl: string;
  stop(): Promise<void>;
}

/**
 * Starts the production standalone server (what Docker ships) on a free port and waits for
 * /api/health. Requires a prior `pnpm build`. Output goes to `logFile` when given.
 */
export async function startStandaloneServer(options: {
  root: string;
  logFile?: string;
  timeoutMs?: number;
  /** Writable data directory for the server. Defaults to a fresh temp dir removed on stop. */
  dataDir?: string;
}): Promise<RunningServer> {
  const { root } = options;
  if (!standaloneBuildExists(root)) {
    throw new Error(
      `Standalone build not found at ${standaloneServerJs(root)}. Run "pnpm build" first.`,
    );
  }
  const port = await findFreePort();
  // The app defaults DATA_DIR to /data, which does not exist or is not writable on dev machines.
  const ownDataDir = options.dataDir === undefined;
  const dataDir = options.dataDir ?? mkdtempSync(path.join(tmpdir(), "sideline-server-"));
  const logFd = options.logFile === undefined ? undefined : openSync(options.logFile, "a");
  const stdio: ["ignore", number | "ignore", number | "ignore"] =
    logFd === undefined ? ["ignore", "ignore", "ignore"] : ["ignore", logFd, logFd];
  const child: ChildProcess = spawn(
    process.execPath,
    [path.join(root, "apps/web/scripts/start-standalone.mjs")],
    {
      cwd: root,
      stdio,
      detached: true, // own process group, so stop() can kill the wrapper and server.js together
      env: {
        ...process.env,
        NODE_ENV: "production",
        PORT: String(port),
        HOSTNAME: "127.0.0.1",
        DATA_DIR: dataDir,
      },
    },
  );
  if (logFd !== undefined) closeSync(logFd);
  let exited = false;
  child.on("exit", () => {
    exited = true;
  });
  const pgid = child.pid;
  // Safety net for crashes and process.exit(): never leave the server running.
  const onExit = (): void => {
    if (pgid === undefined) return;
    try {
      process.kill(-pgid, "SIGKILL");
    } catch {
      // Already gone.
    }
  };
  process.once("exit", onExit);
  const baseUrl = `http://127.0.0.1:${port}`;
  const stop = async (): Promise<void> => {
    process.removeListener("exit", onExit);
    if (pgid === undefined) return;
    await killProcessGroup(pgid);
    if (ownDataDir) rmSync(dataDir, { recursive: true, force: true });
    // Wait for the OS to release the port so the next server (or a stray probe) cannot collide.
    const deadline = Date.now() + 10_000;
    while (!(await isPortFree(port)) && Date.now() < deadline) await sleep(100);
  };
  const ready = await waitForStatus(`${baseUrl}/api/health`, {
    timeoutMs: options.timeoutMs ?? 60_000,
  });
  if (!ready.ok || exited) {
    await stop();
    const tail = options.logFile === undefined ? "" : tailLines(options.logFile);
    const first = firstErrorLine(tail);
    throw new ServerStartError(
      `Standalone server did not become healthy at ${baseUrl}/api/health` +
        (first === undefined ? "" : ` (server said: ${first})`),
      tail,
    );
  }
  return { baseUrl, stop };
}
