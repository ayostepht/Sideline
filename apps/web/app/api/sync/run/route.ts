import { guardedWrite } from "../../../../lib/server/http";
import { requestSync } from "../../../../lib/server/sync";

export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<Response> {
  return guardedWrite(request, (raw) => requestSync(raw));
}
