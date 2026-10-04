/**
 * Seeded pseudo-random number generation, shared by every `packages/core` module that needs
 * Monte Carlo draws (SIM-1, PLAN 5.7; also reused by T5.3's playoff-odds simulation, LEAGUE-5).
 *
 * `packages/core` is pure (CLAUDE.md section 8): no `Math.random()` anywhere. Every simulation
 * takes a numeric `seed` from its caller and threads a single `next: () => number` generator
 * through its hot loop, so identical inputs always produce identical outputs.
 */

/**
 * mulberry32: a small, fast, well-distributed 32-bit PRNG. Chosen over `Math.random()` (not
 * seedable) and over heavier generators (xoshiro256, PCG) because a single 32-bit state word is
 * enough entropy for fantasy-score Monte Carlo (we are not doing cryptography) and it is cheap
 * enough per call to not dominate a tight per-iteration loop (SIM-3's 300ms budget).
 *
 * Returns a function producing uniform floats in [0, 1). The same seed always produces the same
 * sequence; different seeds (almost always) produce different sequences.
 */
export function createRng(seed: number): () => number {
  let state = seed >>> 0;
  return function next(): number {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Standard Box-Muller transform: turns two uniform [0, 1) draws from `next` into one normally
 * distributed sample with the given `mean` and `sd`. When `sd <= 0` the sample is deterministic
 * (equal to `mean`) and no random draw is consumed, since a zero-variance "distribution" has only
 * one possible value.
 */
export function sampleNormal(next: () => number, mean: number, sd: number): number {
  if (sd <= 0) {
    return mean;
  }
  // u1 must be in (0, 1], not [0, 1), since Math.log(0) is -Infinity. Re-draw on the (measure
  // zero, but representable) chance `next()` returns exactly 0.
  let u1 = next();
  while (u1 <= 0) {
    u1 = next();
  }
  const u2 = next();
  const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  return mean + sd * z;
}

/** Safety cap on rejection-sampling attempts in {@link sampleTruncatedNormalAtZero}. */
export const MAX_TRUNCATED_NORMAL_ATTEMPTS = 1000;

/**
 * A normal distribution truncated at 0, sampled by rejection: draw a normal sample and keep it
 * only if it is non-negative, matching this codebase's "truncated at 0" convention for fantasy
 * scores (see `projections/floor-ceiling.ts`). Rejection sampling (rather than clamping negative
 * draws to 0) is used because fantasy scores realistically never go negative but clamping would
 * pile up excess probability mass exactly at 0, distorting the simulated distribution's shape;
 * true rejection sampling preserves the proper truncated-normal shape instead.
 *
 * For the `mean`/`sd` pairs this package passes in (non-negative projections with a modest sd
 * relative to the mean), the first draw is almost always non-negative, so this rarely loops more
 * than once. {@link MAX_TRUNCATED_NORMAL_ATTEMPTS} guards against the pathological case (a large
 * negative mean relative to sd) spinning forever; after the cap is hit, 0 is returned since 0 is
 * the boundary of the support and the best available approximation.
 */
export function sampleTruncatedNormalAtZero(next: () => number, mean: number, sd: number): number {
  if (sd <= 0) {
    return Math.max(0, mean);
  }
  for (let attempt = 0; attempt < MAX_TRUNCATED_NORMAL_ATTEMPTS; attempt++) {
    const sample = sampleNormal(next, mean, sd);
    if (sample >= 0) {
      return sample;
    }
  }
  return 0;
}
