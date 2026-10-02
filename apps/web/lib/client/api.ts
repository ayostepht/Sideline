import type { z } from "zod";

type Schemas = typeof import("../../app/onboarding/_components/schemas");
export type SchemaKey = keyof Schemas;

export type ApiOutcome<T> =
  | { ok: true; status: number; data: T; headers: Headers }
  | { ok: false; status: number; message: string; headers: Headers | null };

function errorMessage(json: unknown, fallback: string): string {
  if (typeof json === "object" && json !== null && "error" in json) {
    const e = (json as { error?: unknown }).error;
    if (typeof e === "object" && e !== null && "message" in e) {
      const m = (e as { message?: unknown }).message;
      if (typeof m === "string" && m !== "") return m;
    }
  }
  return fallback;
}

/** Calls a JSON API route. Never throws: network and parse failures come back as `ok: false`. */
export async function apiJson<K extends SchemaKey>(
  url: string,
  schemaKey: K,
  init?: { method?: string; body?: unknown; signal?: AbortSignal },
): Promise<ApiOutcome<z.output<Schemas[K]>>> {
  try {
    const res = await fetch(url, {
      method: init?.method ?? "GET",
      cache: "no-store",
      ...(init?.signal ? { signal: init.signal } : {}),
      ...(init?.body !== undefined
        ? { headers: { "Content-Type": "application/json" }, body: JSON.stringify(init.body) }
        : {}),
    });
    let json: unknown = null;
    try {
      json = await res.json();
    } catch {
      json = null;
    }
    if (!res.ok) {
      return {
        ok: false,
        status: res.status,
        message: errorMessage(json, "Something went wrong. Try again."),
        headers: res.headers,
      };
    }
    const schema: z.ZodType = (await import("../../app/onboarding/_components/schemas"))[schemaKey];
    const parsed = schema.safeParse(json);
    if (!parsed.success) {
      return {
        ok: false,
        status: 502,
        message: "Got an unexpected reply from the server. Try again.",
        headers: res.headers,
      };
    }
    return {
      ok: true,
      status: res.status,
      data: parsed.data as z.output<Schemas[K]>,
      headers: res.headers,
    };
  } catch {
    return {
      ok: false,
      status: 0,
      message: "Can't reach the server. Check your connection and try again.",
      headers: null,
    };
  }
}
