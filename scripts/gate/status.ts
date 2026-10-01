export type CheckStatus = "PASS" | "FAIL" | "SKIPPED";

export interface StatusResult {
  status: CheckStatus;
  reason?: string;
}

/** Exit code that scripts/not-implemented.ts uses for stubs (ADR-000 item 11). */
export const STUB_EXIT_CODE = 2;
const STUB_MARKER = /not implemented until/i;

/**
 * Maps a finished command to a check status.
 *
 * Only exit 0 is PASS. Exit 2 is SKIPPED only when the output also carries the stub marker,
 * because other tools (ESLint on a fatal error) also exit 2 and that must stay a FAIL.
 */
export function mapExit(
  code: number | null,
  logTail: string,
  options: { timedOut?: boolean } = {},
): StatusResult {
  if (options.timedOut === true) return { status: "FAIL", reason: "timed out" };
  if (code === null) return { status: "FAIL", reason: "terminated by a signal" };
  if (code === 0) return { status: "PASS" };
  if (code === STUB_EXIT_CODE && STUB_MARKER.test(logTail)) {
    return { status: "SKIPPED", reason: "not implemented (stub)" };
  }
  return { status: "FAIL", reason: `exit code ${code}` };
}
