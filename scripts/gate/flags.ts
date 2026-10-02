export interface GateCheckId {
  id: string;
}

export interface GateFlags {
  only: string[] | undefined;
  skipDocker: boolean;
  amd64: boolean;
  fast: boolean;
  /** Any SKIPPED check makes the gate exit non-zero, except ids in allowSkip. */
  strict: boolean;
  allowSkip: string[];
  help: boolean;
}

export const GATE_HELP = `Usage: pnpm gate [flags]

Runs every automatable universal check, prints a summary, writes docs/gates/latest.json.

Flags:
  --only=U1,U3     Run only these checks. A bare number such as U3 selects U3a, U3b, U3c.
  --fast           Skip checks that need a browser or docker (UI1, UI2, UI3, U3b, U3c).
  --skip-docker    Skip the docker checks (U3b, U3c).
  --amd64          Also run U3c, the linux/amd64 image (the Unraid deploy target).
                   U3c runs ONLY with this flag (or --only=U3c); otherwise it is SKIPPED.
  --strict         Any SKIPPED check makes the exit code non-zero, except checks
                   named in --allow-skip.
  --allow-skip=A,B With --strict, ids that may be SKIPPED (for example --allow-skip=U2b
                   while the integration suite is still a stub).
  --help           Show this text.

Exit code: 1 when any check fails; also 1 under --strict when a check is skipped
and not allowed. Otherwise 0. Write "// gate-allow: <reason>" on a line to exempt it
from the U4 static scan.
`;

export class FlagError extends Error {}

export function parseGateArgs(argv: readonly string[]): GateFlags {
  const flags: GateFlags = {
    only: undefined,
    skipDocker: false,
    amd64: false,
    fast: false,
    strict: false,
    allowSkip: [],
    help: false,
  };
  for (const arg of argv) {
    if (arg === "--") continue;
    if (arg === "--skip-docker") flags.skipDocker = true;
    else if (arg === "--amd64") flags.amd64 = true;
    else if (arg === "--fast") flags.fast = true;
    else if (arg === "--strict") flags.strict = true;
    else if (arg === "--help" || arg === "-h") flags.help = true;
    else if (arg.startsWith("--allow-skip=")) {
      const ids = arg
        .slice("--allow-skip=".length)
        .split(",")
        .map((s) => s.trim())
        .filter((s) => s !== "");
      if (ids.length === 0)
        throw new FlagError("--allow-skip needs at least one check id, e.g. --allow-skip=U2b");
      flags.allowSkip.push(...ids);
    } else if (arg.startsWith("--only=")) {
      const ids = arg
        .slice("--only=".length)
        .split(",")
        .map((s) => s.trim())
        .filter((s) => s !== "");
      if (ids.length === 0)
        throw new FlagError("--only needs at least one check id, e.g. --only=U1,U3");
      flags.only = ids;
    } else {
      throw new FlagError(`unknown argument: ${arg}`);
    }
  }
  return flags;
}

/** "U3" selects U3a, U3b and U3c; "U3a" selects only U3a. Case-insensitive. */
export function matchesSelector(checkId: string, selector: string): boolean {
  const id = checkId.toLowerCase();
  const sel = selector.toLowerCase();
  if (id === sel) return true;
  return id.startsWith(sel) && /^[a-z]$/.test(id.slice(sel.length)) && /\d$/.test(sel);
}

export function selectChecks<T extends GateCheckId>(
  all: readonly T[],
  only: readonly string[] | undefined,
): T[] {
  if (only === undefined) return [...all];
  const unknown = only.filter((sel) => !all.some((c) => matchesSelector(c.id, sel)));
  if (unknown.length > 0) {
    throw new FlagError(
      `unknown check id(s): ${unknown.join(", ")}. Valid ids: ${all.map((c) => c.id).join(", ")}`,
    );
  }
  return all.filter((c) => only.some((sel) => matchesSelector(c.id, sel)));
}

/** True when the id was named exactly (not through a prefix such as "U3"). */
export function namedExactly(checkId: string, only: readonly string[] | undefined): boolean {
  return only?.some((sel) => sel.toLowerCase() === checkId.toLowerCase()) ?? false;
}
