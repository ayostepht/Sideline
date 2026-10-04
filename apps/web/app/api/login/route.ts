import { handleLogin, handleLogout } from "../../../lib/server/api-handlers";
import { guardedWrite } from "../../../lib/server/http";

export const dynamic = "force-dynamic";

/** T6.1 (HOST-8): logs in with APP_PASSWORD, setting the signed session cookie on success. */
export async function POST(request: Request): Promise<Response> {
  return guardedWrite(request, (raw) => handleLogin(request, raw));
}

/** T6.1 (HOST-8): logs out, clearing the session cookie. */
export async function DELETE(request: Request): Promise<Response> {
  return guardedWrite(request, () => handleLogout(request));
}
