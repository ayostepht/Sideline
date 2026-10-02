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
export async function apiJson<T>(
  url: string,
  init?: { method?: string; body?: unknown; signal?: AbortSignal },
): Promise<ApiOutcome<T>> {
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
    return { ok: true, status: res.status, data: json as T, headers: res.headers };
  } catch {
    return {
      ok: false,
      status: 0,
      message: "Can't reach the server. Check your connection and try again.",
      headers: null,
    };
  }
}
