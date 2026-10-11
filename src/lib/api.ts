export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}
async function request<T>(path: string, body?: unknown, signal?: AbortSignal): Promise<T> {
  const response = await fetch(`/api${path}`, {
    method: body === undefined ? "GET" : "POST",
    credentials: "same-origin",
    cache: "no-store",
    headers:
      body === undefined ? undefined : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: signal ?? AbortSignal.timeout(55000),
  });
  const result = await response.json().catch(() => null);
  if (!response.ok)
    throw new ApiError(
      response.status,
      result?.error?.code ?? "REQUEST_FAILED",
      result?.error?.message ??
        "We could not complete this request. Please try again.",
    );
  return result as T;
}
export const apiGet = <T>(path: string) => request<T>(path);
export const apiPost = <T>(path: string, body: unknown, signal?: AbortSignal) =>
  request<T>(path, body, signal);
