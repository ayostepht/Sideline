import { describe, expect, it } from "vitest";
import { ConfigError, loadConfig } from "./config.js";

const SECRET = "a".repeat(32);

function errorOf(env: Record<string, string>): ConfigError {
  try {
    loadConfig(env);
  } catch (e) {
    if (e instanceof ConfigError) return e;
    throw e;
  }
  throw new Error("expected ConfigError");
}

describe("loadConfig", () => {
  it("applies defaults for an empty env", () => {
    expect(loadConfig({})).toEqual({
      sleeperUsername: null,
      defaultLeagueId: null,
      dataDir: "/data",
      tz: "America/New_York",
      appPassword: null,
      sessionSecret: null,
      puid: 1000,
      pgid: 1000,
      enableNflverse: true,
      oddsApiKey: null,
      syncCron: {},
      logLevel: "info",
      port: 3000,
    });
  });

  it("treats empty strings as unset", () => {
    const c = loadConfig({ PORT: "", ENABLE_NFLVERSE: "", SYNC_STATE_CRON: "", DATA_DIR: " " });
    expect(c.port).toBe(3000);
    expect(c.enableNflverse).toBe(true);
    expect(c.syncCron).toEqual({});
    expect(c.dataDir).toBe("/data");
  });

  it("parses valid values", () => {
    const c = loadConfig({
      SLEEPER_USERNAME: "steph",
      DEFAULT_LEAGUE_ID: "123",
      DATA_DIR: "./data",
      PORT: "8080",
      PUID: "99",
      PGID: "100",
      ENABLE_NFLVERSE: "0",
      LOG_LEVEL: "DEBUG",
      APP_PASSWORD: "pw",
      SESSION_SECRET: SECRET,
      SYNC_STATE_CRON: "*/5  * * * *",
      SYNC_PLAYERS_CRON: "0 0 4 * * *",
      ODDS_API_KEY: "k",
    });
    expect(c).toMatchObject({
      port: 8080,
      puid: 99,
      pgid: 100,
      enableNflverse: false,
      logLevel: "debug",
    });
    expect(c.syncCron).toEqual({ state: "*/5 * * * *", players: "0 0 4 * * *" });
  });

  it("accepts true/false/1/0 booleans", () => {
    expect(loadConfig({ ENABLE_NFLVERSE: "false" }).enableNflverse).toBe(false);
    expect(loadConfig({ ENABLE_NFLVERSE: "1" }).enableNflverse).toBe(true);
    expect(loadConfig({ ENABLE_NFLVERSE: "TRUE" }).enableNflverse).toBe(true);
  });

  it.each(["abc", "0", "70000", "-1", "3.5"])("rejects bad PORT %s", (port) => {
    expect(errorOf({ PORT: port }).issues.map((i) => i.variable)).toEqual(["PORT"]);
  });

  it("rejects bad PUID/PGID", () => {
    expect(errorOf({ PUID: "x", PGID: "99999" }).issues.map((i) => i.variable)).toEqual([
      "PUID",
      "PGID",
    ]);
  });

  it("requires SESSION_SECRET when APP_PASSWORD is set", () => {
    const e = errorOf({ APP_PASSWORD: "pw" });
    expect(e.message).toContain("SESSION_SECRET");
    expect(e.message).toContain("openssl rand -hex 32");
  });

  it("rejects a short SESSION_SECRET", () => {
    expect(errorOf({ APP_PASSWORD: "pw", SESSION_SECRET: "short" }).message).toContain(
      "at least 32",
    );
    expect(errorOf({ SESSION_SECRET: "short" }).message).toContain("SESSION_SECRET");
  });

  it("allows a SESSION_SECRET without APP_PASSWORD", () => {
    expect(loadConfig({ SESSION_SECRET: SECRET }).sessionSecret).toBe(SECRET);
  });

  it("rejects a bad boolean", () => {
    expect(errorOf({ ENABLE_NFLVERSE: "yes" }).message).toContain("ENABLE_NFLVERSE");
  });

  it.each(["* * *", "nonsense", "* * * * * * *", "$(x) * * * *"])("rejects bad cron %s", (cron) => {
    expect(errorOf({ SYNC_LEAGUE_CRON: cron }).message).toContain("SYNC_LEAGUE_CRON");
  });

  it.each(["foo bar baz qux quux", "61 * * * *", "* * *", "* 24 * * *", "* * 0 * *", "* * * 13 *"])(
    "rejects invalid cron %s",
    (cron) => {
      expect(errorOf({ SYNC_LEAGUE_CRON: cron }).message).toContain("SYNC_LEAGUE_CRON");
    },
  );

  it.each(["*/15 * * * *", "0 3 * * 1", "0 0 */2 * * *", "0 6 * JAN-MAR MON-FRI", "1,2,3 * * * *"])(
    "accepts valid cron %s",
    (cron) => {
      expect(loadConfig({ SYNC_LEAGUE_CRON: cron }).syncCron.league).toBe(cron);
    },
  );

  it("accepts a valid TZ and rejects an invalid one", () => {
    expect(loadConfig({ TZ: "Europe/London" }).tz).toBe("Europe/London");
    expect(errorOf({ TZ: "Mars/Olympus" }).message).toContain("TZ");
  });

  it("rejects a bad LOG_LEVEL", () => {
    expect(errorOf({ LOG_LEVEL: "loud" }).message).toContain("LOG_LEVEL");
  });

  it("reports multiple errors together", () => {
    const e = errorOf({
      PORT: "x",
      LOG_LEVEL: "loud",
      ENABLE_NFLVERSE: "maybe",
      APP_PASSWORD: "pw",
    });
    expect(e.issues.map((i) => i.variable).sort()).toEqual([
      "ENABLE_NFLVERSE",
      "LOG_LEVEL",
      "PORT",
      "SESSION_SECRET",
    ]);
    expect(e.name).toBe("ConfigError");
  });
});
