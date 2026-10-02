import { handleSelectLeague } from "../../../../lib/server/api-handlers";
import { toResponse } from "../../../../lib/server/http";

export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<Response> {
  return toResponse(handleSelectLeague(await request.text()));
}
