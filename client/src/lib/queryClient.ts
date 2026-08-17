import { QueryClient, QueryFunction } from "@tanstack/react-query";
import { apiFetch } from "./apiFetch";

async function throwIfResNotOk(res: Response) {
  if (!res.ok) {
    const text = (await res.text()) || res.statusText;
    throw new Error(`${res.status}: ${text}`);
  }
}

export async function apiRequest(
  method: string,
  url: string,
  data?: unknown | undefined,
): Promise<Response> {
  const res = await apiFetch(url, {
    method,
    headers: data ? { "Content-Type": "application/json" } : {},
    body: data ? JSON.stringify(data) : undefined,
  });

  await throwIfResNotOk(res);
  return res;
}

type UnauthorizedBehavior = "returnNull" | "throw";
export const getQueryFn: <T>(options: {
  on401: UnauthorizedBehavior;
}) => QueryFunction<T> =
  ({ on401: unauthorizedBehavior }) =>
  async ({ queryKey }) => {
    const res = await apiFetch(queryKey.join("/"));

    if (unauthorizedBehavior === "returnNull" && res.status === 401) {
      return null;
    }

    await throwIfResNotOk(res);
    return await res.json();
  };

/**
 * `staleTime: Infinity` is a choice about who decides freshness, not a claim
 * that data never changes.
 *
 * Nothing expires on its own here: a fetch made when the app opened is kept
 * for the life of the process, and each feature says explicitly when its data
 * should be re-read. That is the right default for most of this app, where the
 * only writer is the member sitting in front of it and the mutation that
 * changed something also invalidates it.
 *
 * It is not automatically right where a *second* writer exists. Health has
 * one: the native background worker posts while the app is suspended, so the
 * database moves without any mutation in this process to invalidate anything.
 * Under this default that produces a screen showing a value that is not merely
 * stale but known to be wrong.
 *
 * The health policy is therefore stated rather than inherited — hydrate on
 * mount, on `visibilitychange`, and on Capacitor's `appStateChange`, with no
 * throttle and no dependency on the native bridge. See `hydrate()` in
 * `client/src/hooks/use-health.ts`. Any other feature that gains an
 * out-of-process writer needs the same explicit decision; the global default
 * will not make it for them.
 */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      queryFn: getQueryFn({ on401: "throw" }),
      refetchInterval: false,
      refetchOnWindowFocus: false,
      staleTime: Infinity,
      retry: false,
    },
    mutations: {
      retry: false,
    },
  },
});
