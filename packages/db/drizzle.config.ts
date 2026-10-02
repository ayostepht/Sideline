import { defineConfig } from "drizzle-kit";

/** Generate migrations with `pnpm --filter @sideline/db exec drizzle-kit generate`. */
export default defineConfig({
  dialect: "sqlite",
  schema: "./src/schema.ts",
  out: "./drizzle",
});
