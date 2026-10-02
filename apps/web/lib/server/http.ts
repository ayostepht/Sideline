export interface ApiResult {
  status: number;
  body: unknown;
  headers?: Record<string, string>;
}

export function errorResult(
  status: number,
  code: string,
  message: string,
  headers?: Record<string, string>,
): ApiResult {
  return { status, body: { error: { code, message } }, ...(headers ? { headers } : {}) };
}

export function toResponse(result: ApiResult): Response {
  return Response.json(result.body, {
    status: result.status,
    headers: { "Cache-Control": "no-store", ...result.headers },
  });
}
