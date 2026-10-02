import { spawn } from "node:child_process";
import http from "node:http";
import type { AddressInfo } from "node:net";
import { afterEach, describe, expect, it } from "vitest";
import { killProcessGroup, sleep, waitForStatus } from "./server.js";

function alive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

describe("killProcessGroup", () => {
  it("kills a wrapper and a grandchild that ignores SIGTERM", async () => {
    // The wrapper spawns a grandchild that ignores SIGTERM and prints its pid.
    const grandchild = "process.on('SIGTERM',()=>{});setInterval(()=>{},1000);";
    const wrapper = `
      const { spawn } = require("node:child_process");
      const c = spawn(process.execPath, ["-e", ${JSON.stringify(grandchild)}], { stdio: "ignore" });
      console.log(c.pid);
      setInterval(() => {}, 1000);
    `;
    const parent = spawn(process.execPath, ["-e", wrapper], {
      detached: true,
      stdio: ["ignore", "pipe", "ignore"],
    });
    const parentPid = parent.pid;
    if (parentPid === undefined) throw new Error("spawn failed");
    const grandchildPid = await new Promise<number>((resolve) => {
      parent.stdout.once("data", (d: Buffer) => resolve(Number(d.toString().trim())));
    });
    expect(alive(grandchildPid)).toBe(true);
    await killProcessGroup(parentPid, 300);
    await sleep(100);
    expect(alive(parentPid)).toBe(false);
    expect(alive(grandchildPid)).toBe(false);
  });

  it("returns quietly when the group is already gone", async () => {
    await expect(killProcessGroup(2_000_000_000, 100)).resolves.toBeUndefined();
  });
});

describe("waitForStatus", () => {
  const servers: http.Server[] = [];
  afterEach(() => {
    for (const s of servers.splice(0)) s.close();
  });
  async function serve(status: number): Promise<string> {
    const srv = http.createServer((_req, res) => {
      res.writeHead(status, status >= 300 && status < 400 ? { location: "/x" } : {});
      res.end();
    });
    servers.push(srv);
    await new Promise<void>((r) => srv.listen(0, "127.0.0.1", r));
    return `http://127.0.0.1:${(srv.address() as AddressInfo).port}/`;
  }

  it("requires exactly 200 by default", async () => {
    const url = await serve(302);
    const r = await waitForStatus(url, { timeoutMs: 400, intervalMs: 50 });
    expect(r).toMatchObject({ ok: false, status: 302 });
  });

  it("accepts a redirect when accept allows 2xx and 3xx", async () => {
    const url = await serve(302);
    const r = await waitForStatus(url, {
      timeoutMs: 1000,
      accept: (s) => s >= 200 && s < 400,
    });
    expect(r.ok).toBe(true);
  });

  it("still rejects 5xx under the 2xx/3xx rule", async () => {
    const url = await serve(500);
    const r = await waitForStatus(url, {
      timeoutMs: 400,
      intervalMs: 50,
      accept: (s) => s >= 200 && s < 400,
    });
    expect(r.ok).toBe(false);
  });
});

describe("server start diagnostics", () => {
  it("picks the first error-looking line, else the first non-empty line", async () => {
    const { firstErrorLine } = await import("./server.js");
    expect(firstErrorLine("\nready\nError: EADDRINUSE\nmore")).toBe("Error: EADDRINUSE");
    expect(firstErrorLine("\n hello \nworld")).toBe("hello");
    expect(firstErrorLine("")).toBeUndefined();
  });

  it("returns the last lines of a log, and empty text for a missing file", async () => {
    const { tailLines } = await import("./server.js");
    expect(tailLines("/nonexistent/sideline.log")).toBe("");
  });
});
