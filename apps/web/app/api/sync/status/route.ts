import { toResponse } from "../../../../lib/server/http";
import { getSyncStatus } from "../../../../lib/server/sync";

export const dynamic = "force-dynamic";

export function GET(): Response {
  return toResponse(getSyncStatus());
}
