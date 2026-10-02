import { spawn } from "node:child_process";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { loadLocalEnv } from "./lib/dotenv.js";
import { lanIPv4 } from "./lib/lan.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ip = lanIPv4(os.networkInterfaces());
if (ip === undefined) {
  process.stderr.write("dev:lan: no LAN IPv4 address found. Connect to Wi-Fi and try again.\n");
  process.exit(1);
}
const { dataDir } = loadLocalEnv(root);
const port = process.env["PORT"] ?? "3000";
process.stdout.write(`Open http://${ip}:${port} on your phone (same Wi-Fi)\n`);
process.stdout.write(`dev:lan: DATA_DIR=${dataDir}\n`);
const child = spawn(
  "pnpm",
  ["-C", "apps/web", "exec", "next", "dev", "--webpack", "-H", "0.0.0.0", "-p", port],
  {
    cwd: root,
    stdio: "inherit",
    env: { ...process.env, SIDELINE_DEV_ORIGINS: ip },
  },
);
for (const sig of ["SIGINT", "SIGTERM"] as const) process.on(sig, () => child.kill(sig));
child.on("close", (code) => process.exit(code ?? 1));
