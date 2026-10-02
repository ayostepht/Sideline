import { handleOnboardingStatus } from "../../../../lib/server/api-handlers";
import { toResponse } from "../../../../lib/server/http";

export const dynamic = "force-dynamic";

export function GET(): Response {
  return toResponse(handleOnboardingStatus());
}
