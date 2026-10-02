import path from "node:path";
import { fileURLToPath } from "node:url";
import type { NextConfig } from "next";

const monorepoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

// Minimal structural type for the webpack config Next hands us (webpack types are not a dependency).
interface WebpackConfig {
  externals?: unknown[];
  resolve: { extensionAlias?: Record<string, string[]> };
  module: { parser?: { javascript?: Record<string, unknown> } & Record<string, unknown> };
}

const nextConfig: NextConfig = {
  output: "standalone",
  // Trace from the monorepo root so the standalone bundle includes workspace packages.
  outputFileTracingRoot: monorepoRoot,
  poweredByHeader: false,
  serverExternalPackages: ["better-sqlite3"],
  // Workspace sources import siblings as "./x.js" meaning "./x.ts".
  // Turbopack (Next 16.3.8) has no extensionAlias option, so we build and run dev with webpack.
  webpack(config: WebpackConfig, { isServer }: { isServer: boolean }) {
    // serverExternalPackages misses better-sqlite3 when it is reached via a workspace package.
    if (isServer) {
      config.externals = [
        ...(config.externals ?? []),
        { "better-sqlite3": "commonjs better-sqlite3" },
      ];
    }
    config.resolve.extensionAlias = {
      ...config.resolve.extensionAlias,
      ".js": [".ts", ".tsx", ".js"],
    };
    // packages/db locates its migrations folder with new URL("../drizzle", import.meta.url).
    // Keep webpack from treating that as an asset import.
    config.module.parser = {
      ...config.module.parser,
      javascript: { ...config.module.parser?.javascript, url: false },
    };
    return config;
  },
  transpilePackages: ["@sideline/shared", "@sideline/db"],
};

export default nextConfig;
