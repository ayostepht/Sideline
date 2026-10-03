import { handleLineup } from "../../../../../lib/server/api-handlers";
import { toResponse } from "../../../../../lib/server/http";

export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  context: { params: Promise<{ leagueId: string }> },
): Promise<Response> {
  const { leagueId } = await context.params;
  return toResponse(handleLineup(leagueId, new URL(request.url).searchParams));
}
