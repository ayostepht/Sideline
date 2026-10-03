/**
 * LINEUP-3 (PLAN 5.4): lineup locks. A starter whose game has kicked off stays in their slot; a
 * bench player whose game has kicked off cannot be moved in. Kickoff time ideally comes from
 * nflverse; when it is unavailable, ADR-002's fallback lock times apply and the caller marks the
 * lock as approximate so the UI can show the time was estimated, not confirmed.
 *
 * This module only answers "is this player locked right now" given a kickoff time the caller has
 * already resolved (real-or-fallback, per ADR-002). It does not fetch or compute kickoff times
 * itself (no I/O in `packages/core`).
 */

export interface LockInfo {
  /** ISO-8601 kickoff timestamp (UTC) for the player's game, or null if unknown. */
  kickoffUtc: string | null;
  /** True when `kickoffUtc` is the ADR-002 fallback estimate rather than a confirmed nflverse time. */
  kickoffApproximate: boolean;
}

/**
 * True iff `kickoffUtc` is known and `now` is at or after it. `kickoffUtc === null` means unknown
 * kickoff and defaults to **not locked** (permissive default). Callers are expected to always
 * resolve a real-or-fallback kickoff per ADR-002 before calling this; the null case is a
 * defensive fallback, not the expected path.
 */
export function isLocked(info: LockInfo, now: Date): boolean {
  if (info.kickoffUtc === null) {
    return false;
  }
  return now.getTime() >= Date.parse(info.kickoffUtc);
}
