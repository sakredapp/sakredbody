import { registerPlugin } from "@capacitor/core";

/**
 * Background health sync.
 *
 * Plain JS with no build step on purpose: this package is consumed straight
 * from the repo via a file: dependency, and adding rollup here would mean a
 * second build to keep in step with the app's.
 *
 * The web implementation is a no-op rather than a thrown error. Every method
 * is safe to call from the shared portal code, which is what lets the calling
 * side stay free of platform branches.
 */
export const HealthSync = registerPlugin("HealthSync", {
  web: () => ({
    configure: async () => ({ configured: false }),
    enableBackgroundSync: async () => ({ enabled: false, reason: "web" }),
    disableBackgroundSync: async () => ({ enabled: false }),
    status: async () => ({ enabled: false, lastRunAt: null, lastResult: null }),
    syncNow: async () => ({ ran: false, reason: "web" }),
    updateWidget: async () => ({ written: false }),
  }),
});
