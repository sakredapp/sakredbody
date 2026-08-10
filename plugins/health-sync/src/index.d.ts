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

/**
 * What the home-screen widget renders.
 *
 * A widget is a separate process with no network of its own and no access to
 * the WebView — it can only read a small blob the app leaves behind in shared
 * storage. So everything it will ever show has to be written here, already
 * formatted, at the moment the app knows it.
 */
export interface WidgetSnapshot {
  /** "Day 4 — Liver Clear", or "Today" when no protocol is running. */
  title: string;
  /** "5 practices today." */
  practices: string;
  /** "6h 40m" — omitted entirely when we have no sleep for last night. */
  sleep?: string | null;
  /** "under your usual" — only ever set alongside sleep. */
  sleepNote?: string | null;
  /** ISO 8601. The widget greys itself out when this goes stale. */
  updatedAt: string;
}

export interface HealthSyncPlugin {
  /** Write the widget's data and ask the OS to redraw it. */
  updateWidget(snapshot: WidgetSnapshot): Promise<{ written: boolean }>;
  configure(options: HealthSyncConfigureOptions): Promise<{ configured: boolean }>;
  /** Registers the observers (iOS) or the periodic worker (Android). */
  enableBackgroundSync(): Promise<{ enabled: boolean; reason?: string }>;
  disableBackgroundSync(): Promise<{ enabled: boolean }>;
  status(): Promise<HealthSyncStatus>;
  /** Runs the native path once, in the foreground. For testing it on a device. */
  syncNow(): Promise<{ ran: boolean; posted?: number; reason?: string }>;
}

export declare const HealthSync: HealthSyncPlugin;
