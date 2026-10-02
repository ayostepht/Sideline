import { createFixtureFetch } from "./fixture-fetch.js";

export const FIXTURE_FETCH_ENV = "SIDELINE_FIXTURE_FETCH";

export function isFixtureMode(env: Record<string, string | undefined>): boolean {
  return env[FIXTURE_FETCH_ENV] === "1";
}

/** Fixture mode serves recordings instead of calling Sleeper; it must never run in production. */
export function assertFixtureModeAllowed(env: Record<string, string | undefined>): void {
  if (isFixtureMode(env) && env["NODE_ENV"] === "production") {
    throw new Error(`${FIXTURE_FETCH_ENV}=1 is not allowed when NODE_ENV=production`);
  }
}

/** The fixture fetch for the worker process, or null outside fixture mode. Throws in production. */
export function fixtureFetchFromEnv(env: Record<string, string | undefined>): typeof fetch | null {
  assertFixtureModeAllowed(env);
  return isFixtureMode(env) ? createFixtureFetch() : null;
}
