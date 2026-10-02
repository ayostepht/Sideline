import { mkdtempSync, mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { GateContext } from "./context.js";
import { parseGateArgs } from "./flags.js";
import { gateExitCode, summarize, type CheckResult } from "./report.js";
import { mapExit } from "./status.js";

describe("mapExit", () => {
  it("maps exit 0 to PASS", () => {
    expect(mapExit(0, "")).toEqual({ status: "PASS" });
  });

  it("maps exit 2 with the stub marker to SKIPPED", () => {
    expect(mapExit(2, "gate: not implemented until T1.7")).toEqual({
      status: "SKIPPED",
      reason: "not implemented (stub)",
    });
  });

  it("keeps exit 2 without the stub marker a FAIL (eslint exits 2 on fatal errors)", () => {
    expect(mapExit(2, "Oops! Something went wrong")).toEqual({
      status: "FAIL",
      reason: "exit code 2",
    });
  });

  it("maps any other non-zero exit to FAIL", () => {
    expect(mapExit(1, "")).toEqual({ status: "FAIL", reason: "exit code 1" });
    expect(mapExit(127, "")).toEqual({ status: "FAIL", reason: "exit code 127" });
  });

  it("fails on a signal or a timeout, never PASS", () => {
    expect(mapExit(null, "").status).toBe("FAIL");
    expect(mapExit(0, "", { timedOut: true })).toEqual({ status: "FAIL", reason: "timed out" });
  });
});

describe("GateContext.step with real child processes", () => {
  const roots: string[] = [];
  afterEach(() => {
    for (const r of roots.splice(0)) rmSync(r, { recursive: true, force: true });
  });
  function makeContext(): GateContext {
    const root = mkdtempSync(path.join(tmpdir(), "gate-test-"));
    roots.push(root);
    const ctx = new GateContext(root, parseGateArgs([]), {});
    mkdirSync(ctx.logsDir, { recursive: true });
    return ctx;
  }
  const node = process.execPath;

  it("reports a planted failing command as FAIL", async () => {
    const ctx = makeContext();
    const step = await ctx.step("PLANTED", node, ["-e", "console.error('boom'); process.exit(1)"]);
    expect(step.mapped.status).toBe("FAIL");
  });

  it("reports a passing command as PASS and a stub as SKIPPED", async () => {
    const ctx = makeContext();
    const ok = await ctx.step("OK", node, ["-e", "process.exit(0)"]);
    expect(ok.mapped.status).toBe("PASS");
    const stub = await ctx.step("STUB", node, [
      "-e",
      "console.error('x: not implemented until T9.9'); process.exit(2)",
    ]);
    expect(stub.mapped).toEqual({ status: "SKIPPED", reason: "not implemented (stub)" });
  });

  it("reports a missing tool as SKIPPED with a reason, not PASS", async () => {
    const ctx = makeContext();
    const step = await ctx.step("MISSING", "definitely-not-a-real-tool-xyz", []);
    expect(step.mapped.status).toBe("SKIPPED");
    expect(step.mapped.reason).toContain("could not start");
  });
});

describe("gateExitCode", () => {
  const check = (status: CheckResult["status"]): CheckResult => ({
    id: "X",
    name: "x",
    status,
    durationMs: 1,
    logFile: "x.log",
  });

  it("is 0 with passes and skips only", () => {
    expect(gateExitCode(summarize([check("PASS"), check("SKIPPED")]))).toBe(0);
  });

  it("under strict, fails on a skip unless it is allowed", () => {
    const checks = [
      { ...check("PASS"), id: "U1" },
      { ...check("SKIPPED"), id: "U2b" },
    ];
    const summary = summarize(checks);
    expect(gateExitCode(summary, { checks, allowSkip: [] })).toBe(1);
    expect(gateExitCode(summary, { checks, allowSkip: ["u2b"] })).toBe(0);
    expect(gateExitCode(summary, { checks, allowSkip: ["U2"] })).toBe(1);
    expect(gateExitCode(summary)).toBe(0);
  });

  it("is 1 as soon as one check fails", () => {
    const summary = summarize([check("PASS"), check("FAIL"), check("SKIPPED")]);
    expect(summary).toEqual({ pass: 1, fail: 1, skipped: 1 });
    expect(gateExitCode(summary)).toBe(1);
  });
});
