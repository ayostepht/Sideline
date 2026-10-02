// Runs the production standalone server exactly as the Docker image does, without rebuilding.
// Copies .next/static and public into the standalone bundle (idempotent), then starts server.js.
import { spawn } from "node:child_process";
import { cpSync, existsSync, mkdirSync, rmSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const webDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const standaloneWeb = path.join(webDir, ".next", "standalone", "apps", "web");
const serverJs = path.join(standaloneWeb, "server.js");

if (!existsSync(serverJs)) {
  process.stderr.write(
    `Standalone build not found at ${serverJs}. Run "pnpm --filter @sideline/web build" first.\n`,
  );
  process.exit(1);
}

function sync(from, to) {
  if (!existsSync(from)) return;
  rmSync(to, { recursive: true, force: true });
  mkdirSync(path.dirname(to), { recursive: true });
  cpSync(from, to, { recursive: true });
}

sync(path.join(webDir, ".next", "static"), path.join(standaloneWeb, ".next", "static"));
sync(path.join(webDir, "public"), path.join(standaloneWeb, "public"));

const child = spawn(process.execPath, [serverJs], {
  cwd: standaloneWeb,
  stdio: "inherit",
  env: {
    ...process.env,
    NODE_ENV: "production",
    PORT: process.env.PORT ?? "3000",
    HOSTNAME: process.env.HOSTNAME ?? "127.0.0.1",
  },
});

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => child.kill(signal));
}
child.on("exit", (code, signal) => {
  process.exit(code ?? (signal ? 1 : 0));
});
