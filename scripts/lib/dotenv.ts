import { existsSync } from "node:fs";
import path from "node:path";
import process from "node:process";

/**
 * Loads `<root>/.env` into process.env when it exists (existing variables win) and makes a
 * relative DATA_DIR absolute, defaulting to `<root>/data`. Returns what happened, for printing.
 */
export function loadLocalEnv(root: string): { loaded: boolean; dataDir: string } {
  const file = path.join(root, ".env");
  const loaded = existsSync(file);
  if (loaded) process.loadEnvFile(file);
  const raw = process.env["DATA_DIR"];
  const dataDir = path.resolve(root, raw === undefined || raw === "" ? "data" : raw);
  process.env["DATA_DIR"] = dataDir;
  return { loaded, dataDir };
}
