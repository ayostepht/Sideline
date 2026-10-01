import { spawn, type ChildProcess } from "node:child_process";
import { existsSync, openSync, closeSync } from "node:fs";
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
  options: { timeoutMs: number; intervalMs?: number; expectStatus?: number },
): Promise<WaitResult> {
  const expect = options.expectStatus ?? 200;
  const interval = options.intervalMs ?? 250;
  const started = Date.now();
  let status: number | undefined;
  while (Date.now() - started < options.timeoutMs) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(2000), redirect: "manual" });
      status = res.status;
      await res.arrayBuffer();
      if (res.status === expect) return { ok: true, elapsedMs: Date.now() - started, status };
    } catch {
      // Not up yet; keep polling.
    }
    await sleep(interval);
  }
  return status === undefined
    ? { ok: false, elapsedMs: Date.now() - started }
    : { ok: false, elapsedMs: Date.now() - started, status };
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
}): Promise<RunningServer> {
  const { root } = options;
  if (!standaloneBuildExists(root)) {
    throw new Error(
      `Standalone build not found at ${standaloneServerJs(root)}. Run "pnpm build" first.`,
    );
  }
  const port = await findFreePort();
  const logFd = options.logFile === undefined ? undefined : openSync(options.logFile, "a");
  const stdio: ["ignore", number | "ignore", number | "ignore"] =
    logFd === undefined ? ["ignore", "ignore", "ignore"] : ["ignore", logFd, logFd];
  const child: ChildProcess = spawn(
    process.execPath,
    [path.join(root, "apps/web/scripts/start-standalone.mjs")],
    {
      cwd: root,
      stdio,
      env: { ...process.env, NODE_ENV: "production", PORT: String(port), HOSTNAME: "127.0.0.1" },
    },
  );
  if (logFd !== undefined) closeSync(logFd);
  let exited = false;
  child.on("exit", () => {
    exited = true;
  });
  const baseUrl = `http://127.0.0.1:${port}`;
  const stop = async (): Promise<void> => {
    if (exited) return;
    const done = new Promise<void>((resolve) => child.once("exit", () => resolve()));
    child.kill("SIGTERM");
    const timer = setTimeout(() => child.kill("SIGKILL"), 5000);
    await done;
    clearTimeout(timer);
  };
  const ready = await waitForStatus(`${baseUrl}/api/health`, {
    timeoutMs: options.timeoutMs ?? 60_000,
  });
  if (!ready.ok || exited) {
    await stop();
    throw new Error(`Standalone server did not become healthy at ${baseUrl}/api/health`);
  }
  return { baseUrl, stop };
}
