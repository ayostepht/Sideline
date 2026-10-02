import { getHealth } from "../../../lib/server/health";
import { toResponse } from "../../../lib/server/http";

export const dynamic = "force-dynamic";

export function GET(): Response {
  return toResponse(getHealth());
}
