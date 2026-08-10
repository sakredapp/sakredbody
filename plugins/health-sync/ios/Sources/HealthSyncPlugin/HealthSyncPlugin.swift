import Foundation
import Capacitor

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

    @objc func syncNow(_ call: CAPPluginCall) {
        HealthSyncEngine.shared.runSync { result in
            call.resolve(["ran": true, "reason": result])
        }
    }
}
