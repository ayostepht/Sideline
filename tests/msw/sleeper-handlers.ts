import { readFile } from "node:fs/promises";
import path from "node:path";
import { delay, http, HttpResponse, type AnyHandler } from "msw";

/**
 * MSW handlers that serve Sleeper API responses from recorded (or synthetic) fixtures.
 *
 * Layout contract (see tests/fixtures/README.md):
 *   https://api.sleeper.app/v1/<p>                       -> <root>/v1/<p>.json
 *   https://api.sleeper.app/projections/nfl/<season>/<w> -> <root>/projections/<season>/<w>.json
 *   https://api.sleeper.app/stats/nfl/<season>/<w>       -> <root>/stats/<season>/<w>.json
 * Query strings are ignored. Anything without a fixture returns 404 JSON and is recorded in
 * `unhandled` so tests can assert that no unexpected endpoint was called.
 */

export const SLEEPER_BASE_URL = "https://api.sleeper.app";

const SEGMENT = /^[A-Za-z0-9_.-]+$/;

export interface SleeperHandlers {
  /** Handlers to pass to `setupServer(...)` or `server.use(...)`. */
  readonly handlers: AnyHandler[];
  /** Request paths (no query) that had no fixture, in call order. */
  readonly unhandled: string[];
  /** Every request path (no query) the mock saw, in call order. */
  readonly requests: string[];
  /** Clears `unhandled` and `requests`. */
  reset(): void;
}

/** Maps a request pathname to a fixture file path, or null when the path is not mappable. */
export function fixturePathFor(fixtureRoot: string, pathname: string): string | null {
  const segments = pathname.split("/").filter((s) => s.length > 0);
  if (segments.length === 0 || !segments.every((s) => SEGMENT.test(s) && s !== "." && s !== "..")) {
    return null;
  }
  const [first, ...rest] = segments;
  let relative: string[];
  if (first === "v1" && rest.length > 0) {
    relative = ["v1", ...rest];
  } else if (
    (first === "projections" || first === "stats") &&
    rest[0] === "nfl" &&
    rest.length === 3
  ) {
    relative = [first, ...rest.slice(1)];
  } else {
    return null;
  }
  const last = relative.length - 1;
  relative[last] = `${relative[last] ?? ""}.json`;
  return path.join(fixtureRoot, ...relative);
}

function notFound(pathname: string): Response {
  return HttpResponse.json({ error: "no fixture", path: pathname }, { status: 404 });
}

export function createSleeperHandlers(options: { fixtureRoot: string }): SleeperHandlers {
  const { fixtureRoot } = options;
  const unhandled: string[] = [];
  const requests: string[] = [];

  const handler = http.get(`${SLEEPER_BASE_URL}/*`, async ({ request }) => {
    const { pathname } = new URL(request.url);
    requests.push(pathname);
    const file = fixturePathFor(fixtureRoot, pathname);
    if (file === null) {
      unhandled.push(pathname);
      return notFound(pathname);
    }
    let body: string;
    try {
      body = await readFile(file, "utf8");
    } catch (error) {
      if (error instanceof Error && "code" in error && error.code === "ENOENT") {
        unhandled.push(pathname);
        return notFound(pathname);
      }
      throw error;
    }
    return new Response(body, { status: 200, headers: { "content-type": "application/json" } });
  });

  return {
    handlers: [handler],
    unhandled,
    requests,
    reset() {
      unhandled.length = 0;
      requests.length = 0;
    },
  };
}

export interface WithStatusOptions {
  /** Headers on the injected response, e.g. `{ "Retry-After": "2" }` for a 429. */
  headers?: Record<string, string>;
  /** JSON body of the injected response. Defaults to `{ error: "injected" }`. */
  body?: unknown;
}

/**
 * Failure injection. Returns a handler to prepend with `server.use(...)`.
 * `path` is a URL path such as `/v1/state/nfl` (MSW path patterns like `/v1/league/:id` work).
 * Responds with `status` for the first `times` matching calls (default: every call), then falls
 * through to the fixture handlers so retry/recovery logic can be tested.
 */
export function withStatus(
  pathPattern: string,
  status: number,
  times: number = Number.POSITIVE_INFINITY,
  opts: WithStatusOptions = {},
): AnyHandler {
  let remaining = times;
  return http.get(`${SLEEPER_BASE_URL}${pathPattern}`, () => {
    if (remaining <= 0) return undefined;
    remaining -= 1;
    return HttpResponse.json(opts.body ?? { error: "injected" }, {
      status,
      ...(opts.headers ? { headers: opts.headers } : {}),
    });
  });
}

/**
 * Adds `ms` of latency to matching calls, then falls through to the fixture handlers.
 * Pass `times` to delay only the first N calls.
 */
export function withDelay(
  pathPattern: string,
  ms: number,
  times: number = Number.POSITIVE_INFINITY,
): AnyHandler {
  let remaining = times;
  return http.get(`${SLEEPER_BASE_URL}${pathPattern}`, async () => {
    if (remaining <= 0) return undefined;
    remaining -= 1;
    await delay(ms);
    return undefined;
  });
}
