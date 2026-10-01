export interface GateCheckId {
  id: string;
}

export interface GateFlags {
  only: string[] | undefined;
  skipDocker: boolean;
  amd64: boolean;
  fast: boolean;
}

export class FlagError extends Error {}

export function parseGateArgs(argv: readonly string[]): GateFlags {
  const flags: GateFlags = { only: undefined, skipDocker: false, amd64: false, fast: false };
  for (const arg of argv) {
    if (arg === "--") continue;
    if (arg === "--skip-docker") flags.skipDocker = true;
    else if (arg === "--amd64") flags.amd64 = true;
    else if (arg === "--fast") flags.fast = true;
    else if (arg.startsWith("--only=")) {
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
