import { spawn } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { z } from "zod";

/** The fake league id every recorded fixture uses (tests/fixtures/sleeper/manifest.json). */
export const FIXTURE_LEAGUE_ID = "1000000000000000001";
export const SEED_MARKER = ".sideline-fixture-seed";

const MarkerSchema = z.object({ leagueId: z.string(), seededAt: z.string() });

/** Resolves symlinks for the longest existing prefix, so temp dirs compare equal on macOS. */
function canonical(p: string): string {
  const abs = path.resolve(p);
  let existing = abs;
  const rest: string[] = [];
  while (!existsSync(existing) && path.dirname(existing) !== existing) {
    rest.unshift(path.basename(existing));
    existing = path.dirname(existing);
  }
  return path.join(realpathSync(existing), ...rest);
}

function isInside(child: string, parent: string): boolean {
  const rel = path.relative(parent, child);
  return rel === "" || (!rel.startsWith("..") && !path.isAbsolute(rel));
}

/**
 * Throws unless `dir` is a fixture-seeded data directory: outside `<repoRoot>/data` and
 * carrying a marker for the fake fixture league. Screenshots must never come from real data.
 */
export function assertSeededDataDir(dir: string, repoRoot: string): void {
  const resolved = canonical(dir);
  if (isInside(resolved, canonical(path.join(repoRoot, "data")))) {
    throw new Error(`DATA_DIR ${dir} is the real data directory (or inside it); refusing`);
  }
  const markerFile = path.join(resolved, SEED_MARKER);
  if (!existsSync(markerFile)) {
    throw new Error(
      `DATA_DIR ${dir} has no ${SEED_MARKER} marker, so it is not a fixture-seeded directory`,
    );
  }
  let marker: z.infer<typeof MarkerSchema>;
  try {
    marker = MarkerSchema.parse(JSON.parse(readFileSync(markerFile, "utf8")));
  } catch {
    throw new Error(`DATA_DIR ${dir} has an unreadable ${SEED_MARKER} marker`);
  }
  if (marker.leagueId !== FIXTURE_LEAGUE_ID) {
    throw new Error(`DATA_DIR ${dir} marker is not for the fake fixture league`);
  }
}

export interface SeededDataDir {
  dataDir: string;
  cleanup(): void;
}

/** Creates a fresh temp DATA_DIR, runs the fixture seed into it, and writes the marker. */
export async function createSeededDataDir(root: string, logFile?: string): Promise<SeededDataDir> {
  const dataDir = mkdtempSync(path.join(tmpdir(), "sideline-seeded-"));
  const cleanup = (): void => rmSync(dataDir, { recursive: true, force: true });
  const output: string[] = [];
  const code = await new Promise<number | null>((resolve) => {
    const child = spawn("pnpm", ["db:seed:fixtures"], {
      cwd: root,
      env: { ...process.env, DATA_DIR: dataDir },
      stdio: ["ignore", "pipe", "pipe"],
    });
    child.stdout.on("data", (b: Buffer) => output.push(b.toString()));
    child.stderr.on("data", (b: Buffer) => output.push(b.toString()));
    child.on("error", () => resolve(null));
    child.on("close", resolve);
  });
  if (logFile !== undefined) {
    mkdirSync(path.dirname(logFile), { recursive: true });
    writeFileSync(logFile, output.join(""), { flag: "a" });
  }
  if (code !== 0) {
    cleanup();
    throw new Error(`fixture seed failed (exit ${code}):\n${output.join("").slice(-1500)}`);
  }
  writeFileSync(
    path.join(dataDir, SEED_MARKER),
    `${JSON.stringify({ leagueId: FIXTURE_LEAGUE_ID, seededAt: new Date().toISOString() })}\n`,
  );
  return { dataDir, cleanup };
}
