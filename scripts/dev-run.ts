import { spawn } from "node:child_process";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { loadLocalEnv } from "./lib/dotenv.js";

// Local helper for `pnpm run sync` and `pnpm dev:worker`: loads .env, then runs a worker script.
// Docker never uses this; the container sets its own environment.
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const [target, ...rest] = process.argv.slice(2);
const script = target === "sync" ? "sync" : target === "worker" ? "start" : undefined;
if (script === undefined) {
  process.stderr.write("usage: dev-run.ts <sync|worker> [args]\n");
  process.exit(1);
}
const { loaded, dataDir } = loadLocalEnv(root);
process.stdout.write(`dev-run: ${loaded ? "loaded .env" : "no .env found"}; DATA_DIR=${dataDir}\n`);
const child = spawn(
  "pnpm",
  ["-C", "apps/worker", "run", script, ...rest.filter((a) => a !== "--")],
  {
    cwd: root,
    stdio: "inherit",
    env: process.env,
  },
);
for (const sig of ["SIGINT", "SIGTERM"] as const) process.on(sig, () => child.kill(sig));
child.on("close", (code) => process.exit(code ?? 1));
