import { handlePlayerNewsRefresh } from "../../../../../../../../lib/server/api-handlers";
import { guardedWrite } from "../../../../../../../../lib/server/http";

export const dynamic = "force-dynamic";

export async function POST(
  request: Request,
  context: { params: Promise<{ leagueId: string; playerId: string }> },
): Promise<Response> {
  const { leagueId, playerId } = await context.params;
  return guardedWrite(request, () => handlePlayerNewsRefresh(leagueId, playerId));
}
