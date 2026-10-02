import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { migrate, openDb, dbPathFromDataDir, type DbHandle } from "@sideline/db";
import { loadConfig, type AppConfig } from "@sideline/shared";
import pino from "pino";

export const silent = pino({ level: "silent" });

export function tempDataDir(): string {
  return mkdtempSync(join(tmpdir(), "sideline-worker-"));
}

export function testConfig(dataDir: string, env: Record<string, string> = {}): AppConfig {
  return loadConfig({ DATA_DIR: dataDir, ...env });
}

export function tempDb(dataDir: string = tempDataDir()): DbHandle {
  const h = openDb(dbPathFromDataDir(dataDir));
  migrate(h);
  return h;
}

export function fakeClock(startIso: string): {
  now: () => Date;
  set(iso: string): void;
  advance(ms: number): void;
} {
  let t = Date.parse(startIso);
  return {
    now: () => new Date(t),
    set: (iso) => {
      t = Date.parse(iso);
    },
    advance: (ms) => {
      t += ms;
    },
  };
}
