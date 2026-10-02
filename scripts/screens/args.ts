import path from "node:path";

export const WIDTHS = [390, 768, 1280] as const;
export const THEMES = ["light", "dark"] as const;
export type Theme = (typeof THEMES)[number];

export class ScreensArgError extends Error {}

/** Parses `--routes=/a,/b`; returns undefined when the flag is absent. */
export function parseScreensArgs(argv: readonly string[]): {
  routes: string[] | undefined;
  unverified: boolean;
  dataDir: string | undefined;
} {
  let routes: string[] | undefined;
  let unverified = false;
  let dataDir: string | undefined;
  for (const arg of argv) {
    if (arg === "--") continue;
    if (arg === "--unverified") {
      unverified = true;
      continue;
    }
    if (arg.startsWith("--data-dir=")) {
      dataDir = arg.slice("--data-dir=".length);
      continue;
    }
    if (arg.startsWith("--routes=")) {
      routes = arg
        .slice("--routes=".length)
        .split(",")
        .map((r) => r.trim())
        .filter((r) => r !== "");
      if (routes.length === 0)
        throw new ScreensArgError("--routes needs at least one path, e.g. --routes=/,/lineup");
      for (const r of routes) assertRoute(r);
    } else {
      throw new ScreensArgError(`unknown argument: ${arg}`);
    }
  }
  return { routes, unverified, dataDir };
}

export function assertRoute(route: string): void {
  if (!route.startsWith("/")) throw new ScreensArgError(`route must start with "/": ${route}`);
}

/** "/" becomes "home"; "/lineup/week-3" becomes "lineup-week-3"; a query adds "__open-why". */
export function routeSlug(route: string): string {
  const query = /\?([^#]*)/.exec(route)?.[1] ?? "";
  const querySlug = query.replace(/[^a-zA-Z0-9._]+/g, "-").replace(/^-+|-+$/g, "");
  const base = routeBaseSlug(route);
  return querySlug === "" ? base : `${base}__${querySlug}`;
}

function routeBaseSlug(route: string): string {
  const slug = route
    .replace(/[?#].*$/, "")
    .split("/")
    .filter((part) => part !== "")
    .join("-")
    .replace(/[^a-zA-Z0-9._-]+/g, "_");
  return slug === "" ? "home" : slug;
}

/** Repo-relative output path for one screenshot, e.g. .screens/home/390-light.png. */
export function screenshotPath(
  root: string,
  route: string,
  width: number,
  theme: Theme,
  subdir = "",
): string {
  return path.join(root, ".screens", subdir, routeSlug(route), `${width}-${theme}.png`);
}
