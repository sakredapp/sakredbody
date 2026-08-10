import Foundation
import Capacitor
import WidgetKit

/**
 * The bridge. All of the work is in HealthSyncEngine, which has to be callable
 * with no WebView present.
 */
@objc(HealthSyncPlugin)
public class HealthSyncPlugin: CAPPlugin, CAPBridgedPlugin {

    public let identifier = "HealthSyncPlugin"
    public let jsName = "HealthSync"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "configure", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "enableBackgroundSync", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "disableBackgroundSync", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "status", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "syncNow", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "updateWidget", returnType: CAPPluginReturnPromise),
    ]

    /**
     * Re-register the observers on every launch.
     *
     * `load()` runs on a background launch too, which is the point. An
     * HKObserverQuery does not survive process death, and iOS only delivers to
     * a query that is registered right now — so a plugin that registers once
     * when the member first grants access works perfectly until the first time
     * iOS kills the app, and then silently never again.
     */
    override public func load() {
        guard HealthSyncEngine.shared.isEnabled else { return }
        HealthSyncEngine.shared.enableBackgroundDelivery { _, _ in }
    }

    @objc func configure(_ call: CAPPluginCall) {
        guard let origin = call.getString("apiOrigin"), !origin.isEmpty else {
            call.reject("apiOrigin is required.")
            return
        }
        HealthSyncEngine.shared.configure(
            apiOrigin: origin,
            token: call.getString("token"),
            overlapDays: call.getInt("overlapDays") ?? 7
        )
        call.resolve(["configured": true])
    }

    @objc func enableBackgroundSync(_ call: CAPPluginCall) {
        HealthSyncEngine.shared.enableBackgroundDelivery { enabled, reason in
            var result: [String: Any] = ["enabled": enabled]
            if let reason = reason { result["reason"] = reason }
            call.resolve(result)
        }
    }

    @objc func disableBackgroundSync(_ call: CAPPluginCall) {
        HealthSyncEngine.shared.disableBackgroundDelivery { _ in
            call.resolve(["enabled": false])
        }
    }

    @objc func status(_ call: CAPPluginCall) {
        call.resolve([
            "enabled": HealthSyncEngine.shared.isEnabled,
            "lastRunAt": HealthSyncEngine.shared.lastRunAt as Any,
            "lastResult": HealthSyncEngine.shared.lastResult as Any,
        ])
    }

    /**
     * Hand the widget its next frame.
     *
     * The App Group suite is the only place both processes can see. A widget
     * cannot read the app's own UserDefaults, cannot reach the WebView, and has
     * no network of its own — so whatever is written here is the entirety of
     * what it will ever be able to show.
     */
    @objc func updateWidget(_ call: CAPPluginCall) {
        guard let defaults = UserDefaults(suiteName: HealthSyncEngine.appGroup) else {
            // The App Group capability is not enabled on this target. Resolving
            // false rather than rejecting: a missing widget is not a reason for
            // a sync to report failure to the member.
            call.resolve(["written": false])
            return
        }

        var snapshot: [String: Any] = [
            "title": call.getString("title") ?? "Today",
            "practices": call.getString("practices") ?? "",
            "updatedAt": call.getString("updatedAt") ?? ISO8601DateFormatter().string(from: Date()),
        ]
        // Written only when present, so the widget can tell "no sleep data"
        // from "zero", which are different things to show.
        if let sleep = call.getString("sleep") { snapshot["sleep"] = sleep }
        if let note = call.getString("sleepNote") { snapshot["sleepNote"] = note }

        defaults.set(snapshot, forKey: HealthSyncEngine.widgetKey)

        // Ask the OS to redraw. Without this the widget keeps its last frame
        // until the system next decides to refresh it, which can be hours.
        if #available(iOS 14.0, *) {
            WidgetCenter.shared.reloadAllTimelines()
        }

        call.resolve(["written": true])
    }

    @objc func syncNow(_ call: CAPPluginCall) {
        HealthSyncEngine.shared.runSync { result in
            call.resolve(["ran": true, "reason": result])
        }
    }
}
