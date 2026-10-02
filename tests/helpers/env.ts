import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

/**
 * Reads one value from the process environment, falling back to the gitignored repo-root `.env`.
 * Returns undefined when absent or empty. Values are only held in memory; never write them to a
 * tracked file or log them.
 */
export function readEnvValue(name: string): string | undefined {
  const fromProcess = process.env[name];
  if (fromProcess !== undefined && fromProcess !== "") return fromProcess;
  const override = process.env["SIDELINE_ENV_FILE"]; // lets tests point at a missing/other file
  const file = override ?? path.resolve(import.meta.dirname, "../../.env");
  if (!existsSync(file)) return undefined;
  for (const line of readFileSync(file, "utf8").split(/\r?\n/)) {
    const match = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/.exec(line);
    if (match === null || match[1] !== name) continue;
    const value = (match[2] ?? "").replace(/^(["'])(.*)\1$/, "$2");
    return value === "" ? undefined : value;
  }
  return undefined;
}
