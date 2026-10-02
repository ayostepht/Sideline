import path from "node:path";
import { assertSeededDataDir } from "../lib/seed.js";

export type DataDirPlan =
  /** Start our own server on a freshly seeded temp directory. */
  | { kind: "seed" }
  /** Start our own server on a caller-supplied directory that passed validation. */
  | { kind: "given"; dataDir: string }
  /** Screenshot a server we did not start; its DATA_DIR cannot be proven. */
  | { kind: "unverified" };

/** Decides which DATA_DIR mode `pnpm screens` runs in, or throws with a clear message. */
export function planDataDir(options: {
  root: string;
  env: Record<string, string | undefined>;
  dataDirFlag: string | undefined;
  unverified: boolean;
}): DataDirPlan {
  const external = (options.env["E2E_BASE_URL"] ?? "") !== "";
  const given = options.dataDirFlag ?? options.env["DATA_DIR"];
  const hasGiven = given !== undefined && given !== "";
  if (external) {
    if (!options.unverified) {
      throw new Error(
        "E2E_BASE_URL points at a server whose DATA_DIR cannot be verified. " +
          "Unset it so screens starts its own seeded server, or pass --unverified " +
          "(screenshots then go to .screens/unverified/).",
      );
    }
    return { kind: "unverified" };
  }
  if (hasGiven) {
    const dataDir = path.resolve(given);
    assertSeededDataDir(dataDir, options.root);
    return { kind: "given", dataDir };
  }
  return { kind: "seed" };
}
