import { describe, expect, it } from "vitest";
import {
  createRng,
  sampleNormal,
  sampleTruncatedNormalAtZero,
  MAX_TRUNCATED_NORMAL_ATTEMPTS,
} from "./rng.js";

function drawSequence(seed: number, count: number): number[] {
  const next = createRng(seed);
  return Array.from({ length: count }, () => next());
}

describe("createRng", () => {
  it("produces an identical sequence for the same seed", () => {
    expect(drawSequence(42, 20)).toEqual(drawSequence(42, 20));
  });

  it("produces a different sequence for a different seed", () => {
    expect(drawSequence(1, 20)).not.toEqual(drawSequence(2, 20));
  });

  it("returns uniform floats in [0, 1)", () => {
    const values = drawSequence(7, 5000);
    for (const v of values) {
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });
});

describe("sampleNormal", () => {
  it("is deterministic for a given seed/mean/sd", () => {
    const a = sampleNormal(createRng(99), 10, 3);
    const b = sampleNormal(createRng(99), 10, 3);
    expect(a).toBe(b);
  });

  it("returns the mean exactly, without consuming randomness, when sd <= 0", () => {
    const next = (): never => {
      throw new Error("sd <= 0 must not call next()");
    };
    expect(sampleNormal(next, 7.5, 0)).toBe(7.5);
    expect(sampleNormal(next, 7.5, -1)).toBe(7.5);
  });

  it("approximates the input mean over many samples", () => {
    const next = createRng(123);
    const n = 20000;
    let sum = 0;
    for (let i = 0; i < n; i++) {
      sum += sampleNormal(next, 50, 10);
    }
    expect(sum / n).toBeCloseTo(50, 0); // within ~0.5 of 50 given n=20000, sd=10
  });
});

describe("sampleTruncatedNormalAtZero", () => {
  it("never returns a negative value", () => {
    const next = createRng(321);
    for (let i = 0; i < 5000; i++) {
      // mean near 0 relative to sd maximizes how often truncation would matter
      const sample = sampleTruncatedNormalAtZero(next, 2, 5);
      expect(sample).toBeGreaterThanOrEqual(0);
    }
  });

  it("approximates the input mean when truncation rarely binds (mean >> sd)", () => {
    const next = createRng(55);
    const n = 20000;
    let sum = 0;
    for (let i = 0; i < n; i++) {
      sum += sampleTruncatedNormalAtZero(next, 100, 10);
    }
    expect(sum / n).toBeCloseTo(100, 0);
  });

  it("returns max(0, mean) deterministically when sd <= 0", () => {
    expect(sampleTruncatedNormalAtZero(createRng(1), 12, 0)).toBe(12);
    expect(sampleTruncatedNormalAtZero(createRng(1), -3, 0)).toBe(0);
  });

  it("falls back to 0 after exhausting attempts for a pathological mean/sd", () => {
    // mean = -100, sd = 1: a non-negative draw requires z >= 100, astronomically unlikely, so
    // every one of MAX_TRUNCATED_NORMAL_ATTEMPTS draws will be rejected and the fallback fires.
    const next = createRng(8);
    const sample = sampleTruncatedNormalAtZero(next, -100, 1);
    expect(sample).toBe(0);
    expect(MAX_TRUNCATED_NORMAL_ATTEMPTS).toBeGreaterThan(0);
  });
});
