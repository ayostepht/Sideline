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

/** Runs the guard, then reads the body and calls `handler`. Nothing is read or written if blocked. */
export async function guardedWrite(
  request: Request,
  handler: (rawBody: string) => ApiResult,
): Promise<Response> {
  const blocked = guardMutation(request);
  if (blocked) return toResponse(blocked);
  return toResponse(handler(await request.text()));
}
