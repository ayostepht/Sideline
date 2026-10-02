import { describe, expect, it } from "vitest";
import { sortKeysDeep, stringifyKeyed, stringifyRows, stringifyStable } from "./format.js";

describe("format", () => {
  it("sorts keys recursively and uses 2-space indent with a trailing newline", () => {
    expect(stringifyStable({ b: 1, a: { d: [1, { z: 1, y: 2 }], c: null } })).toBe(
      `{\n  "a": {\n    "c": null,\n    "d": [\n      1,\n      {\n        "y": 2,\n        "z": 1\n      }\n    ]\n  },\n  "b": 1\n}\n`,
    );
  });

  it("is stable regardless of input key order", () => {
    expect(stringifyStable({ a: 1, b: 2 })).toBe(stringifyStable({ b: 2, a: 1 }));
    expect(sortKeysDeep([{ b: 1, a: 2 }])).toEqual([{ a: 2, b: 1 }]);
  });

  it("writes one row per line for big collections", () => {
    expect(stringifyRows([{ b: 1, a: 2 }, { a: 3 }])).toBe(`[\n  {"a":2,"b":1},\n  {"a":3}\n]\n`);
    expect(stringifyRows([])).toBe("[]\n");
    expect(stringifyKeyed({ "10": { b: 1, a: 1 }, ATL: { x: 1 } })).toBe(
      `{\n  "10": {"a":1,"b":1},\n  "ATL": {"x":1}\n}\n`,
    );
    expect(stringifyKeyed({})).toBe("{}\n");
  });
});
