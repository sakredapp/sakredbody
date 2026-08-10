export interface HealthSyncConfigureOptions {
  /**
   * Where the native side posts. The WebView's own origin is
   * capacitor://localhost, which resolves to nothing from a background task,
   * so this has to be the real API origin.
   */
  apiOrigin: string;
  /**
   * The bearer token. Passed in rather than read out of Capacitor Preferences'
   * storage by key: the key is that plugin's private contract, and a rename in
   * one of its releases would silently stop every background sync with no
   * failure anyone would see.
   */
  token: string | null;
  /** How many days back each background run re-reads. Matches the server. */
  overlapDays?: number;
}

export interface HealthSyncStatus {
  enabled: boolean;
  /** ISO 8601, or null if it has never run. */
  lastRunAt: string | null;
  /** "posted 42 values", or the error. Kept for support, not for logic. */
  lastResult: string | null;
}

export interface HealthSyncPlugin {
  configure(options: HealthSyncConfigureOptions): Promise<{ configured: boolean }>;
  /** Registers the observers (iOS) or the periodic worker (Android). */
  enableBackgroundSync(): Promise<{ enabled: boolean; reason?: string }>;
  disableBackgroundSync(): Promise<{ enabled: boolean }>;
  status(): Promise<HealthSyncStatus>;
  /** Runs the native path once, in the foreground. For testing it on a device. */
  syncNow(): Promise<{ ran: boolean; posted?: number; reason?: string }>;
}

export declare const HealthSync: HealthSyncPlugin;
