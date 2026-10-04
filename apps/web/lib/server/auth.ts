import { createHmac, timingSafeEqual } from "node:crypto";

/** Name of the signed session cookie set by `POST /api/login`. */
export const SESSION_COOKIE_NAME = "sideline_session";

/** HOST-8: 30-day session expiry. */
export const SESSION_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;

/** HOST-8: 5 login attempts per minute per IP. */
const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX_ATTEMPTS = 5;

function hmacHex(secret: string, payload: string): string {
  return createHmac("sha256", secret).update(payload).digest("hex");
}

/**
 * Constant-time comparison of two hex strings of (expected) equal length. Returns false for any
 * length mismatch, but still performs a same-size comparison first so a mismatched length does
 * not short-circuit instantly (Buffer.from on an odd-length or non-hex string truncates, so this
 * is a defensive best effort, not a cryptographic guarantee for malformed input).
 */
function constantTimeHexEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a, "hex");
  const bufB = Buffer.from(b, "hex");
  if (bufA.length !== bufB.length || bufA.length === 0) return false;
  return timingSafeEqual(bufA, bufB);
}

/**
 * Constant-time comparison of two UTF-8 strings. Used for the submitted password against
 * `config.appPassword` so a wrong guess cannot be timed character by character. A length
 * mismatch still runs a same-size `timingSafeEqual` call (against a placeholder) before
 * returning false, so the "wrong length" and "wrong content" paths take comparable time.
 */
export function constantTimeStringEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a, "utf8");
  const bufB = Buffer.from(b, "utf8");
  if (bufA.length !== bufB.length) {
    timingSafeEqual(bufA, bufA);
    return false;
  }
  return timingSafeEqual(bufA, bufB);
}

/** Signs a session cookie value good for {@link SESSION_MAX_AGE_MS} from `now`. */
export function signSession(secret: string, now: Date): string {
  const payload = String(now.getTime() + SESSION_MAX_AGE_MS);
  return `${payload}.${hmacHex(secret, payload)}`;
}

/** Verifies a session cookie value: well-formed, correctly signed, and not expired. */
export function verifySession(secret: string, value: string | undefined, now: Date): boolean {
  if (value === undefined || value === "") return false;
  const dot = value.lastIndexOf(".");
  if (dot < 0) return false;
  const payload = value.slice(0, dot);
  const signature = value.slice(dot + 1);
  if (!constantTimeHexEqual(signature, hmacHex(secret, payload))) return false;
  const expiresAt = Number(payload);
  return Number.isFinite(expiresAt) && expiresAt > now.getTime();
}

/** `Set-Cookie` value for a fresh session. `secure` is true only on an HTTPS request. */
export function buildSessionCookie(value: string, secure: boolean): string {
  const parts = [
    `${SESSION_COOKIE_NAME}=${value}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    `Max-Age=${Math.floor(SESSION_MAX_AGE_MS / 1000)}`,
  ];
  if (secure) parts.push("Secure");
  return parts.join("; ");
}

/** `Set-Cookie` value that clears the session cookie (logout). */
export function clearedSessionCookie(secure: boolean): string {
  const parts = [`${SESSION_COOKIE_NAME}=`, "Path=/", "HttpOnly", "SameSite=Lax", "Max-Age=0"];
  if (secure) parts.push("Secure");
  return parts.join("; ");
}

/**
 * In-memory, per-process login rate limiter: at most {@link RATE_LIMIT_MAX_ATTEMPTS} attempts
 * per IP per rolling {@link RATE_LIMIT_WINDOW_MS} window. A single self-hosted container has one
 * process, so module-scoped state is sufficient; it is not shared across restarts or replicas.
 * Counts every attempt (the window resets only once it has fully elapsed), so a correct password
 * cannot be used to dodge the limiter.
 *
 * `clientIp` (see `http.ts`) trusts the last `X-Forwarded-For` entry, which assumes exactly one
 * trusted reverse proxy. If that assumption is ever violated (no proxy, or a misconfigured one,
 * both plausible for a self-hosted operator who exposes port 3000 directly), an attacker can key
 * this map with a unique fake "IP" on every request. A periodic sweep (below) bounds the map's
 * size to "distinct keys seen within the last window" rather than "distinct keys seen ever", so
 * a sustained flood of fake IPs cannot grow this map without bound across process lifetime. This
 * is defense in depth, not a substitute for a correctly configured reverse proxy.
 */
const attempts = new Map<string, { count: number; windowStart: number }>();

/** Drops every entry whose window has fully elapsed; it will never be read again by its key. */
function pruneExpired(nowMs: number): void {
  for (const [key, entry] of attempts) {
    if (nowMs - entry.windowStart >= RATE_LIMIT_WINDOW_MS) {
      attempts.delete(key);
    }
  }
}

/** Records one login attempt for `ip` and returns true when it is over the limit. */
export function isRateLimited(ip: string, now: Date): boolean {
  const nowMs = now.getTime();
  pruneExpired(nowMs);
  const entry = attempts.get(ip);
  if (entry === undefined || nowMs - entry.windowStart >= RATE_LIMIT_WINDOW_MS) {
    attempts.set(ip, { count: 1, windowStart: nowMs });
    return false;
  }
  entry.count += 1;
  return entry.count > RATE_LIMIT_MAX_ATTEMPTS;
}

/** Test helper: clears all rate limiter state. */
export function resetRateLimiterForTests(): void {
  attempts.clear();
}

/** Test helper: current number of tracked keys, to prove the map's memory is bounded. */
export function rateLimiterSizeForTests(): number {
  return attempts.size;
}
