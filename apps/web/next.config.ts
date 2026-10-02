import path from "node:path";
import { fileURLToPath } from "node:url";
import type { NextConfig } from "next";

const monorepoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

const nextConfig: NextConfig = {
  output: "standalone",
  // Trace from the monorepo root so the standalone bundle includes workspace packages.
  outputFileTracingRoot: monorepoRoot,
  poweredByHeader: false,
  serverExternalPackages: ["better-sqlite3"],
  transpilePackages: ["@sideline/shared", "@sideline/db"],
};

export default nextConfig;
