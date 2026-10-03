import { DATA, L } from "./helpers/data";

/**
 * Central route list for the axe (UI2) and no-horizontal-scroll (UI5) specs.
 * Every route here must exist and answer 2xx on the seeded server.
 */
export const existingRoutes: readonly string[] = [
  "/",
  // Phase 2 pages for the seeded league (ADR-009 item 4).
  L, // Home
  `${L}/team`,
  `${L}/league`,
  `${L}/league/teams/${DATA.myRosterId}`,
  `${L}/settings`,
  `${L}/lineup`,
  `${L}/matchup`,
  `${L}/waivers`,
  `${L}/players`,
  `${L}/players/${DATA.myPlayerId}`,
  // The seeded server has an active league, so onboarding opens on its done view.
  "/onboarding",
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

/** Routes that must answer 404 with the not-found page; axe and no-hscroll still apply. */
export const notFoundRoutes: readonly string[] = [`/l/${DATA.unknownLeagueId}`];
