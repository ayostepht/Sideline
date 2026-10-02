import path from "node:path";
import { setupServer } from "msw/node";
import { createSleeperHandlers, type SleeperHandlers } from "./sleeper-handlers";

/** Tiny hand-written fixture tree (fake ids) for harness self-tests and edge cases. */
export const syntheticFixtureRoot = path.resolve(
  import.meta.dirname,
  "../fixtures/synthetic/sleeper",
);
/** Recorded, sanitized fixtures from the real league (written by the T0.3b recorder). */
export const recordedFixtureRoot = path.resolve(import.meta.dirname, "../fixtures/sleeper");

export type SleeperServer = ReturnType<typeof setupServer> & { readonly mock: SleeperHandlers };

/**
 * Creates (but does not start) an MSW Node server backed by fixtures. Typical use:
 *
 *   const server = createSleeperServer({ fixtureRoot: syntheticFixtureRoot });
 *   beforeAll(() => server.listen());
 *   afterEach(() => { server.resetHandlers(); server.mock.reset(); });
 *   afterAll(() => server.close());
 *
 * Any request to a host with no handler fails (no real network in default runs).
 */
export function createSleeperServer(options: { fixtureRoot: string }): SleeperServer {
  const mock = createSleeperHandlers(options);
  const server = setupServer(...mock.handlers);
  const listen = server.listen.bind(server);
  server.listen = (opts) => listen({ onUnhandledFrame: "error", ...opts });
  return Object.assign(server, { mock });
}
