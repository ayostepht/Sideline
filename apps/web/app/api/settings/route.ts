import { handleGetSettings, handlePatchSettings } from "../../../lib/server/api-handlers";
import { toResponse } from "../../../lib/server/http";

export const dynamic = "force-dynamic";

export function GET(): Response {
  return toResponse(handleGetSettings());
}

export async function PATCH(request: Request): Promise<Response> {
  return toResponse(handlePatchSettings(await request.text()));
}
