import pkg from "../../../package.json";

export const dynamic = "force-dynamic";

export function GET(): Response {
  return Response.json(
    { status: "ok", version: pkg.version, time: new Date().toISOString() },
    { status: 200, headers: { "Cache-Control": "no-store" } },
  );
}
