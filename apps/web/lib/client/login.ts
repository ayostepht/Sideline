/** Pure helpers for the login form. No clock or I/O access. */

/**
 * Client side check that mirrors the server rule (`z.string().min(1).max(256)` in
 * `handleLogin`). Returns an error message or null.
 */
export function validatePassword(raw: string): string | null {
  if (raw.length === 0) return "Enter your password.";
  if (raw.length > 256) return "That password is too long.";
  return null;
}
