import path from "node:path";

export const WIDTHS = [390, 768, 1280] as const;
export const THEMES = ["light", "dark"] as const;
export type Theme = (typeof THEMES)[number];

export class ScreensArgError extends Error {}

/** Parses `--routes=/a,/b`; returns undefined when the flag is absent. */
export function parseScreensArgs(argv: readonly string[]): { routes: string[] | undefined } {
  let routes: string[] | undefined;
  for (const arg of argv) {
    if (arg === "--") continue;
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
  return { routes };
}

export function assertRoute(route: string): void {
  if (!route.startsWith("/")) throw new ScreensArgError(`route must start with "/": ${route}`);
}

/** "/" becomes "home"; "/lineup/week-3" becomes "lineup-week-3". */
export function routeSlug(route: string): string {
  const slug = route
    .replace(/[?#].*$/, "")
    .split("/")
    .filter((part) => part !== "")
    .join("-")
    .replace(/[^a-zA-Z0-9._-]+/g, "_");
  return slug === "" ? "home" : slug;
}

/** Repo-relative output path for one screenshot, e.g. .screens/home/390-light.png. */
export function screenshotPath(root: string, route: string, width: number, theme: Theme): string {
  return path.join(root, ".screens", routeSlug(route), `${width}-${theme}.png`);
}
