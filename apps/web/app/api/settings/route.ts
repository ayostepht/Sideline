import { handleGetSettings, handlePatchSettings } from "../../../lib/server/api-handlers";
import { guardedWrite, toResponse } from "../../../lib/server/http";

export const dynamic = "force-dynamic";

export function GET(): Response {
  return toResponse(handleGetSettings());
}

export async function PATCH(request: Request): Promise<Response> {
  return guardedWrite(request, (raw) => handlePatchSettings(raw));
}
