import type { Logger } from "pino";
import { getLogger } from "./logger";

export interface ApiResult {
  status: number;
  body: unknown;
  headers?: Record<string, string>;
}

export function errorResult(
  status: number,
  code: string,
  message: string,
  headers?: Record<string, string>,
): ApiResult {
  return { status, body: { error: { code, message } }, ...(headers ? { headers } : {}) };
}

export function toResponse(result: ApiResult): Response {
  return Response.json(result.body, {
    status: result.status,
    headers: { "Cache-Control": "no-store", ...result.headers },
  });
}

function hostOf(value: string | null): string | null {
  if (!value) return null;
  try {
    return new URL(value).host.toLowerCase();
  } catch {
    return null;
  }
}

/**
 * Guard for every mutating route (POST, PATCH, PUT, DELETE). Returns an error result to send, or
 * null when the request may proceed. Blocks cross-origin browser writes (Origin host differs from
 * Host or X-Forwarded-Host) with 403, and non-JSON bodies with 415 (a plain-form or text/plain
 * POST needs no CORS preflight, so the media type check closes that gap). A missing Origin is
 * allowed. All current clients send `Content-Type: application/json`, so no route is exempt.
 */
export function guardMutation(request: Request): ApiResult | null {
  const origin = request.headers.get("origin");
  if (origin !== null) {
    const originHost = hostOf(origin);
    const allowed = new Set<string>();
    const host = request.headers.get("host") ?? new URL(request.url).host;
    allowed.add(host.toLowerCase());
    const forwarded = request.headers.get("x-forwarded-host");
    if (forwarded) {
      for (const h of forwarded.split(",")) allowed.add(h.trim().toLowerCase());
    }
    if (originHost === null || !allowed.has(originHost)) {
      return errorResult(403, "cross_origin", "Cross-origin requests are not allowed.");
    }
  }
  const mediaType = (request.headers.get("content-type") ?? "").split(";")[0]?.trim().toLowerCase();
  if (mediaType !== "application/json") {
    return errorResult(415, "unsupported_media_type", "Content-Type must be application/json.");
  }
  return null;
}

/**
 * Best-effort client IP behind a reverse proxy (HOST-7: this app trusts `X-Forwarded-*` from
 * exactly one hop, Nginx Proxy Manager). Takes the LAST non-empty entry of `X-Forwarded-For`,
 * not the first: a client can send its own `X-Forwarded-For` with any fake value prepended, but
 * the trusted proxy in front of this app always APPENDS the real client IP as the last entry
 * (standard nginx/NPM behavior), so only the last entry is attacker-controlled-free. Taking the
 * first entry would let a client spoof a fresh "IP" per request and evade or hijack the login
 * rate limiter in ./auth. Falls back to `X-Real-Ip`, then a constant bucket for direct/local
 * connections (the Fetch `Request` API exposes no raw socket address in this runtime).
 */
export function clientIp(request: Request): string {
  const forwardedFor = request.headers.get("x-forwarded-for");
  if (forwardedFor !== null) {
    const entries = forwardedFor
      .split(",")
      .map((e) => e.trim())
      .filter((e) => e !== "");
    const last = entries.at(-1);
    if (last !== undefined) return last;
  }
  const realIp = request.headers.get("x-real-ip")?.trim();
  if (realIp !== undefined && realIp !== "") return realIp;
  return "direct";
}

/** True when the request reached us over HTTPS, trusting `X-Forwarded-Proto` (HOST-7). */
export function isHttpsRequest(request: Request): boolean {
  const forwardedProto = request.headers.get("x-forwarded-proto");
  if (forwardedProto !== null) {
    return forwardedProto.split(",")[0]?.trim().toLowerCase() === "https";
  }
  return new URL(request.url).protocol === "https:";
}

/**
 * Runs the guard, then reads the body and calls `handler`. Nothing is read or written if
 * blocked. Logs method, path, status, and duration for every call (never the body or any
 * cookie), and logs then rethrows on a thrown error.
 */
export async function guardedWrite(
  request: Request,
  handler: (rawBody: string) => ApiResult,
  log: Logger = getLogger(),
): Promise<Response> {
  const start = Date.now();
  const method = request.method;
  const path = new URL(request.url).pathname;
  try {
    const blocked = guardMutation(request);
    const result = blocked ?? handler(await request.text());
    log.info({ method, path, status: result.status, durationMs: Date.now() - start }, "request");
    return toResponse(result);
  } catch (err) {
    log.error(
      {
        method,
        path,
        durationMs: Date.now() - start,
        err: err instanceof Error ? err.message : String(err),
      },
      "request failed",
    );
    throw err;
  }
}
