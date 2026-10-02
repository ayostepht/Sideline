import { handleStartOnboarding } from "../../../lib/server/api-handlers";
import { guardedWrite } from "../../../lib/server/http";

export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<Response> {
  return guardedWrite(request, (raw) => handleStartOnboarding(raw));
}
