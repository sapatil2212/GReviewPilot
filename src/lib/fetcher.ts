/**
 * Client-side fetch wrapper that normalizes the { success, data | error }
 * response envelope our API returns. Throws `ApiClientError` on failure
 * so call sites can `try/catch` uniformly.
 */

export class ApiClientError extends Error {
  readonly status: number;
  readonly code: string;
  readonly fields?: Record<string, string>;

  constructor(message: string, code: string, status: number, fields?: Record<string, string>) {
    super(message);
    this.name = "ApiClientError";
    this.status = status;
    this.code = code;
    this.fields = fields;
  }
}

interface Envelope<T> {
  success: boolean;
  message?: string;
  data?: T;
  error?: { code: string; message: string; fields?: Record<string, string> };
}

export async function apiFetch<T = unknown>(
  input: string,
  init?: RequestInit,
): Promise<{ data: T; message?: string }> {
  const res = await fetch(input, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });

  let body: Envelope<T> | null = null;
  try {
    body = (await res.json()) as Envelope<T>;
  } catch {
    // ignore JSON parse errors — handled below
  }

  if (!res.ok || !body?.success) {
    const err = body?.error;
    throw new ApiClientError(
      err?.message ?? `Request failed with status ${res.status}`,
      err?.code ?? "UNKNOWN_ERROR",
      res.status,
      err?.fields,
    );
  }
  return { data: body.data as T, message: body.message };
}
