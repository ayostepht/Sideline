import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { loadConfig } from "@sideline/shared";
import { SESSION_COOKIE_NAME, verifySession } from "./lib/server/auth";
import { isHttpsRequest } from "./lib/server/http";

/**
 * T6.1 (HOST-8): optional APP_PASSWORD login gate, plus security headers on every response.
 *
 * This file is named `proxy.ts`, not `middleware.ts`: in this pinned Next.js version (16.3.8)
 * the `middleware` file convention is deprecated and renamed to `proxy`
 * (node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/proxy.md). Proxy
 * defaults to the Node.js runtime here (stable since 15.5, default in 16), so this file can use
 * `node:crypto` directly via ./lib/server/auth instead of Web Crypto.
 */

/**
 * Static PWA assets a browser or OS fetches to evaluate installability (PLAN.md 6.7) before any
 * login has happened, so they must never require a session. `/manifest.webmanifest` is the
 * actual served path for `app/manifest.ts` (Next's metadata-route convention), not
 * `/manifest.json`. `/icons/icon-192.png` and `/icons/icon-512.png` come from `public/icons/`.
 */
const PUBLIC_PATHS = new Set<string>([
  "/api/health",
  "/login",
  "/api/login",
  "/manifest.webmanifest",
  "/icon.svg",
  "/apple-icon.png",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
]);

/**
 * Standard security headers, applied to every response regardless of whether auth is enabled.
 * CSP is `default-src 'self'` with no third-party scripts or analytics. `script-src` and
 * `style-src` allow 'unsafe-inline' because next-themes injects a small inline script (to set
 * the theme class before paint, avoiding a flash) and React components set inline `style`
 * attributes; there are no third-party or user-supplied scripts, so this is a documented,
 * narrow exception rather than a general relaxation. `script-src` additionally allows the CSP
 * keyword 'unsafe-eval' in development only: this file never calls `eval` itself, but
 * `next dev --webpack`'s own module wrapper for its default source maps does, so without this
 * allowance the dev bundle cannot run at all; the production build (`next build` / `next start`,
 * what actually ships) does not use `eval`, so production CSP stays strict. HSTS is set only on
 * an HTTPS request (checked the same way as the session cookie's `Secure` flag) so a plain-HTTP
 * LAN deployment is not forced onto HTTPS.
 */
function withSecurityHeaders(response: NextResponse, https: boolean): NextResponse {
  response.headers.set("X-Content-Type-Options", "nosniff");
  response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  response.headers.set("X-Frame-Options", "DENY");
  response.headers.set("Permissions-Policy", "geolocation=(), camera=(), microphone=()");
  const scriptSrc =
    process.env["NODE_ENV"] === "production"
      ? "script-src 'self' 'unsafe-inline'"
      : "script-src 'self' 'unsafe-inline' 'unsafe-eval'";
  response.headers.set(
    "Content-Security-Policy",
    [
      "default-src 'self'",
      scriptSrc,
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: https://sleepercdn.com",
      "font-src 'self' data:",
      "connect-src 'self'",
      "frame-ancestors 'none'",
      "base-uri 'self'",
      "form-action 'self'",
      "object-src 'none'",
    ].join("; "),
  );
  if (https) {
    response.headers.set("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
  }
  return response;
}

/**
 * Loads config fresh on every call rather than caching it at module scope. `loadConfig` only
 * parses a handful of env strings (cheap), and Next's own guidance for Proxy is to avoid relying
 * on shared module state since it can be deployed and invoked separately from the rest of the
 * app. The login rate limiter in ./lib/server/auth is the one piece of intentionally persistent
 * module state here, per HOST-8 (a single-process, single-container deployment).
 */
export function proxy(request: NextRequest): NextResponse {
  const https = isHttpsRequest(request);
  const pathname = request.nextUrl.pathname;
  const appConfig = loadConfig(process.env);

  if (appConfig.appPassword === null || PUBLIC_PATHS.has(pathname)) {
    return withSecurityHeaders(NextResponse.next(), https);
  }

  const cookie = request.cookies.get(SESSION_COOKIE_NAME)?.value;
  // appConfig.sessionSecret is guaranteed non-null whenever appPassword is set: loadConfig
  // refuses to start otherwise (packages/shared/src/config.ts).
  const secret = appConfig.sessionSecret ?? "";
  if (verifySession(secret, cookie, new Date())) {
    return withSecurityHeaders(NextResponse.next(), https);
  }

  if (pathname.startsWith("/api/")) {
    return withSecurityHeaders(
      NextResponse.json(
        { error: { code: "unauthorized", message: "Login required." } },
        {
          status: 401,
        },
      ),
      https,
    );
  }

  return withSecurityHeaders(NextResponse.redirect(new URL("/login", request.url)), https);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
