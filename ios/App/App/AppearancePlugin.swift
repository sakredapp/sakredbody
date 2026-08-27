import Capacitor
import UIKit

/**
 The parts of the screen UIKit draws, not the web layer.

 ── What the status bar plugin leaves undone ──────────────────────────────

 `@capacitor/status-bar` sets the status bar's contrast and nothing else. On
 iOS the appearance a member picks also has to reach the pieces UIKit renders
 on the app's behalf: the keyboard, the text-selection callout, the scroll
 indicators, the sheet chrome, and the ground revealed by a rubber-band
 overscroll. All of those follow `overrideUserInterfaceStyle` on the window,
 and with no `UIUserInterfaceStyle` in Info.plist they follow the *system*
 instead — so a member who chose Light on a phone in night mode types into a
 black keyboard, and one who chose Dark on a bright phone gets a white one.

 ── Why the choice is written down ────────────────────────────────────────

 The window exists before the WebView has loaded, so at launch there is a
 stretch where UIKit has to be told something and only the last run knows
 what. SceneDelegate reads this back; here it is kept current.

 ── Why not just set UIUserInterfaceStyle in Info.plist ───────────────────

 That is a build-time constant. It would pin every member to one appearance,
 which is the problem rather than the fix.
 */
@objc(SakredAppearance)
public class AppearancePlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "SakredAppearance"
    public let jsName = "SakredAppearance"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "apply", returnType: CAPPluginReturnPromise)
    ]

    static let defaultsKey = "sakred.appearance.dark"

    /// What the window should be in, given what was last applied.
    static func storedStyle() -> UIUserInterfaceStyle {
        // `object(forKey:)` rather than `bool(forKey:)`: the latter answers
        // false for a key that was never written, which would put a first
        // launch in Light. Absent means "not chosen yet", and the app is dark
        // until told otherwise.
        guard let stored = UserDefaults.standard.object(forKey: defaultsKey) as? Bool else {
            return .dark
        }
        return stored ? .dark : .light
    }

    @objc func apply(_ call: CAPPluginCall) {
        let dark = call.getString("theme", "dark") != "light"

        UserDefaults.standard.set(dark, forKey: AppearancePlugin.defaultsKey)

        DispatchQueue.main.async {
            // Every window, not just the plugin's own: a keyboard or an
            // action sheet can be presented in a different one, and a single
            // window left on the system style is the one the member notices.
            for scene in UIApplication.shared.connectedScenes {
                guard let windowScene = scene as? UIWindowScene else { continue }
                for window in windowScene.windows {
                    window.overrideUserInterfaceStyle = dark ? .dark : .light
                }
            }
            call.resolve(["applied": true, "dark": dark])
        }
    }
}
