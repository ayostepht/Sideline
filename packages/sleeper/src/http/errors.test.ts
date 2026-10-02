import { describe, expect, it } from "vitest";
import {
  SleeperError,
  SleeperHttpError,
  SleeperNetworkError,
  SleeperSchemaError,
  SleeperTimeoutError,
} from "./errors.js";

describe("errors", () => {
  it("have stable codes, names and extend SleeperError", () => {
    const errs = [
      new SleeperHttpError(404, "u", 1),
      new SleeperTimeoutError("u", 10, 1),
      new SleeperNetworkError("u", 1, new Error("x")),
      new SleeperSchemaError("/p", [{ path: "a.b", message: "bad" }]),
    ];
    expect(errs.map((e) => e.code)).toEqual([
      "SLEEPER_HTTP",
      "SLEEPER_TIMEOUT",
      "SLEEPER_NETWORK",
      "SLEEPER_SCHEMA",
    ]);
    for (const e of errs) expect(e).toBeInstanceOf(SleeperError);
    expect(errs[0]?.name).toBe("SleeperHttpError");
    expect(errs[3]?.message).toContain("a.b: bad");
    expect((errs[2] as SleeperNetworkError).cause).toBeInstanceOf(Error);
  });
});
