/**
 * Next.js startup hook. Validates the environment once at boot so a bad value (for example
 * SIDELINE_GAME_CLOCK) stops the server with a message naming the variable instead of surfacing
 * later as a generic database error. Node runtime only; the edge runtime has no process.env use here.
 */
export async function register(): Promise<void> {
  if (process.env["NEXT_RUNTIME"] !== "nodejs") return;
  const { loadConfig } = await import("@sideline/shared");
  try {
    loadConfig(process.env);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    process.stderr.write(`Sideline refused to start. ${message}\n`);
    process.exit(1);
  }
}
