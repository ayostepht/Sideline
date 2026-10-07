import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { signSession } from "./lib/server/auth";
import { proxy } from "./proxy";

const SECRET = "x".repeat(32);

function req(
  path: string,
  opts: { headers?: Record<string, string>; cookie?: string } = {},
): NextRequest {
  const headers = { ...opts.headers };
  if (opts.cookie !== undefined) headers["cookie"] = opts.cookie;
  return new NextRequest(new URL(path, "http://app.local:3000"), { headers });
}

describe("proxy", () => {
  const originalPassword = process.env["APP_PASSWORD"];
  const originalSecret = process.env["SESSION_SECRET"];

  afterEach(() => {
    if (originalPassword === undefined) delete process.env["APP_PASSWORD"];
    else process.env["APP_PASSWORD"] = originalPassword;
    if (originalSecret === undefined) delete process.env["SESSION_SECRET"];
    else process.env["SESSION_SECRET"] = originalSecret;
  });

  describe("no APP_PASSWORD configured", () => {
    beforeEach(() => {
      delete process.env["APP_PASSWORD"];
      delete process.env["SESSION_SECRET"];
    });

    it("passes every route through with no cookie and no redirect", () => {
      const res = proxy(req("/l/L1/waivers"));
      expect(res.status).toBe(200);
      expect(res.headers.get("location")).toBeNull();
    });

    it("still applies security headers", () => {
      const res = proxy(req("/"));
      expect(res.headers.get("x-content-type-options")).toBe("nosniff");
      expect(res.headers.get("content-security-policy")).toContain("default-src 'self'");
      expect(res.headers.get("content-security-policy")).toContain(
        "img-src 'self' data: https://sleepercdn.com",
      );
    });
  });

  describe("APP_PASSWORD configured", () => {
    beforeEach(() => {
      process.env["APP_PASSWORD"] = "hunter2";
      process.env["SESSION_SECRET"] = SECRET;
    });

    it("redirects an unauthenticated page request to /login", () => {
      const res = proxy(req("/l/L1/waivers"));
      expect(res.status).toBe(307);
      expect(res.headers.get("location")).toBe("http://app.local:3000/login");
    });

    it("returns 401 JSON for an unauthenticated API request", async () => {
      const res = proxy(req("/api/l/L1/waivers"));
      expect(res.status).toBe(401);
      const body = (await res.json()) as unknown;
      expect(body).toEqual({ error: { code: "unauthorized", message: "Login required." } });
    });

    it("lets /api/health through with no cookie", () => {
      const res = proxy(req("/api/health"));
      expect(res.status).toBe(200);
      expect(res.headers.get("location")).toBeNull();
    });

    it("lets /login and /api/login through with no cookie", () => {
      expect(proxy(req("/login")).status).toBe(200);
      expect(proxy(req("/api/login")).status).toBe(200);
    });

    it("lets the PWA manifest and icon through with no cookie (installability check)", () => {
      const manifest = proxy(req("/manifest.webmanifest"));
      expect(manifest.status).toBe(200);
      expect(manifest.headers.get("location")).toBeNull();
      const icon = proxy(req("/icon.svg"));
      expect(icon.status).toBe(200);
      expect(icon.headers.get("location")).toBeNull();
    });

    it("passes through with a valid session cookie", () => {
      const cookie = `sideline_session=${signSession(SECRET, new Date())}`;
      const res = proxy(req("/l/L1/waivers", { cookie }));
      expect(res.status).toBe(200);
      expect(res.headers.get("location")).toBeNull();
    });

    it("redirects with an expired or tampered session cookie", () => {
      const expired = signSession(SECRET, new Date("2000-01-01T00:00:00.000Z"));
      const res = proxy(req("/l/L1/waivers", { cookie: `sideline_session=${expired}` }));
      expect(res.status).toBe(307);
    });

    it("CSP allows 'unsafe-eval' outside production (webpack dev source maps) but not in production", () => {
      vi.stubEnv("NODE_ENV", "production");
      const prod = proxy(req("/api/health"));
      vi.stubEnv("NODE_ENV", "development");
      const dev = proxy(req("/api/health"));
      vi.unstubAllEnvs();
      expect(prod.headers.get("content-security-policy")).not.toContain("unsafe-eval");
      expect(dev.headers.get("content-security-policy")).toContain("unsafe-eval");
    });

    it("sets Strict-Transport-Security only on an HTTPS-simulated request", () => {
      const https = proxy(req("/api/health", { headers: { "x-forwarded-proto": "https" } }));
      expect(https.headers.get("strict-transport-security")).toBe(
        "max-age=31536000; includeSubDomains",
      );
      const plain = proxy(req("/api/health"));
      expect(plain.headers.get("strict-transport-security")).toBeNull();
    });

    it("applies security headers on every response shape (next, redirect, 401 json)", () => {
      for (const res of [
        proxy(req("/api/health")),
        proxy(req("/l/L1/waivers")),
        proxy(req("/api/l/L1/waivers")),
      ]) {
        expect(res.headers.get("x-frame-options")).toBe("DENY");
        expect(res.headers.get("referrer-policy")).toBe("strict-origin-when-cross-origin");
        expect(res.headers.get("permissions-policy")).toContain("geolocation=()");
      }
    });
  });
});
