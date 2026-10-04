import { Writable } from "node:stream";
import { describe, expect, it } from "vitest";
import { getLogger } from "./logger";

function captureStream(): { stream: Writable; lines: () => unknown[] } {
  const chunks: string[] = [];
  const stream = new Writable({
    write(chunk, _enc, cb) {
      chunks.push(String(chunk));
      cb();
    },
  });
  return {
    stream,
    lines: (): unknown[] =>
      chunks
        .flatMap((c) => c.trim().split("\n"))
        .filter(Boolean)
        .map((l): unknown => JSON.parse(l) as unknown),
  };
}

describe("getLogger", () => {
  it("emits structured JSON with the sideline-web app base field", () => {
    const { stream, lines } = captureStream();
    const log = getLogger({}, stream);
    log.info({ method: "GET", path: "/api/health", status: 200, durationMs: 1 }, "request");
    const [line] = lines() as { app: string; msg: string; method: string; status: number }[];
    expect(line).toBeDefined();
    expect(line?.app).toBe("sideline-web");
    expect(line?.msg).toBe("request");
    expect(line?.method).toBe("GET");
    expect(line?.status).toBe(200);
  });

  it("falls back to info level on invalid config rather than throwing", () => {
    const { stream } = captureStream();
    expect(() => getLogger({ LOG_LEVEL: "not-a-level" }, stream)).not.toThrow();
  });

  it("respects LOG_LEVEL from config", () => {
    const { stream, lines } = captureStream();
    const log = getLogger({ LOG_LEVEL: "error" }, stream);
    log.info({ method: "GET", path: "/x" }, "request");
    log.error({ method: "GET", path: "/x" }, "request failed");
    expect(lines()).toHaveLength(1);
  });
});
