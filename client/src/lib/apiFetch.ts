import { Capacitor } from "@capacitor/core";
import { Preferences } from "@capacitor/preferences";
import { apiUrl } from "./apiBase";

/**
 * The single door to /api.
 *
 * On the web this is `fetch` with `credentials: "include"` — exactly what the
 * call sites were already doing, so nothing about the browser behaviour
 * changes.
 *
 * In the native shells it does the three things the app needs and a browser
 * does not: resolve the relative path against the real origin (the bundled
 * client is served from localhost, so `/api/...` would otherwise resolve to
 * the device), announce the platform so the server knows to mint a bearer
 * token, and attach that token on subsequent requests.
 *
 * New code should call this directly. It is not, however, the only thing that
 * has to work: roughly sixty-five raw `fetch("/api/...")` calls predate it,
 * spread across the hooks, the admin components and both dashboards. Every
 * one of those works in the browser and fails silently in the app. Rewriting
 * them all would touch most of the portal at once, so `installNativeApiFetch`
 * below catches them at the boundary instead.
 */

const TOKEN_KEY = "sakred.auth.token";

/**
 * `undefined` means "not read from storage yet", distinct from `null`, which
 * means "read, and there is none". Without that distinction every anonymous
 * request re-reads storage.
 */
let cachedToken: string | null | undefined;

export async function getAuthToken(): Promise<string | null> {
  if (!Capacitor.isNativePlatform()) return null;
  if (cachedToken !== undefined) return cachedToken;
  const { value } = await Preferences.get({ key: TOKEN_KEY });
  cachedToken = value ?? null;
  return cachedToken;
}

/**
 * Persist the token handed back by /api/login or /api/register.
 *
 * NOTE: Preferences is UserDefaults on iOS and SharedPreferences on Android.
 * Both are sandboxed to the app and unreadable by other apps on a device that
 * has not been jailbroken or rooted, but neither is the Keychain/Keystore —
 * they are not hardware-backed and are included in some device backups. For a
 * ninety-day credential on a health app that is a real, if modest, exposure;
 * moving to a secure-storage plugin is the follow-up, and is why the token is
 * revocable server-side rather than self-contained.
 */
export async function setAuthToken(token: string | null): Promise<void> {
  if (!Capacitor.isNativePlatform()) return;
  cachedToken = token;
  if (token === null) {
    await Preferences.remove({ key: TOKEN_KEY });
  } else {
    await Preferences.set({ key: TOKEN_KEY, value: token });
  }
}

export const clearAuthToken = () => setAuthToken(null);

export async function apiFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const headers = new Headers(init.headers);

  if (Capacitor.isNativePlatform()) {
    // Tells /api/login to mint a token. Browsers send nothing, so the web
    // response shape is unchanged.
    headers.set("X-Client-Platform", Capacitor.getPlatform());

    const token = await getAuthToken();
    if (token) headers.set("Authorization", `Bearer ${token}`);
  }

  // Kept for the web, where it is the whole mechanism. Harmless natively: the
  // cookie the server sets cannot be stored by the WebView anyway.
  return fetch(apiUrl(path), { ...init, headers, credentials: "include" });
}

/**
 * Make every pre-existing `fetch("/api/...")` in the app work natively.
 *
 * Called once at boot, before render. On the web it returns immediately and
 * the global is never touched.
 *
 * ── Why patch the global rather than fix the call sites ───────────────────
 *
 * There are ~65 of them across the hooks, the admin components and both
 * dashboards. Converting each is mechanical but rewrites most of the portal
 * in one commit — in a tree two sessions are working in simultaneously, that
 * is the change most likely to be reverted by a bad merge, and a single
 * missed call site is an invisible failure that only shows up on a device.
 * One boundary that cannot be forgotten is the safer shape here.
 *
 * Call sites should still migrate to `apiFetch` over time; this exists so
 * that migration is not a prerequisite for shipping.
 */
export function installNativeApiFetch(): void {
  if (!Capacitor.isNativePlatform()) return;

  const original = window.fetch.bind(window);

  window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string"
      ? input
      : input instanceof URL
        ? input.href
        : input.url;

    // Resolve against the document so relative and absolute forms are judged
    // the same way. Only same-origin /api paths are ours — anything already
    // pointing at another host (Supabase storage, Google Fonts, and the
    // requests apiFetch itself makes, which are absolute by then) passes
    // through untouched.
    const resolved = new URL(url, window.location.href);
    const isOurApi =
      resolved.origin === window.location.origin &&
      resolved.pathname.startsWith("/api/");

    if (!isOurApi) return original(input as RequestInfo, init);

    const headers = new Headers(
      init?.headers ?? (input instanceof Request ? input.headers : undefined),
    );
    headers.set("X-Client-Platform", Capacitor.getPlatform());
    const token = await getAuthToken();
    if (token) headers.set("Authorization", `Bearer ${token}`);

    const target = apiUrl(resolved.pathname + resolved.search);

    // A Request object carries its own url, which is immutable — the target
    // has to be rebuilt from it rather than passed alongside it.
    if (input instanceof Request) {
      return original(new Request(target, input), { ...init, headers });
    }
    return original(target, { ...init, headers, credentials: "include" });
  };
}
