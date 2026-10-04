import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { resetRateLimiterForTests, verifySession } from "../../../lib/server/auth";
import { DELETE as logoutRoute, POST as loginRoute } from "./route";

const JSON_CT = { "content-type": "application/json" };
const SECRET = "s".repeat(32);

function postLogin(password: unknown, headers: Record<string, string> = {}): Promise<Response> {
  return loginRoute(
    new Request("http://app.local:3000/api/login", {
      method: "POST",
      headers: { ...JSON_CT, ...headers },
      body: JSON.stringify({ password }),
    }),
  );
}

function setCookieValue(res: Response): string {
  const raw = res.headers.get("set-cookie") ?? "";
  return raw.split(";")[0] ?? "";
}

describe("POST /api/login", () => {
  const originalPassword = process.env["APP_PASSWORD"];
  const originalSecret = process.env["SESSION_SECRET"];

  beforeEach(() => {
    resetRateLimiterForTests();
    process.env["APP_PASSWORD"] = "correct-horse";
    process.env["SESSION_SECRET"] = SECRET;
  });

  afterEach(() => {
    if (originalPassword === undefined) delete process.env["APP_PASSWORD"];
    else process.env["APP_PASSWORD"] = originalPassword;
    if (originalSecret === undefined) delete process.env["SESSION_SECRET"];
    else process.env["SESSION_SECRET"] = originalSecret;
  });

  it("503s when password login is not enabled", async () => {
    delete process.env["APP_PASSWORD"];
    delete process.env["SESSION_SECRET"];
    const res = await postLogin("anything");
    expect(res.status).toBe(503);
  });

  it("correct password sets a signed cookie usable by verifySession", async () => {
    const res = await postLogin("correct-horse");
    expect(res.status).toBe(200);
    const cookie = setCookieValue(res);
    expect(cookie.startsWith("sideline_session=")).toBe(true);
    const value = cookie.slice("sideline_session=".length);
    expect(verifySession(SECRET, value, new Date())).toBe(true);
  });

  it("cookie is HttpOnly and not Secure on a plain HTTP request", async () => {
    const res = await postLogin("correct-horse");
    const raw = res.headers.get("set-cookie") ?? "";
    expect(raw).toContain("HttpOnly");
    expect(raw).not.toContain("Secure");
  });

  it("cookie is Secure when the request is HTTPS (X-Forwarded-Proto)", async () => {
    const res = await postLogin("correct-horse", { "x-forwarded-proto": "https" });
    const raw = res.headers.get("set-cookie") ?? "";
    expect(raw).toContain("Secure");
  });

  it("wrong password: 401, generic error, no cookie set", async () => {
    const res = await postLogin("nope");
    expect(res.status).toBe(401);
    expect(res.headers.get("set-cookie")).toBeNull();
    const body = (await res.json()) as { error: { code: string; message: string } };
    expect(body.error.code).toBe("invalid_login");
  });

  it("6th attempt within a minute is rate-limited with the same generic error, even with the correct password", async () => {
    const wrongPasswordRes = await postLogin("nope");
    expect(wrongPasswordRes.status).toBe(401);
    const wrongPasswordBody = (await wrongPasswordRes.json()) as unknown;
    for (let i = 0; i < 4; i += 1) {
      const r = await postLogin("nope");
      expect(r.status).toBe(401);
    }
    // 6th attempt overall, this time with the correct password: still blocked, and
    // indistinguishable from a wrong-password response.
    const sixth = await postLogin("correct-horse");
    expect(sixth.status).toBe(401);
    expect(sixth.headers.get("set-cookie")).toBeNull();
    expect(await sixth.json()).toEqual(wrongPasswordBody);
  });

  it("cross-origin request is blocked with 403 before touching the rate limiter", async () => {
    const res = await loginRoute(
      new Request("http://app.local:3000/api/login", {
        method: "POST",
        headers: { ...JSON_CT, origin: "http://evil.example", host: "app.local:3000" },
        body: JSON.stringify({ password: "correct-horse" }),
      }),
    );
    expect(res.status).toBe(403);
  });
});

describe("DELETE /api/login", () => {
  it("clears the session cookie", async () => {
    const res = await logoutRoute(
      new Request("http://app.local:3000/api/login", { method: "DELETE", headers: JSON_CT }),
    );
    expect(res.status).toBe(200);
    const raw = res.headers.get("set-cookie") ?? "";
    expect(raw).toContain("sideline_session=;");
    expect(raw).toContain("Max-Age=0");
  });
});
