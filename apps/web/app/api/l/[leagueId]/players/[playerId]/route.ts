import { handlePlayerDetail } from "../../../../../../lib/server/api-handlers";
import { toResponse } from "../../../../../../lib/server/http";

export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  context: { params: Promise<{ leagueId: string; playerId: string }> },
): Promise<Response> {
  const { leagueId, playerId } = await context.params;
  return toResponse(handlePlayerDetail(leagueId, playerId));
}
