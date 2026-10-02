/** Typed errors for the Sleeper HTTP layer. Every error has a stable `code`. */
export type SleeperErrorCode =
  "SLEEPER_HTTP" | "SLEEPER_TIMEOUT" | "SLEEPER_NETWORK" | "SLEEPER_SCHEMA";

export class SleeperError extends Error {
  readonly code: SleeperErrorCode;
  constructor(code: SleeperErrorCode, message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = new.target.name;
    this.code = code;
  }
}

/** Non-2xx response (4xx immediately, 429/5xx after retries are exhausted). */
export class SleeperHttpError extends SleeperError {
  constructor(
    readonly status: number,
    readonly url: string,
    readonly attempts: number,
    /** Retry-After the server asked for, when we refused to wait that long. */
    readonly retryAfterMs?: number,
  ) {
    super(
      "SLEEPER_HTTP",
      `Sleeper responded ${status} for ${url} after ${attempts} attempt(s)` +
        (retryAfterMs === undefined ? "" : ` (server requested Retry-After ${retryAfterMs} ms)`),
    );
  }
}

/** The per-attempt timeout elapsed. Not retried. */
export class SleeperTimeoutError extends SleeperError {
  constructor(
    readonly url: string,
    readonly timeoutMs: number,
    readonly attempts: number,
  ) {
    super("SLEEPER_TIMEOUT", `Sleeper request to ${url} timed out after ${timeoutMs} ms`);
  }
}

/** The request failed before a response arrived (DNS, reset, offline). Not retried. */
export class SleeperNetworkError extends SleeperError {
  constructor(
    readonly url: string,
    readonly attempts: number,
    cause: unknown,
  ) {
    super("SLEEPER_NETWORK", `Network error calling ${url}`, { cause });
  }
}

export interface SchemaIssueSummary {
  path: string;
  message: string;
}

/** Body was not JSON or failed zod validation. */
export class SleeperSchemaError extends SleeperError {
  constructor(
    readonly path: string,
    readonly issues: SchemaIssueSummary[],
  ) {
    super(
      "SLEEPER_SCHEMA",
      `Unexpected response shape for ${path}: ${issues.map((i) => `${i.path || "(root)"}: ${i.message}`).join("; ")}`,
    );
  }
}
