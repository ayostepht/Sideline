import { describe, expect, it } from "vitest";
import { CHECKS, flagSkipReason } from "./checks.js";
import {
  FlagError,
  GATE_HELP,
  matchesSelector,
  namedExactly,
  parseGateArgs,
  selectChecks,
} from "./flags.js";

describe("gate flags", () => {
  it("parses flags", () => {
    expect(parseGateArgs(["--only=U1,u3", "--skip-docker", "--amd64", "--fast"])).toEqual({
      only: ["U1", "u3"],
      skipDocker: true,
      amd64: true,
      fast: true,
      strict: false,
      allowSkip: [],
      help: false,
    });
    expect(parseGateArgs([]).only).toBeUndefined();
  });

  it("parses --strict and --allow-skip", () => {
    const flags = parseGateArgs(["--strict", "--allow-skip=U2b, UI3"]);
    expect(flags.strict).toBe(true);
    expect(flags.allowSkip).toEqual(["U2b", "UI3"]);
    expect(() => parseGateArgs(["--allow-skip="])).toThrow(FlagError);
  });

  it("documents the new flags and the U3c rule in the help text", () => {
    for (const word of ["--strict", "--allow-skip", "--amd64", "linux/amd64", "U3c"])
      expect(GATE_HELP).toContain(word);
  });

  it("rejects unknown flags and empty --only", () => {
    expect(() => parseGateArgs(["--nope"])).toThrow(FlagError);
    expect(() => parseGateArgs(["--only="])).toThrow(FlagError);
  });

  it("matches ids exactly or by number prefix", () => {
    expect(matchesSelector("U3a", "U3")).toBe(true);
    expect(matchesSelector("U3a", "u3a")).toBe(true);
    expect(matchesSelector("U3a", "U3b")).toBe(false);
    expect(matchesSelector("UI1", "U")).toBe(false);
    expect(matchesSelector("U2a", "U2")).toBe(true);
  });

  it("selects checks and rejects unknown ids", () => {
    expect(selectChecks(CHECKS, ["U1", "U3"]).map((c) => c.id)).toEqual([
      "U1",
      "U3a",
      "U3b",
      "U3c",
    ]);
    expect(() => selectChecks(CHECKS, ["U9"])).toThrow(/unknown check id/);
    expect(namedExactly("U3c", ["U3c"])).toBe(true);
    expect(namedExactly("U3c", ["U3"])).toBe(false);
  });

  it("applies --fast, --skip-docker and the --amd64 requirement", () => {
    const base = { skipDocker: false, fast: false, amd64: false, only: undefined };
    const byId = (id: string) => {
      const found = CHECKS.find((c) => c.id === id);
      if (found === undefined) throw new Error(`no check ${id}`);
      return found;
    };
    expect(flagSkipReason(byId("U3c"), base)).toMatch(/--amd64/);
    expect(flagSkipReason(byId("U3c"), { ...base, amd64: true })).toBeUndefined();
    expect(flagSkipReason(byId("U3c"), { ...base, only: ["U3c"] })).toBeUndefined();
    expect(flagSkipReason(byId("U3b"), { ...base, skipDocker: true })).toBe("--skip-docker");
    for (const id of ["UI1", "UI2", "UI3", "U3b"]) {
      expect(flagSkipReason(byId(id), { ...base, fast: true })).toBe("--fast");
    }
    expect(flagSkipReason(byId("U1"), { ...base, fast: true })).toBeUndefined();
  });
});
