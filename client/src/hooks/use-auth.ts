import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import type { User } from "@shared/models/auth";
import { apiFetch, clearAuthToken } from "@/lib/apiFetch";

async function fetchUser(): Promise<User | null> {
  const response = await apiFetch("/api/auth/user");

  if (response.status === 401) {
    return null;
  }

  if (!response.ok) {
    throw new Error(`${response.status}: ${response.statusText}`);
  }

  return response.json();
}

async function logout(): Promise<void> {
  /**
   * Detach the device first, while it can still authenticate.
   *
   * A push token left pointing at somebody who has signed out is how the next
   * person to hold a shared or resold phone receives their coach's messages —
   * the one notification failure that is a privacy incident rather than an
   * inconvenience. The server route for this has existed with nothing calling
   * it; nothing registers tokens yet either, so today this is a no-op that will
   * already be correct when registration is switched on.
   *
   * Before the bearer token is cleared, because the route is authenticated.
   * Never allowed to block sign-out: a member asking to be signed out is signed
   * out whether or not their device could be unregistered.
   */
  try {
    const { unregisterPushToken } = await import("@/lib/nativeNotifications");
    await unregisterPushToken();
  } catch {
    // Web build, or the module failed to load. Sign-out continues.
  }

  /**
   * And drop any tap that has not been honoured yet.
   *
   * A destination outlives the page load it was stored to survive, so without
   * this a notification tapped by the person signing out would be waiting for
   * whoever signs in next — landing them in a coach thread that was never
   * theirs. The screen would fetch under their own authorization and show them
   * nothing, but being sent there at all is the wrong answer.
   */
  try {
    const { forgetDestination } = await import("@/lib/notificationRoutes");
    await forgetDestination();
  } catch {
    // Same as above: never a reason to fail a sign-out.
  }

  // Sent while the token is still attached — the server revokes the bearer
  // row it was presented with, so the device is signed out server-side rather
  // than merely forgetting its credential locally.
  await apiFetch("/api/logout", { method: "POST" });
  await clearAuthToken();
  window.location.href = "/";
}

export function useAuth() {
  const queryClient = useQueryClient();
  const { data: user, isLoading } = useQuery<User | null>({
    queryKey: ["/api/auth/user"],
    queryFn: fetchUser,
    retry: false,
    staleTime: 1000 * 60 * 5, // 5 minutes
  });

  const logoutMutation = useMutation({
    mutationFn: logout,
    onSuccess: () => {
      queryClient.setQueryData(["/api/auth/user"], null);
    },
  });

  return {
    user,
    isLoading,
    isAuthenticated: !!user,
    logout: logoutMutation.mutate,
    isLoggingOut: logoutMutation.isPending,
  };
}
