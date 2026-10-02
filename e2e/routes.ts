import { FIXTURE } from "./helpers/servers";

/**
 * Central route list for the axe (UI2) and no-horizontal-scroll (UI5) specs.
 * Every route here must exist and answer 2xx on the seeded server.
 */
export const existingRoutes: readonly string[] = [
  "/",
  "/dev/gallery",
  // Real overlays render open only through these URLs (T2.1b); the spec waits for them to be visible.
  "/dev/gallery?open=why",
  "/dev/gallery?open=sheet",
  "/dev/gallery?open=dialog",
];

/** Overlay routes and the dialog role/testid-agnostic role they expose once open. */
export const overlayRoutes: ReadonlyMap<string, "dialog"> = new Map([
  ["/dev/gallery?open=why", "dialog"],
  ["/dev/gallery?open=sheet", "dialog"],
  ["/dev/gallery?open=dialog", "dialog"],
]);

const L = `/l/${FIXTURE.leagueId}`;

/**
 * Phase 2 pages (ADR-009 item 4) for the seeded league. They do not exist yet.
 * T2.5b moves each page into `existingRoutes` as T2.3 lands it; until then they are not tested.
 * `/onboarding` is served by the onboarding server in some specs, but is listed here as a route.
 */
export const phase2PageRoutes: readonly string[] = [
  L, // Home
  `${L}/team`,
  `${L}/league`,
  `${L}/league/teams/1`,
  `${L}/settings`,
  `${L}/lineup`,
  `${L}/matchup`,
  `${L}/waivers`,
  `${L}/players`,
  "/onboarding",
];
